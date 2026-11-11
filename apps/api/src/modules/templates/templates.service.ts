import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import {
  checkTemplate,
  placeholderReference,
  TemplateError,
  type PlaceholderReference,
} from '@tmt/excel';
import type {
  TemplateCheckDTO,
  TemplateDTO,
  TemplateFieldsInput,
  UpdateTemplateInput,
} from '@tmt/shared';
import type { Request } from 'express';
import { AppException, notFound, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { assertMultipart } from '../execution/http-files.js';
import { StorageService } from '../storage/storage.service.js';
import { UploadService, type MultipartFile } from '../storage/upload.service.js';
import { templateContext } from './report-data.js';
import {
  BUILT_IN_TEMPLATE,
  builtInTemplateDTO,
  templateConfigOf,
  toTemplateDTO,
} from './templates.mapper.js';
import {
  assertSuiteInProject,
  builtInTemplatePath,
  getTemplateInProject,
  listProjectTemplates,
  looksLikeXlsx,
} from './templates.queries.js';

const XLSX_ONLY = new Set(['xlsx']);

/** A template ready for rendering (plan export, template check). */
export interface ResolvedTemplate {
  id: number;
  name: string;
  fileName: string;
  runSheet: string | null;
  builtIn: boolean;
  buffer: Buffer;
}

/** Template problems (broken file, missing run sheet, unsupported content) → 422 TEMPLATE_INVALID. */
export async function withTemplateErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TemplateError) {
      throw new AppException(422, 'TEMPLATE_INVALID', e.message, { reason: e.code });
    }
    throw e;
  }
}

