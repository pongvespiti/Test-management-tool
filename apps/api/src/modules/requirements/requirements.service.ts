import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import { analyzeSheet, readUpload, type SourceWorkbook } from '@tmt/excel';
import {
  displayId,
  normalizeReference,
  type CreateRequirementInput,
  type JiraRequirementImportInput,
  type ListRequirementsQuery,
  type RequirementCaseDTO,
  type RequirementDTO,
  type RequirementImportAnalysisDTO,
  type RequirementImportInput,
  type RequirementImportPreviewDTO,
  type RequirementImportResultDTO,
  type RequirementJiraResultDTO,
  type RequirementListItemDTO,
  type UpdateRequirementInput,
} from '@tmt/shared';
import { conflict, notFound, unprocessable } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs, refOf } from '../../common/users/user-refs.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { engine } from '../imports/imports.service.js';
import { ImportUploadStore, type UploadMeta } from '../imports/import-uploads.service.js';
import { browseUrl, JiraError, type JiraIssueDetail } from '../integrations/jira-client.js';
import { jiraFailure } from '../integrations/jira-issues.service.js';
import { JiraSettingsService } from '../integrations/jira-settings.service.js';
import { notifyUsers } from '../notifications/notify.js';
import { LONG_TX } from '../library/library.errors.js';
import {
  MAX_DESCRIPTION,
  PREVIEW_ROWS,
  planRequirementImport,
  suggestFields,
} from './requirement-import.js';
import { citationIndex, keyOf, viaOfCases } from './requirement-links.js';

type Row = Prisma.RequirementGetPayload<object>;

/** Cases that count: live, not deprecated, in a suite that is not archived. */
const liveCases = (projectId: number): Prisma.TestCaseWhereInput => ({
  suite: { projectId, isArchived: false },
  isDeleted: false,
  status: { not: 'deprecated' },
});

/** Issues per Jira search when refreshing (keeps the JQL short). */
const JIRA_BATCH = 50;

/** The text changed and nobody confirmed the cases since. */
export const needsReview = (r: Pick<Row, 'textChangedAt' | 'reviewedAt'>): boolean =>
  r.textChangedAt !== null && (r.reviewedAt === null || r.reviewedAt < r.textChangedAt);

/** Title or description differs (blank and missing description are the same). */
export const textDiffers = (
  a: { title: string; description: string | null },
  b: { title: string; description: string | null },
): boolean => a.title !== b.title || (a.description ?? '') !== (b.description ?? '');

const toListItem = (r: Row, caseCount: number): RequirementListItemDTO => ({
  id: r.id,
  key: r.key,
  title: r.title,
  source: r.source,
  sourceRef: r.sourceRef,
  externalUrl: r.externalUrl,
  externalStatus: r.externalStatus,
  syncedAt: r.syncedAt ? r.syncedAt.toISOString() : null,
  caseCount,
  needsReview: needsReview(r),
  textChangedAt: r.textChangedAt ? r.textChangedAt.toISOString() : null,
  updatedAt: r.updatedAt.toISOString(),
});

const keyTaken = (key: string) =>
  conflict('REQUIREMENT_KEY_TAKEN', `A requirement with the ID ${key} already exists`);

function rethrowJira(e: unknown): never {
  if (e instanceof JiraError) throw jiraFailure(e);
  throw e;
}

