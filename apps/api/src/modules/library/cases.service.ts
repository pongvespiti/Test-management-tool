import { Injectable } from '@nestjs/common';
import type { Prisma, Suite, TestCase } from '@tmt/database';
import {
  normalizeText,
  type CaseRunHistoryItem,
  type CaseSearchResultDTO,
  type CaseStatus,
  type CaseVersionDTO,
  type CreateCaseInput,
  type ListCasesQuery,
  type Paged,
  type SearchCasesQuery,
  type TestCaseDTO,
  type UpdateCaseInput,
} from '@tmt/shared';
import { conflict, notFound } from '../../common/errors/app.exception.js';
import { isRecordNotFound, isUniqueViolation } from '../../common/errors/prisma-errors.js';
import { paged, pageWindow } from '../../common/http/pagination.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs, refOf } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import {
  assertSectionInSuite,
  assertSharedSteps,
  assertStatusChange,
  createStatus,
  loadReviewPolicy,
  normalizeSteps,
  reviewableChanged,
  reviewEnforced,
} from './case-rules.js';
import {
  caseFilterSql,
  caseRunHistory,
  countCases,
  orderedCases,
  searchProjectCases,
  suiteCaseDTOs,
} from './cases.queries.js';
import { CASE_CODE_UNIQUE, caseCodeTaken } from './library.errors.js';
import { cleanCustom, fieldDefsOf, rawCaseSteps } from './library.mapper.js';
import { getCaseInProject, getSuite, insertCase } from './library.queries.js';
import { insertVersions } from './review-transitions.js';
import { loadSectionTree, type SectionTree } from './section-tree.js';

function versionConflict(details?: unknown) {
  return conflict(
    'VERSION_CONFLICT',
    'Someone else changed this case — reload and try again',
    details,
  );
}