/** Report templates of a project (ADR-002): upload, settings, download, check, resolution. */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
    private readonly uploads: UploadService,
  ) {}

  /** The built-in template first (default when the project has none), then by name. */
  async list(projectId: number): Promise<TemplateDTO[]> {
    const rows = await listProjectTemplates(this.prisma.db, projectId);
    const users = await loadUserRefs(
      this.prisma.db,
      rows.map((r) => r.t.createdById),
    );
    return [
      builtInTemplateDTO(projectId, !rows.some((r) => r.t.isDefault)),
      ...rows.map((r) => toTemplateDTO(r.t, r.fileName, users)),
    ];
  }

  async get(projectId: number, templateId: number): Promise<TemplateDTO> {
    const row = await getTemplateInProject(this.prisma.db, projectId, templateId);
    const users = await loadUserRefs(this.prisma.db, [row.t.createdById]);
    return toTemplateDTO(row.t, row.fileName, users);
  }

  async upload(
    ctx: ProjectContext,
    me: AuthUser,
    req: Pick<Request, 'is'>,
    file: MultipartFile | undefined,
    fields: TemplateFieldsInput,
  ): Promise<TemplateDTO> {
    assertMultipart(req);
    const upload = await this.uploads.store(file, {
      allowExtensions: XLSX_ONLY,
      typeError: 'Report templates must be Excel workbooks (.xlsx)',
    });
    let templateId: number;
    try {
      await assertSuiteInProject(this.prisma.db, ctx.id, fields.suiteId);
      if (!(await looksLikeXlsx(file!.buffer))) {
        throw unprocessable('BAD_TEMPLATE_FILE', 'The file is not a valid .xlsx workbook');
      }
      templateId = await this.prisma.db.$transaction(async (tx) => {
        const a = await tx.attachment.create({
          data: {
            projectId: ctx.id,
            entityType: 'template',
            entityId: null,
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            sizeBytes: upload.stored.sizeBytes,
            sha256: upload.stored.sha256,
            storageKey: upload.stored.storageKey,
            createdById: me.id,
          },
        });
        if (fields.isDefault) {
          await tx.reportTemplate.updateMany({
            where: { projectId: ctx.id, isDefault: true },
            data: { isDefault: false },
          });
        }
        const t = await tx.reportTemplate.create({
          data: {
            projectId: ctx.id,
            suiteId: fields.suiteId ?? null,
            name: fields.name,
            description: fields.description ?? null,
            attachmentId: a.id,
            config: { runSheet: fields.runSheet ?? null },
            isDefault: fields.isDefault,
            createdById: me.id,
          },
        });
        await tx.attachment.update({ where: { id: a.id }, data: { entityId: t.id } });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'template',
          entityId: t.id,
          action: 'created',
          summary: `Uploaded report template ${t.name} (${upload.fileName})`,
        });
        return t.id;
      });
    } catch (e) {
      await this.storage.removeMany([upload.stored.storageKey]);
      throw e;
    }
    return this.get(ctx.id, templateId);
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    templateId: number,
    input: UpdateTemplateInput,
  ): Promise<TemplateDTO> {
    const db = this.prisma.db;
    const row = await getTemplateInProject(db, ctx.id, templateId);
    await assertSuiteInProject(db, ctx.id, input.suiteId);
    await db.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.reportTemplate.updateMany({
          where: { projectId: ctx.id, isDefault: true, id: { not: row.t.id } },
          data: { isDefault: false },
        });
      }
      await tx.reportTemplate.update({
        where: { id: row.t.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.suiteId !== undefined && { suiteId: input.suiteId }),
          ...(input.runSheet !== undefined && {
            config: {
              ...templateConfigOf(row.t),
              runSheet: input.runSheet,
            } as Prisma.InputJsonValue,
          }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'template',
        entityId: row.t.id,
        action: 'updated',
        summary: `Updated report template ${input.name ?? row.t.name}`,
        data: input,
      });
    });
    return this.get(ctx.id, row.t.id);
  }

  /** Deletes a template; plans that used it fall back to the project default / built-in. */
  async remove(ctx: ProjectContext, me: AuthUser, templateId: number): Promise<void> {
    const row = await getTemplateInProject(this.prisma.db, ctx.id, templateId);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.reportTemplate.delete({ where: { id: row.t.id } });
      await tx.attachment.delete({ where: { id: row.t.attachmentId } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'template',
        entityId: row.t.id,
        action: 'deleted',
        summary: `Deleted report template ${row.t.name}`,
      });
    });
    await this.storage.removeMany([row.storageKey]);
  }

  /** The workbook of a template (`0` = built-in) as a stream. */
  async download(
    projectId: number,
    templateId: number,
  ): Promise<{ fileName: string; stream: Readable }> {
    if (templateId === 0) {
      const file = builtInTemplatePath();
      if (!file) throw notFound('Built-in report template', 'TEMPLATE_FILE_MISSING');
      return { fileName: BUILT_IN_TEMPLATE.fileName, stream: fs.createReadStream(file) };
    }
    const row = await getTemplateInProject(this.prisma.db, projectId, templateId);
    if (!(await this.storage.exists(row.storageKey))) {
      throw notFound('Template file', 'FILE_MISSING');
    }
    return { fileName: row.fileName, stream: this.storage.openReadStream(row.storageKey) };
  }

  /** Placeholders and sheets of a template, checked against the project's (or its suite's) fields. */
  async check(projectId: number, templateId: number): Promise<TemplateCheckDTO> {
    const suiteId =
      templateId === 0
        ? null
        : (await getTemplateInProject(this.prisma.db, projectId, templateId)).t.suiteId;
    const template = await this.resolveTemplate(projectId, { templateId });
    const context = await templateContext(this.prisma.db, projectId, suiteId);
    return withTemplateErrors(() =>
      checkTemplate(template.buffer, { runSheet: template.runSheet, ...context }),
    );
  }

  /** Placeholders available in this project's templates. */
  async placeholders(projectId: number): Promise<PlaceholderReference> {
    const { fieldDefs, envLabels, groups } = await templateContext(this.prisma.db, projectId, null);
    return placeholderReference(fieldDefs, envLabels, groups);
  }

  /**
   * The workbook for a plan export: an explicit `templateId` (0 = built-in), else the plan's
   * template, else the project default, else the built-in template.
   */
  async resolveTemplate(
    projectId: number,
    opts: { templateId?: number | null; planTemplateId?: number | null },
  ): Promise<ResolvedTemplate> {
    let id: number;
    if (opts.templateId !== undefined && opts.templateId !== null) id = opts.templateId;
    else if (opts.planTemplateId) id = opts.planTemplateId;
    else {
      const def = await this.prisma.db.reportTemplate.findFirst({
        where: { projectId, isDefault: true },
        select: { id: true },
      });
      id = def?.id ?? 0;
    }
    if (id === 0) {
      const file = builtInTemplatePath();
      if (!file) throw notFound('Built-in report template', 'TEMPLATE_FILE_MISSING');
      return {
        id: 0,
        name: BUILT_IN_TEMPLATE.name,
        fileName: BUILT_IN_TEMPLATE.fileName,
        runSheet: BUILT_IN_TEMPLATE.runSheet,
        builtIn: true,
        buffer: await fsp.readFile(file),
      };
    }
    const row = await getTemplateInProject(this.prisma.db, projectId, id);
    let buffer: Buffer;
    try {
      buffer = await this.storage.readBuffer(row.storageKey);
    } catch {
      throw notFound('Template file', 'FILE_MISSING');
    }
    return {
      id: row.t.id,
      name: row.t.name,
      fileName: row.fileName,
      runSheet: templateConfigOf(row.t).runSheet ?? null,
      builtIn: false,
      buffer,
    };
  }
}
