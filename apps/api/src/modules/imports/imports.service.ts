import { Injectable } from '@nestjs/common';
import type { Import } from '@tmt/database';
import {
  analyzeSheet,
  ImportFormatError,
  listSheets,
  readUpload,
  type SourceWorkbook,
} from '@tmt/excel';
import {
  idSchema,
  importAnalyzeSchema,
  type FieldDef,
  type ImportAnalysisDTO,
  type ImportLayout,
  type ImportPreviewDTO,
  type ImportRecordDTO,
  type ImportResultDTO,
  type ImportRunInput,
  type ImportSheetInfo,
  type UserRef,
} from '@tmt/shared';
import type { z } from 'zod';
import { AppException, badRequest, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs, refOf } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { LONG_TX } from '../library/library.errors.js';
import { fieldDefsOf } from '../library/library.mapper.js';
import { cleanFileName, extensionOf } from '../storage/mime.js';
import type { MultipartFile } from '../storage/upload.service.js';
import { applyImport } from './import-apply.js';
import { planImport, previewOf, type ImportContext } from './import-plan.js';
import { ImportUploadStore, type UploadMeta } from './import-uploads.service.js';

const IMPORT_EXTENSIONS = new Set(['xlsx', 'xlsm', 'csv']);
/** Latest import records listed. */
const RECORD_LIMIT = 50;

/** Body of `POST …/imports/analyze`: the shared analyze schema plus the target suite. */
export const analyzeImportSchema = importAnalyzeSchema.extend({ suiteId: idSchema.optional() });
export type AnalyzeImportInput = z.infer<typeof analyzeImportSchema>;

export interface UploadResult {
  uploadId: string;
  fileName: string;
  sheets: ImportSheetInfo[];
}

/** Maps engine format errors to API errors (413 / 415 / 422). */
export function importFormatError(e: { code: string; message: string }): AppException {
  const status = e.code === 'FILE_TOO_LARGE' ? 413 : e.code === 'UNSUPPORTED_FILE_TYPE' ? 415 : 422;
  return new AppException(status, e.code, e.message);
}

/** Runs engine code, turning format errors (corrupt file, missing sheet …) into API errors. */
export async function engine<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ImportFormatError) throw importFormatError(e);
    throw e;
  }
}

/** Validates the uploaded file: present, `.xlsx`/`.xlsm`/`.csv` (415 otherwise), not empty. */
export function importFile(file: MultipartFile | undefined): { fileName: string; buffer: Buffer } {
  if (!file) throw badRequest('FILE_REQUIRED', 'Choose a file to upload');
  const fileName = cleanFileName(file.originalname, 'import.xlsx');
  const ext = extensionOf(fileName);
  if (!IMPORT_EXTENSIONS.has(ext)) {
    throw new AppException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      ext === 'xls'
        ? 'Old .xls workbooks cannot be imported — open the file in Excel and save it as .xlsx'
        : 'Only .xlsx and .csv files can be imported',
    );
  }
  if (file.size === 0) throw badRequest('EMPTY_FILE', 'The file is empty');
  return { fileName, buffer: file.buffer };
}

export function toImportRecordDTO(
  i: Import & {
    suite: { id: number; name: string } | null;
    run: { id: number; code: string } | null;
  },
  users: Map<number, UserRef>,
): ImportRecordDTO {
  return {
    id: i.id,
    kind: i.kind,
    suite: i.suite ? { id: i.suite.id, name: i.suite.name } : null,
    run: i.run ? { id: i.run.id, code: i.run.code } : null,
    fileName: i.fileName,
    sheet: i.sheet,
    layout: (i.layout as ImportLayout | null) ?? null,
    stats: (i.stats ?? {}) as Record<string, number>,
    createdBy: refOf(users, i.createdById),
    createdAt: i.createdAt.toISOString(),
  };
}

