import { Injectable } from '@nestjs/common';
import {
  suggestDocNo,
  type AttachmentDTO,
  type CreatePlanInput,
  type MatrixDTO,
  type MatrixGroupBy,
  type PlanDTO,
  type UpdatePlanInput,
} from '@tmt/shared';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { AppException, conflict, unprocessable } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { purgeCollab } from '../collab/attachments.queries.js';
import { StorageService } from '../storage/storage.service.js';
import { UploadService, type MultipartFile } from '../storage/upload.service.js';
import {
  assertPlanEditable,
  assertReleaseInProject,
  BULK_TX,
  buildPlanDTOs,
  getPlanInProject,
  lockEditablePlan,
} from './execution.queries.js';
import { buildPlanMatrix } from './matrix.js';
import { assertMultipart } from './http-files.js';

/** Unique index of `(project_id, doc_no)`. */
const DOC_NO_KEY = 'test_plans_project_id_doc_no_key';
const SIGNED_COPY_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg']);

function docNoTaken(docNo: string | undefined) {
  return conflict('DOC_NO_TAKEN', `Doc no. ${docNo} is already used in this project`);
}

/** Test plans: CRUD, document numbers, completion lock, matrix and the signed copy. */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
    private readonly uploads: UploadService,
  ) {}

  /** Plans of the project, newest first (optionally of one release). */
  async list(projectId: number, releaseId?: number): Promise<PlanDTO[]> {
    const rows = await this.prisma.db.testPlan.findMany({
      where: { projectId, ...(releaseId !== undefined && { releaseId }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return buildPlanDTOs(this.prisma.db, rows);
  }

  async get(projectId: number, planId: number): Promise<PlanDTO> {
    const plan = await getPlanInProject(this.prisma.db, projectId, planId);
    return (await buildPlanDTOs(this.prisma.db, [plan]))[0]!;
  }

  /** Next document number of the project pattern (highest sequence with that prefix + 1). */
  async suggestDocNo(projectId: number, now = new Date()): Promise<{ docNo: string }> {
    const project = await this.prisma.db.project.findUnique({
      where: { id: projectId },
      select: { docNoPattern: true },
    });
    const existing = await this.prisma.db.testPlan.findMany({
      where: { projectId },
      select: { docNo: true },
    });
    return {
      docNo: suggestDocNo(
        existing.map((e) => e.docNo),
        now,
        project?.docNoPattern || this.config.defaultDocNoPattern,
      ),
    };
  }

  async create(ctx: ProjectContext, me: AuthUser, input: CreatePlanInput): Promise<PlanDTO> {
    const db = this.prisma.db;
    await assertReleaseInProject(db, ctx.id, input.releaseId);
    const templateId = await this.normalizeTemplateId(ctx.id, input.templateId);
    let planId: number;
    try {
      planId = await db.$transaction(async (tx) => {
        const p = await tx.testPlan.create({
          data: {
            projectId: ctx.id,
            releaseId: input.releaseId ?? null,
            docNo: input.docNo,
            title: input.title,
            purpose: input.purpose ?? null,
            testMethod: input.testMethod ?? null,
            judgementCriteria: input.judgementCriteria ?? null,
            rawDataPath: input.rawDataPath ?? null,
            templateId: templateId ?? null,
            createdById: me.id,
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'plan',
          entityId: p.id,
          action: 'created',
          summary: `Created test plan ${p.docNo} ${p.title}`,
        });
        return p.id;
      });
    } catch (e) {
      if (isUniqueViolation(e, DOC_NO_KEY)) throw docNoTaken(input.docNo);
      throw e;
    }
    return this.get(ctx.id, planId);
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    planId: number,
    input: UpdatePlanInput,
  ): Promise<PlanDTO> {
    const db = this.prisma.db;
    const plan = await getPlanInProject(db, ctx.id, planId);
    assertPlanEditable(plan);
    await assertReleaseInProject(db, ctx.id, input.releaseId);
    const templateId = await this.normalizeTemplateId(ctx.id, input.templateId);
    try {
      await db.$transaction(async (tx) => {
        await lockEditablePlan(tx, plan.id);
        await tx.testPlan.update({
          where: { id: plan.id },
          data: {
            ...(input.releaseId !== undefined && { releaseId: input.releaseId }),
            ...(input.docNo !== undefined && { docNo: input.docNo }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.purpose !== undefined && { purpose: input.purpose }),
            ...(input.testMethod !== undefined && { testMethod: input.testMethod }),
            ...(input.judgementCriteria !== undefined && {
              judgementCriteria: input.judgementCriteria,
            }),
            ...(input.rawDataPath !== undefined && { rawDataPath: input.rawDataPath }),
            ...(templateId !== undefined && { templateId }),
            ...(input.overallJudgement !== undefined && {
              overallJudgement: input.overallJudgement,
            }),
            ...(input.judgementNote !== undefined && { judgementNote: input.judgementNote }),
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'plan',
          entityId: plan.id,
          action: 'updated',
          summary: `Updated test plan ${input.docNo ?? plan.docNo}`,
          data: input,
        });
      });
    } catch (e) {
      if (isUniqueViolation(e, DOC_NO_KEY)) throw docNoTaken(input.docNo);
      throw e;
    }
    return this.get(ctx.id, plan.id);
  }

  /** Deletes the plan with its runs, results and their comments/attachments (files included). */
  async remove(ctx: ProjectContext, me: AuthUser, planId: number): Promise<void> {
    const db = this.prisma.db;
    const plan = await getPlanInProject(db, ctx.id, planId);
    assertPlanEditable(plan);
    const keys = await db.$transaction(async (tx) => {
      await lockEditablePlan(tx, plan.id);
      const runCases = await tx.runCase.findMany({
        where: { run: { planId: plan.id } },
        select: { id: true },
      });
      // Comments/attachments are polymorphic (no FK): remove them with the plan.
      const removed = [
        ...(await purgeCollab(
          tx,
          'run_case',
          runCases.map((r) => r.id),
        )),
        ...(await purgeCollab(tx, 'plan', [plan.id])),
      ];
      await tx.testPlan.delete({ where: { id: plan.id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'plan',
        entityId: plan.id,
        action: 'deleted',
        summary: `Deleted test plan ${plan.docNo} ${plan.title}`,
      });
      return removed;
    }, BULK_TX);
    await this.storage.removeMany(keys);
  }

  /** Completes the plan: its runs and results become read-only until a lead reopens it. */
  async complete(ctx: ProjectContext, me: AuthUser, planId: number): Promise<PlanDTO> {
    const plan = await getPlanInProject(this.prisma.db, ctx.id, planId);
    if (plan.status !== 'completed') {
      await this.prisma.db.$transaction(async (tx) => {
        await tx.testPlan.update({
          where: { id: plan.id },
          data: { status: 'completed', completedAt: new Date(), completedById: me.id },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'plan',
          entityId: plan.id,
          action: 'completed',
          summary: `Completed test plan ${plan.docNo} — results locked`,
        });
      });
    }
    return this.get(ctx.id, plan.id);
  }

  async reopen(ctx: ProjectContext, me: AuthUser, planId: number): Promise<PlanDTO> {
    const plan = await getPlanInProject(this.prisma.db, ctx.id, planId);
    if (plan.status === 'completed') {
      await this.prisma.db.$transaction(async (tx) => {
        await tx.testPlan.update({
          where: { id: plan.id },
          data: { status: 'in_progress', completedAt: null, completedById: null },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'plan',
          entityId: plan.id,
          action: 'reopened',
          summary: `Reopened test plan ${plan.docNo}`,
        });
      });
    }
    return this.get(ctx.id, plan.id);
  }

  async matrix(projectId: number, planId: number, groupBy: MatrixGroupBy): Promise<MatrixDTO> {
    const plan = await getPlanInProject(this.prisma.db, projectId, planId);
    const m = await buildPlanMatrix(this.prisma.db, plan.id, groupBy);
    return { groupBy: m.groupBy, groups: m.groups, rows: m.rows };
  }

  /** Attaches (or replaces) the scanned, hand-signed report — completed plans only. */
  async uploadSignedCopy(
    ctx: ProjectContext,
    me: AuthUser,
    planId: number,
    req: Pick<Request, 'is'>,
    file: MultipartFile | undefined,
  ): Promise<AttachmentDTO> {
    const db = this.prisma.db;
    const plan = await getPlanInProject(db, ctx.id, planId);
    if (plan.status !== 'completed') {
      throw conflict('PLAN_NOT_COMPLETED', 'Complete the plan before attaching the signed copy');
    }
    assertMultipart(req);
    const upload = await this.uploads.store(file, {
      allowExtensions: SIGNED_COPY_EXT,
      typeError: 'The signed copy must be a PDF, PNG or JPG file',
    });
    const oldId = plan.signedCopyId;
    const old = oldId
      ? await db.attachment.findUnique({ where: { id: oldId }, select: { storageKey: true } })
      : null;
    try {
      await db.$transaction(async (tx) => {
        const a = await tx.attachment.create({
          data: {
            projectId: ctx.id,
            entityType: 'plan',
            entityId: plan.id,
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            sizeBytes: upload.stored.sizeBytes,
            sha256: upload.stored.sha256,
            storageKey: upload.stored.storageKey,
            createdById: me.id,
          },
        });
        await tx.testPlan.update({ where: { id: plan.id }, data: { signedCopyId: a.id } });
        if (oldId) await tx.attachment.deleteMany({ where: { id: oldId } });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'plan',
          entityId: plan.id,
          action: 'signed_copy_attached',
          summary: `Attached signed copy ${upload.fileName} to ${plan.docNo}`,
        });
      });
    } catch (e) {
      await this.storage.removeMany([upload.stored.storageKey]);
      throw e;
    }
    if (old) await this.storage.removeMany([old.storageKey]);
    const dto = await this.get(ctx.id, plan.id);
    if (!dto.signedCopy)
      throw new AppException(500, 'INTERNAL_ERROR', 'Signed copy was not stored');
    return dto.signedCopy;
  }

  async deleteSignedCopy(ctx: ProjectContext, me: AuthUser, planId: number): Promise<void> {
    const db = this.prisma.db;
    const plan = await getPlanInProject(db, ctx.id, planId);
    const signedId = plan.signedCopyId;
    if (!signedId) return;
    const attachment = await db.attachment.findUnique({ where: { id: signedId } });
    await db.$transaction(async (tx) => {
      await tx.testPlan.update({ where: { id: plan.id }, data: { signedCopyId: null } });
      await tx.attachment.deleteMany({ where: { id: signedId } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'plan',
        entityId: plan.id,
        action: 'signed_copy_removed',
        summary: `Removed signed copy from ${plan.docNo}`,
      });
    });
    if (attachment) await this.storage.removeMany([attachment.storageKey]);
  }

  /** `templateId` of a plan body: null/0 clear it, other ids must be templates of the project. */
  private async normalizeTemplateId(
    projectId: number,
    templateId: number | null | undefined,
  ): Promise<number | null | undefined> {
    if (templateId === undefined) return undefined;
    if (templateId === null || templateId === 0) return null;
    const found = await this.prisma.db.reportTemplate.count({
      where: { id: templateId, projectId },
    });
    if (!found) {
      throw unprocessable('BAD_TEMPLATE', 'The report template does not belong to this project');
    }
    return templateId;
  }
}