/** Test cases: list, read, create, update (optimistic version), soft delete, clone, history. */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** One page of a suite's cases in library order, with all list filters. */
  async list(projectId: number, suiteId: number, q: ListCasesQuery): Promise<Paged<TestCaseDTO>> {
    const db = this.prisma.db;
    const suite = await getSuite(db, projectId, suiteId);
    const tree = await loadSectionTree(db, suite.id);
    let sectionIds: number[] | undefined;
    if (q.sectionId !== undefined) {
      if (!tree.byId.has(q.sectionId)) throw notFound('Section', 'SECTION_NOT_FOUND');
      sectionIds = q.includeSubsections ? tree.subtreeIds(q.sectionId) : [q.sectionId];
    }
    const where = caseFilterSql(suite.id, {
      sectionIds,
      unsectioned: q.unsectioned,
      caseType: q.caseType,
      status: q.status,
      priority: q.priority,
      tag: q.tag,
      q: q.q,
    });
    const total = await countCases(db, where);
    const rows = await orderedCases(db, where, tree, pageWindow(q.page, q.pageSize));
    return paged(await suiteCaseDTOs(db, rows, suite, tree), total, q.page, q.pageSize);
  }

  /** Best matches for a free text across every active suite of the project (header search). */
  search(projectId: number, q: SearchCasesQuery): Promise<CaseSearchResultDTO> {
    return searchProjectCases(this.prisma.db, projectId, q.q, q.limit);
  }

  async get(projectId: number, caseId: number): Promise<TestCaseDTO> {
    const { c, suite } = await getCaseInProject(this.prisma.db, projectId, caseId);
    return this.toDTO(c, suite);
  }

  /** Creates a case; `ready` becomes `draft` under the review rules (see `createStatus`). */
  async create(
    ctx: ProjectContext,
    me: AuthUser,
    suiteId: number,
    input: CreateCaseInput,
  ): Promise<TestCaseDTO> {
    const db = this.prisma.db;
    const suite = await getSuite(db, ctx.id, suiteId);
    const tree = await loadSectionTree(db, suite.id);
    assertSectionInSuite(tree, input.sectionId);
    const policy = await loadReviewPolicy(db, ctx.id, ctx.role);
    const status = createStatus(input.status, policy);
    const steps = normalizeSteps(input.steps);
    await assertSharedSteps(db, ctx.id, steps);
    try {
      const created = await db.$transaction(async (tx) => {
        const c = await insertCase(tx, suite, { ...input, status, steps }, me.id);
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'test_case',
          entityId: c.id,
          action: 'created',
          summary: `Created case ${c.title}`,
        });
        return c;
      });
      return await this.toDTO(created, suite, tree);
    } catch (e) {
      if (isUniqueViolation(e, CASE_CODE_UNIQUE)) throw caseCodeTaken(input.code);
      throw e;
    }
  }

  /**
   * Updates the given fields (version +1, version row). `version` in the body must match (409
   * VERSION_CONFLICT). Under the review rules a non-lead's change of reviewable content sends a
   * ready case back to draft.
   */
  async update(
    ctx: ProjectContext,
    me: AuthUser,
    caseId: number,
    input: UpdateCaseInput,
  ): Promise<TestCaseDTO> {
    const db = this.prisma.db;
    const { c, suite } = await getCaseInProject(db, ctx.id, caseId);
    if (input.version !== undefined && input.version !== c.version) {
      throw versionConflict({ currentVersion: c.version });
    }
    if (input.sectionId !== undefined) {
      assertSectionInSuite(await loadSectionTree(db, suite.id), input.sectionId);
    }
    const policy = await loadReviewPolicy(db, ctx.id, ctx.role);
    if (input.status !== undefined) assertStatusChange(c.status, input.status, policy);
    const steps = input.steps !== undefined ? normalizeSteps(input.steps) : undefined;
    if (steps) await assertSharedSteps(db, ctx.id, steps);
    const custom =
      input.custom !== undefined ? cleanCustom(fieldDefsOf(suite), input.custom) : undefined;
    const texts = {
      precondition:
        input.precondition !== undefined ? normalizeText(input.precondition) : undefined,
      procedure: input.procedure !== undefined ? normalizeText(input.procedure) : undefined,
      expected: input.expected !== undefined ? normalizeText(input.expected) : undefined,
    };
    // A change of reviewable content sends a ready case back to draft (review required, non-lead).
    let status: CaseStatus = input.status ?? c.status;
    const backToDraft =
      status === 'ready' &&
      reviewEnforced(policy) &&
      reviewableChanged(c, {
        title: input.title,
        ...texts,
        template: input.template,
        steps,
        custom,
      });
    if (backToDraft) status = 'draft';
    const data: Prisma.TestCaseUncheckedUpdateInput = {
      ...(input.sectionId !== undefined && { sectionId: input.sectionId }),
      ...(input.code !== undefined && { code: input.code }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.caseType !== undefined && { caseType: input.caseType }),
      status,
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.estimateMinutes !== undefined && { estimateMinutes: input.estimateMinutes }),
      ...(input.references !== undefined && { references: input.references }),
      ...(input.template !== undefined && { template: input.template }),
      ...(steps !== undefined && { steps: steps as unknown as Prisma.InputJsonValue }),
      ...(texts.precondition !== undefined && { precondition: texts.precondition }),
      ...(texts.procedure !== undefined && { procedure: texts.procedure }),
      ...(texts.expected !== undefined && { expected: texts.expected }),
      ...(input.remark !== undefined && { remark: normalizeText(input.remark) }),
      ...(input.summaryGroup !== undefined && { summaryGroup: input.summaryGroup }),
      ...(custom !== undefined && { custom }),
      version: { increment: 1 },
      updatedById: me.id,
    };
    try {
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.testCase
          .update({ where: { id: c.id, version: c.version }, data })
          .catch((e: unknown) => {
            throw isRecordNotFound(e) ? versionConflict() : e;
          });
        await insertVersions(tx, [u], me.id);
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'test_case',
          entityId: u.id,
          action: 'updated',
          summary: `Updated case ${u.title} (v${u.version})${backToDraft ? ' — back to draft for review' : ''}`,
          ...(backToDraft && { data: { statusReset: 'draft' } }),
        });
        return u;
      });
      return await this.toDTO(updated, suite);
    } catch (e) {
      if (isUniqueViolation(e, CASE_CODE_UNIQUE)) throw caseCodeTaken(input.code);
      throw e;
    }
  }

  /** Soft delete: run snapshots keep their copy, the code becomes free again. */
  async remove(ctx: ProjectContext, me: AuthUser, caseId: number): Promise<void> {
    const { c } = await getCaseInProject(this.prisma.db, ctx.id, caseId);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.testCase.update({
        where: { id: c.id },
        data: { isDeleted: true, updatedById: me.id },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'test_case',
        entityId: c.id,
        action: 'deleted',
        summary: `Deleted case ${c.title}`,
      });
    });
  }

  /** Copies a case next to the original (code cleared, title " (copy)", its own review). */
  async clone(ctx: ProjectContext, me: AuthUser, caseId: number): Promise<TestCaseDTO> {
    const db = this.prisma.db;
    const { c, suite } = await getCaseInProject(db, ctx.id, caseId);
    const policy = await loadReviewPolicy(db, ctx.id, ctx.role);
    // A copy starts its own review.
    const status = createStatus(c.status === 'in_review' ? 'draft' : c.status, policy);
    const created = await db.$transaction(async (tx) => {
      const copy = await insertCase(
        tx,
        suite,
        {
          sectionId: c.sectionId,
          code: null,
          title: `${c.title} (copy)`.slice(0, 500),
          caseType: c.caseType,
          status,
          priority: c.priority,
          tags: c.tags,
          estimateMinutes: c.estimateMinutes,
          references: c.references,
          template: c.template,
          steps: rawCaseSteps(c.steps),
          precondition: c.precondition,
          procedure: c.procedure,
          expected: c.expected,
          remark: c.remark,
          summaryGroup: c.summaryGroup,
          custom: (c.custom ?? {}) as Record<string, string>,
        },
        me.id,
        { sortOrder: c.sortOrder },
      );
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'test_case',
        entityId: copy.id,
        action: 'created',
        summary: `Cloned case ${c.title}`,
        data: { from: c.id },
      });
      return copy;
    });
    return this.toDTO(created, suite);
  }

  /** Version history, newest first. */
  async versions(projectId: number, caseId: number): Promise<CaseVersionDTO[]> {
    const db = this.prisma.db;
    const { c } = await getCaseInProject(db, projectId, caseId);
    const rows = await db.testCaseVersion.findMany({
      where: { testCaseId: c.id },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
    });
    const users = await loadUserRefs(
      db,
      rows.map((r) => r.changedById),
    );
    return rows.map((r) => ({
      version: r.version,
      data: r.data as Record<string, unknown>,
      changedBy: refOf(users, r.changedById),
      changedAt: r.changedAt.toISOString(),
    }));
  }

  /** Results of the case across runs, newest first. */
  async runs(projectId: number, caseId: number): Promise<CaseRunHistoryItem[]> {
    const { c } = await getCaseInProject(this.prisma.db, projectId, caseId);
    return caseRunHistory(this.prisma.db, c.id);
  }

  private async toDTO(c: TestCase, suite: Suite, tree?: SectionTree): Promise<TestCaseDTO> {
    const db = this.prisma.db;
    const [dto] = await suiteCaseDTOs(
      db,
      [c],
      suite,
      tree ?? (await loadSectionTree(db, suite.id)),
    );
    return dto!;
  }
}