/** Excel/CSV import wizard: upload, analyze, preview, commit and the import history. */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: ImportUploadStore,
    private readonly activity: ActivityService,
  ) {}

  /** Stores the file for 2 hours (bound to project and user) and lists its sheets. */
  async upload(
    ctx: ProjectContext,
    me: AuthUser,
    file: MultipartFile | undefined,
  ): Promise<UploadResult> {
    await this.uploads.cleanup().catch(() => 0);
    const { fileName, buffer } = importFile(file);
    const wb = await engine(() => readUpload(buffer, fileName));
    const sheets = await engine(() => listSheets(wb));
    const meta = await this.uploads.save({ projectId: ctx.id, userId: me.id, fileName }, buffer);
    this.uploads.cacheWorkbook(meta.id, wb);
    return { uploadId: meta.id, fileName, sheets };
  }

  /** Detects sheet, header row, layout and the column mapping (against the suite's fields). */
  async analyze(
    ctx: ProjectContext,
    me: AuthUser,
    body: AnalyzeImportInput,
  ): Promise<ImportAnalysisDTO> {
    let fieldDefs: FieldDef[] | undefined;
    if (body.suiteId !== undefined) {
      const suite = await this.prisma.db.suite.findFirst({
        where: { id: body.suiteId, projectId: ctx.id },
      });
      if (!suite) throw unprocessable('BAD_SUITE', 'The suite does not belong to this project');
      fieldDefs = fieldDefsOf(suite);
    }
    const { meta, wb } = await this.uploaded(ctx, me, body.uploadId);
    const analysis = await engine(() =>
      analyzeSheet(wb, { sheet: body.sheet, headerRow: body.headerRow, fieldDefs }),
    );
    return { uploadId: meta.id, fileName: meta.fileName, ...analysis };
  }

  /** What the import would do with this mapping (nothing is written). */
  async preview(
    ctx: ProjectContext,
    me: AuthUser,
    body: ImportRunInput,
  ): Promise<ImportPreviewDTO> {
    const ic = await this.context(ctx, me, body);
    return previewOf(await planImport(this.prisma.db, ic));
  }

  /** Plans (suite row locked) and applies the import in one transaction. */
  async commit(ctx: ProjectContext, me: AuthUser, body: ImportRunInput): Promise<ImportResultDTO> {
    const ic = await this.context(ctx, me, body);
    return this.prisma.db.$transaction(
      async (tx) => applyImport(tx, this.activity, ic, await planImport(tx, ic, true)),
      LONG_TX,
    );
  }

  /** Latest 50 imports of the project (Excel and JUnit), newest first. */
  async list(projectId: number): Promise<ImportRecordDTO[]> {
    const db = this.prisma.db;
    const rows = await db.import.findMany({
      where: { projectId },
      include: {
        suite: { select: { id: true, name: true } },
        run: { select: { id: true, code: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RECORD_LIMIT,
    });
    const users = await loadUserRefs(
      db,
      rows.map((r) => r.createdById),
    );
    return rows.map((r) => toImportRecordDTO(r, users));
  }

  private async context(
    ctx: ProjectContext,
    me: AuthUser,
    body: ImportRunInput,
  ): Promise<ImportContext> {
    const { meta, wb } = await this.uploaded(ctx, me, body.uploadId);
    return { projectId: ctx.id, role: ctx.role, userId: me.id, fileName: meta.fileName, wb, body };
  }

  /** The caller's upload and its parsed workbook (cached between wizard steps). */
  private async uploaded(
    ctx: ProjectContext,
    me: AuthUser,
    uploadId: string,
  ): Promise<{ meta: UploadMeta; wb: SourceWorkbook }> {
    const meta = await this.uploads.get(uploadId, { projectId: ctx.id, userId: me.id });
    let wb = this.uploads.cachedWorkbook(meta.id);
    if (!wb) {
      const buffer = await this.uploads.read(meta);
      wb = await engine(() => readUpload(buffer, meta.fileName));
      this.uploads.cacheWorkbook(meta.id, wb);
    }
    return { meta, wb };
  }
}