/** Requirements of a project: table, links to cases, Excel import and read-only Jira import. */
@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly uploads: ImportUploadStore,
    private readonly jira: JiraSettingsService,
  ) {}

  // ------------------------------------------------------------------ read

  async list(projectId: number, q: ListRequirementsQuery): Promise<RequirementListItemDTO[]> {
    const db = this.prisma.db;
    const rows = await db.requirement.findMany({
      where: {
        projectId,
        ...(q.source && { source: q.source }),
        ...(q.q && {
          OR: [
            { key: { contains: q.q, mode: 'insensitive' } },
            { title: { contains: q.q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { key: 'asc' },
    });
    if (rows.length === 0) return [];
    const { linked, cited, live } = await this.caseLinks(db, projectId);
    return rows
      .map((r) => toListItem(r, viaOfCases(linked.get(r.id), cited.get(keyOf(r.key)), live).size))
      .toSorted((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true, sensitivity: 'base' }));
  }

  async get(projectId: number, id: number): Promise<RequirementDTO> {
    const db = this.prisma.db;
    return this.dto(db, await this.row(db, projectId, id));
  }

  // ------------------------------------------------------------------ write

  async create(
    ctx: ProjectContext,
    me: AuthUser,
    input: CreateRequirementInput,
  ): Promise<RequirementDTO> {
    const db = this.prisma.db;
    if (await this.keyExists(db, ctx.id, input.key)) throw keyTaken(input.key);
    try {
      const id = await db.$transaction(async (tx) => {
        const r = await tx.requirement.create({
          data: {
            projectId: ctx.id,
            key: input.key,
            title: input.title,
            description: input.description ?? null,
            sourceRef: input.sourceRef ?? null,
            source: 'manual',
            createdById: me.id,
          },
        });
        await this.log(tx, ctx, me, r.id, 'created', `Added requirement ${r.key} ${r.title}`);
        return r.id;
      });
      return this.get(ctx.id, id);
    } catch (e) {
      if (isUniqueViolation(e)) throw keyTaken(input.key);
      throw e;
    }
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    input: UpdateRequirementInput,
  ): Promise<RequirementDTO> {
    const db = this.prisma.db;
    const current = await this.row(db, ctx.id, id);
    if (
      current.source === 'jira' &&
      (input.key !== undefined || input.title !== undefined || input.description !== undefined)
    ) {
      throw unprocessable(
        'JIRA_MANAGED',
        'The ID, title and description of a Jira requirement come from Jira — refresh it there',
      );
    }
    if (
      input.key !== undefined &&
      keyOf(input.key) !== keyOf(current.key) &&
      (await this.keyExists(db, ctx.id, input.key))
    ) {
      throw keyTaken(input.key);
    }
    const textChanged = textDiffers(current, {
      title: input.title ?? current.title,
      description:
        input.description !== undefined ? (input.description ?? null) : current.description,
    });
    try {
      await db.$transaction(async (tx) => {
        const r = await tx.requirement.update({
          where: { id },
          data: {
            ...(input.key !== undefined && { key: input.key }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.description !== undefined && { description: input.description ?? null }),
            ...(input.sourceRef !== undefined && { sourceRef: input.sourceRef ?? null }),
            ...(textChanged && { textChangedAt: new Date() }),
          },
        });
        await this.log(tx, ctx, me, id, 'updated', `Edited requirement ${r.key}`);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw keyTaken(input.key ?? current.key);
      throw e;
    }
    if (textChanged) {
      await this.notifyTextChange(ctx, me, [{ id, key: input.key ?? current.key }]);
    }
    return this.get(ctx.id, id);
  }

  /** Confirms that the cases still fit the changed text. */
  async markReviewed(ctx: ProjectContext, me: AuthUser, id: number): Promise<RequirementDTO> {
    const db = this.prisma.db;
    const r = await this.row(db, ctx.id, id);
    await db.$transaction(async (tx) => {
      await tx.requirement.update({
        where: { id },
        data: { reviewedAt: new Date(), reviewedById: me.id },
      });
      await this.log(
        tx,
        ctx,
        me,
        id,
        'reviewed',
        `Confirmed the cases of ${r.key} after its text changed`,
      );
    });
    return this.get(ctx.id, id);
  }

  async remove(ctx: ProjectContext, me: AuthUser, id: number): Promise<void> {
    const db = this.prisma.db;
    const r = await this.row(db, ctx.id, id);
    await db.$transaction(async (tx) => {
      await tx.requirement.delete({ where: { id } });
      await this.log(tx, ctx, me, id, 'deleted', `Deleted requirement ${r.key} ${r.title}`);
    });
  }

  /** Replaces the cases linked to the requirement (cases that only cite its key stay as they are). */
  async setCases(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    caseIds: number[],
  ): Promise<RequirementDTO> {
    const db = this.prisma.db;
    const r = await this.row(db, ctx.id, id);
    const ids = [...new Set(caseIds)];
    const found = await db.testCase.count({
      where: { id: { in: ids }, suite: { projectId: ctx.id }, isDeleted: false },
    });
    if (found !== ids.length)
      throw unprocessable('BAD_CASE', 'Some cases do not exist in this project');
    await db.$transaction(async (tx) => {
      await tx.requirementCase.deleteMany({ where: { requirementId: id } });
      await tx.requirementCase.createMany({
        data: ids.map((testCaseId) => ({ requirementId: id, testCaseId })),
      });
      await this.log(
        tx,
        ctx,
        me,
        id,
        'linked',
        `Linked ${ids.length} case${ids.length === 1 ? '' : 's'} to ${r.key}`,
      );
    });
    return this.get(ctx.id, id);
  }

  // ------------------------------------------------------------------ Excel / CSV import

  async analyzeImport(
    ctx: ProjectContext,
    me: AuthUser,
    body: { uploadId: string; sheet?: string; headerRow?: number },
  ): Promise<RequirementImportAnalysisDTO> {
    const { meta, wb } = await this.uploaded(ctx, me, body.uploadId);
    const a = await engine(() =>
      analyzeSheet(wb, { sheet: body.sheet, headerRow: body.headerRow }),
    );
    const suggestions = suggestFields(a.columns);
    return {
      uploadId: meta.id,
      fileName: meta.fileName,
      sheets: a.sheets,
      sheet: a.sheet,
      headerRow: a.headerRow,
      headerCandidates: a.headerCandidates,
      columns: a.columns.map((c, i) => ({
        col: c.col,
        letter: c.letter,
        header: c.header,
        samples: c.samples,
        suggested: suggestions[i] ?? null,
      })),
      dataRowCount: a.dataRowCount,
    };
  }

  /** What the import would do with this mapping (nothing is written). */
  async previewImport(
    ctx: ProjectContext,
    me: AuthUser,
    body: RequirementImportInput,
  ): Promise<RequirementImportPreviewDTO> {
    const { plan } = await this.planImport(this.prisma.db, ctx, me, body);
    const count = (action: string) => plan.rows.filter((r) => r.action === action).length;
    return {
      create: count('create'),
      update: count('update'),
      skip: count('skip'),
      invalid: count('invalid'),
      truncated: plan.truncated,
      rows: plan.rows.slice(0, PREVIEW_ROWS).map((r) => ({
        row: r.row,
        key: r.key,
        title: r.title,
        action: r.action,
        reason: r.reason,
      })),
    };
  }

  async commitImport(
    ctx: ProjectContext,
    me: AuthUser,
    body: RequirementImportInput,
  ): Promise<RequirementImportResultDTO> {
    const { meta, wb } = await this.uploaded(ctx, me, body.uploadId);
    const changed: { id: number; key: string }[] = [];
    try {
      const result = await this.prisma.db.$transaction(async (tx) => {
        const { plan, ids } = await this.planImport(tx, ctx, me, body, { meta, wb });
        let created = 0;
        let updated = 0;
        for (const r of plan.rows) {
          if (r.action === 'create') {
            await tx.requirement.create({
              data: {
                projectId: ctx.id,
                key: r.key,
                title: r.title,
                description: r.description,
                sourceRef: r.sourceRef,
                source: 'excel',
                createdById: me.id,
              },
            });
            created += 1;
          } else if (r.action === 'update') {
            const id = ids.get(keyOf(r.key))!;
            const before = await tx.requirement.findUniqueOrThrow({
              where: { id },
              select: { title: true, description: true },
            });
            const textChanged = textDiffers(before, r);
            await tx.requirement.update({
              where: { id },
              data: {
                title: r.title,
                description: r.description,
                sourceRef: r.sourceRef,
                ...(textChanged && { textChangedAt: new Date() }),
              },
            });
            if (textChanged) changed.push({ id, key: r.key });
            updated += 1;
          }
        }
        const skipped = plan.rows.filter((r) => r.action === 'skip').length;
        const invalid = plan.rows.filter((r) => r.action === 'invalid').length;
        await this.log(
          tx,
          ctx,
          me,
          null,
          'imported',
          `Imported requirements from ${meta.fileName}: ${created} new, ${updated} updated`,
          { created, updated, skipped, invalid },
        );
        return { created, updated, skipped, invalid };
      }, LONG_TX);
      await this.notifyTextChange(ctx, me, changed);
      return result;
    } catch (e) {
      // Another import added one of the keys between the plan and the insert.
      if (isUniqueViolation(e))
        throw conflict('REQUIREMENT_KEY_TAKEN', 'A requirement was added meanwhile — try again');
      throw e;
    }
  }

  // ------------------------------------------------------------------ Jira (read only)

  /** Reads the issues from Jira (by keys or JQL) and creates / refreshes requirements from them. */
  async importFromJira(
    ctx: ProjectContext,
    me: AuthUser,
    input: JiraRequirementImportInput,
  ): Promise<RequirementJiraResultDTO> {
    const { config, client } = await this.jira.usable(ctx.id);
    const wanted = input.keys ? [...new Set(input.keys.map((k) => k.toUpperCase()))] : null;
    const jql = wanted ? `key in (${wanted.join(',')})` : input.jql!;
    const issues = await client.searchIssues(jql).catch(rethrowJira);
    const result = await this.saveIssues(ctx, me, config.baseUrl, issues);
    const found = new Set(issues.map((i) => i.key.toUpperCase()));
    return { ...result, missing: wanted ? wanted.filter((k) => !found.has(k)) : [] };
  }

  /** Refreshes title, description and status of every requirement that came from Jira. */
  async syncJira(ctx: ProjectContext, me: AuthUser): Promise<RequirementJiraResultDTO> {
    const { config, client } = await this.jira.usable(ctx.id);
    const rows = await this.prisma.db.requirement.findMany({
      where: { projectId: ctx.id, source: 'jira' },
      select: { key: true },
    });
    const keys = rows.map((r) => r.key.toUpperCase());
    const issues: JiraIssueDetail[] = [];
    for (let i = 0; i < keys.length; i += JIRA_BATCH) {
      const batch = keys.slice(i, i + JIRA_BATCH);
      issues.push(...(await client.searchIssues(`key in (${batch.join(',')})`).catch(rethrowJira)));
    }
    const result = await this.saveIssues(ctx, me, config.baseUrl, issues);
    const found = new Set(issues.map((i) => i.key.toUpperCase()));
    return { ...result, missing: keys.filter((k) => !found.has(k)) };
  }

  /** Upserts requirements from Jira issues; Jira is the authority for the ones it provides. */
  private async saveIssues(
    ctx: ProjectContext,
    me: AuthUser,
    baseUrl: string,
    issues: JiraIssueDetail[],
  ): Promise<{ created: number; updated: number }> {
    const changed: { id: number; key: string }[] = [];
    const result = await this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.requirement.findMany({
        where: { projectId: ctx.id },
        select: { id: true, key: true, title: true, description: true },
      });
      const byKey = new Map(existing.map((r) => [keyOf(r.key), r.id]));
      const before = new Map(existing.map((r) => [r.id, r]));
      const now = new Date();
      let created = 0;
      let updated = 0;
      for (const issue of issues) {
        const key = normalizeReference(issue.key);
        const data = {
          title: (issue.summary ?? key).slice(0, 500),
          description: issue.description ? issue.description.slice(0, MAX_DESCRIPTION) : null,
          source: 'jira' as const,
          externalUrl: browseUrl(baseUrl, issue.key),
          externalStatus: issue.statusName,
          syncedAt: now,
        };
        const id = byKey.get(keyOf(key));
        if (id === undefined) {
          const r = await tx.requirement.create({
            data: { projectId: ctx.id, key, createdById: me.id, ...data },
          });
          byKey.set(keyOf(key), r.id);
          created += 1;
        } else {
          const textChanged = textDiffers(before.get(id)!, data);
          await tx.requirement.update({
            where: { id },
            data: { ...data, ...(textChanged && { textChangedAt: now }) },
          });
          if (textChanged) changed.push({ id, key });
          updated += 1;
        }
      }
      await this.log(
        tx,
        ctx,
        me,
        null,
        'jira_read',
        `Read ${issues.length} issue${issues.length === 1 ? '' : 's'} from Jira: ${created} new, ${updated} refreshed`,
        { created, updated },
      );
      return { created, updated };
    }, LONG_TX);
    await this.notifyTextChange(ctx, me, changed);
    return result;
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Tells the testers whose open runs contain cases of a requirement whose text just changed
   * (cases linked in the table or citing the key), so they check the cases before testing.
   */
  private async notifyTextChange(
    ctx: ProjectContext,
    me: AuthUser,
    changed: readonly { id: number; key: string }[],
  ): Promise<void> {
    if (changed.length === 0) return;
    const db = this.prisma.db;
    try {
      const { linked, cited, live } = await this.caseLinks(db, ctx.id);
      const stamp = Date.now();
      for (const r of changed) {
        const caseIds = [...viaOfCases(linked.get(r.id), cited.get(keyOf(r.key)), live).keys()];
        if (caseIds.length === 0) continue;
        const runs = await db.testRun.findMany({
          where: {
            testerId: { not: null },
            plan: { projectId: ctx.id, status: { not: 'completed' } },
            runCases: { some: { testCaseId: { in: caseIds } } },
          },
          select: { testerId: true },
        });
        const testers = [...new Set(runs.map((x) => x.testerId))];
        await notifyUsers(
          db,
          testers.map((userId) => ({
            userId,
            projectId: ctx.id,
            kind: 'requirement_changed' as const,
            message: {
              title: { key: 'requirement_changed' as const, vars: { key: r.key } },
              body: {
                key:
                  caseIds.length === 1
                    ? ('requirement_cases_one' as const)
                    : ('requirement_cases_many' as const),
                vars: { n: caseIds.length },
              },
            },
            link: `/projects/${ctx.id}/requirements`,
            dedupeKey: `reqchg:${r.id}:${stamp}`,
          })),
          me.id,
        );
      }
    } catch {
      // a notification must never fail the change
    }
  }

  private async row(db: Db, projectId: number, id: number): Promise<Row> {
    const r = await db.requirement.findFirst({ where: { id, projectId } });
    if (!r) throw notFound('Requirement', 'REQUIREMENT_NOT_FOUND');
    return r;
  }

  private async keyExists(db: Db, projectId: number, key: string): Promise<boolean> {
    return (
      (await db.requirement.count({
        where: { projectId, key: { equals: key, mode: 'insensitive' } },
      })) > 0
    );
  }

  /** Table links, citations in cases' references, and the ids of the cases that count. */
  private async caseLinks(db: Db, projectId: number) {
    const [cases, links] = await Promise.all([
      db.testCase.findMany({
        where: liveCases(projectId),
        select: { id: true, references: true },
      }),
      db.requirementCase.findMany({
        where: { requirement: { projectId } },
        select: { requirementId: true, testCaseId: true },
      }),
    ]);
    const linked = new Map<number, Set<number>>();
    for (const l of links) {
      const set = linked.get(l.requirementId) ?? new Set<number>();
      set.add(l.testCaseId);
      linked.set(l.requirementId, set);
    }
    return {
      linked,
      cited: citationIndex(cases),
      live: new Set(cases.map((c) => c.id)),
    };
  }

  private async dto(db: Db, r: Row): Promise<RequirementDTO> {
    const { linked, cited, live } = await this.caseLinks(db, r.projectId);
    const via = viaOfCases(linked.get(r.id), cited.get(keyOf(r.key)), live);
    const cases = await db.testCase.findMany({
      where: { id: { in: [...via.keys()] } },
      orderBy: [{ suite: { sortOrder: 'asc' } }, { suiteId: 'asc' }, { seq: 'asc' }],
      select: {
        id: true,
        seq: true,
        title: true,
        suite: { select: { id: true, name: true, prefix: true } },
      },
    });
    const users = await loadUserRefs(db, [r.createdById]);
    const caseDtos: RequirementCaseDTO[] = cases.map((c) => ({
      id: c.id,
      displayId: displayId(c.suite.prefix, c.seq),
      title: c.title,
      suite: { id: c.suite.id, name: c.suite.name },
      via: via.get(c.id)!,
    }));
    return {
      ...toListItem(r, caseDtos.length),
      projectId: r.projectId,
      description: r.description,
      cases: caseDtos,
      createdBy: refOf(users, r.createdById),
      createdAt: r.createdAt.toISOString(),
    };
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

  private async planImport(
    db: Db,
    ctx: ProjectContext,
    me: AuthUser,
    body: RequirementImportInput,
    loaded?: { meta: UploadMeta; wb: SourceWorkbook },
  ) {
    const { wb } = loaded ?? (await this.uploaded(ctx, me, body.uploadId));
    if (!wb.hasSheet(body.sheet))
      throw unprocessable('SHEET_NOT_FOUND', `Sheet "${body.sheet}" was not found in the file`);
    const existing = await db.requirement.findMany({
      where: { projectId: ctx.id },
      select: { id: true, key: true, source: true },
    });
    const ids = new Map(existing.map((r) => [keyOf(r.key), r.id]));
    const locked = new Set(existing.filter((r) => r.source === 'jira').map((r) => keyOf(r.key)));
    const plan = planRequirementImport(wb.grid(body.sheet), body, new Set(ids.keys()), locked);
    return { plan, ids };
  }

  private log(
    tx: Db,
    ctx: ProjectContext,
    me: AuthUser,
    entityId: number | null,
    action: string,
    summary: string,
    data?: Record<string, unknown>,
  ) {
    return this.activity.log(tx, {
      projectId: ctx.id,
      userId: me.id,
      entityType: 'requirement',
      entityId,
      action,
      summary,
      data,
    });
  }
}
