import { Injectable } from '@nestjs/common';
import type { Section } from '@tmt/database';
import type {
  CreateSectionInput,
  SectionNode,
  SectionTreeDTO,
  UpdateSectionInput,
} from '@tmt/shared';
import { conflict, notFound, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { getSuite } from './library.queries.js';
import { loadSectionTree } from './section-tree.js';

/** A section of a suite of the project (404 SECTION_NOT_FOUND otherwise). */
export async function getSectionInProject(
  db: Db,
  projectId: number,
  sectionId: number,
): Promise<Section> {
  const section = await db.section.findFirst({ where: { id: sectionId, suite: { projectId } } });
  if (!section) throw notFound('Section', 'SECTION_NOT_FOUND');
  return section;
}

/** Next free sort order among the children of `parentId` (null = top level). */
export async function nextSectionSortOrder(
  db: Db,
  suiteId: number,
  parentId: number | null,
): Promise<number> {
  const agg = await db.section.aggregate({
    where: { suiteId, parentId },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? 0) + 1;
}

const badParent = () => unprocessable('BAD_PARENT', 'Parent section is in another suite');

/** Section tree of a suite: create, rename, move/reorder and delete sections. */
@Injectable()
export class SectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Section tree of a suite with direct and total live case counts. */
  async tree(projectId: number, suiteId: number): Promise<SectionTreeDTO> {
    const suite = await getSuite(this.prisma.db, projectId, suiteId);
    return this.treeDTO(suite.id);
  }

  async create(
    ctx: ProjectContext,
    me: AuthUser,
    suiteId: number,
    input: CreateSectionInput,
  ): Promise<SectionNode> {
    const db = this.prisma.db;
    const suite = await getSuite(db, ctx.id, suiteId);
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      const parent = await getSectionInProject(db, ctx.id, parentId);
      if (parent.suiteId !== suite.id) throw badParent();
    }
    const created = await db.$transaction(async (tx) => {
      const s = await tx.section.create({
        data: {
          suiteId: suite.id,
          parentId,
          name: input.name,
          code: input.code ?? null,
          sortOrder: await nextSectionSortOrder(tx, suite.id, parentId),
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'section',
        entityId: s.id,
        action: 'created',
        summary: `Created section ${s.name} in ${suite.name}`,
      });
      return s;
    });
    return this.nodeOf(created);
  }

  /** Renames, moves (new parent, appended at its end) or reorders a section; no cycles. */
  async update(
    ctx: ProjectContext,
    me: AuthUser,
    sectionId: number,
    input: UpdateSectionInput,
  ): Promise<SectionNode> {
    const db = this.prisma.db;
    const section = await getSectionInProject(db, ctx.id, sectionId);
    let parentId = section.parentId;
    if (input.parentId !== undefined) {
      parentId = input.parentId;
      if (parentId !== null) {
        const parent = await getSectionInProject(db, ctx.id, parentId);
        if (parent.suiteId !== section.suiteId) throw badParent();
        const tree = await loadSectionTree(db, section.suiteId);
        if (tree.subtreeIds(section.id).includes(parentId)) {
          throw unprocessable('SECTION_CYCLE', 'A section cannot be moved inside itself');
        }
      }
    }
    const moved = parentId !== section.parentId;
    const updated = await db.$transaction(async (tx) => {
      const s = await tx.section.update({
        where: { id: section.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.code !== undefined && { code: input.code }),
          parentId,
          sortOrder:
            input.sortOrder ??
            (moved ? await nextSectionSortOrder(tx, section.suiteId, parentId) : section.sortOrder),
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'section',
        entityId: section.id,
        action: moved ? 'moved' : 'updated',
        summary: `${moved ? 'Moved' : 'Updated'} section ${s.name}`,
        data: input,
      });
      return s;
    });
    return this.nodeOf(updated);
  }

  /**
   * Deletes a section. A section with live cases or sub-sections is only deleted with
   * `moveContentToParent` (409 SECTION_NOT_EMPTY otherwise): its content moves to the parent.
   */
  async remove(
    ctx: ProjectContext,
    me: AuthUser,
    sectionId: number,
    moveContentToParent: boolean,
  ): Promise<void> {
    const db = this.prisma.db;
    const section = await getSectionInProject(db, ctx.id, sectionId);
    const child = await db.section.findFirst({
      where: { parentId: section.id },
      select: { id: true },
    });
    const liveCase = await db.testCase.findFirst({
      where: { sectionId: section.id, isDeleted: false },
      select: { id: true },
    });
    const hasContent = Boolean(child || liveCase);
    if (hasContent && !moveContentToParent) {
      throw conflict('SECTION_NOT_EMPTY', 'The section still has cases or sub-sections');
    }
    await db.$transaction(async (tx) => {
      await tx.section.updateMany({
        where: { parentId: section.id },
        data: { parentId: section.parentId },
      });
      await tx.testCase.updateMany({
        where: { sectionId: section.id },
        data: { sectionId: section.parentId },
      });
      await tx.section.delete({ where: { id: section.id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'section',
        entityId: section.id,
        action: 'deleted',
        summary: `Deleted section ${section.name}${hasContent ? ' (content moved up)' : ''}`,
      });
    });
  }

  private async treeDTO(suiteId: number): Promise<SectionTreeDTO> {
    const db = this.prisma.db;
    const tree = await loadSectionTree(db, suiteId);
    const groups = await db.testCase.groupBy({
      by: ['sectionId'],
      where: { suiteId, isDeleted: false },
      _count: { _all: true },
    });
    const direct = new Map<number | null, number>(groups.map((g) => [g.sectionId, g._count._all]));
    const build = (parent: number | null): SectionNode[] =>
      (tree.childrenOf.get(parent) ?? []).map((s) => {
        const children = build(s.id);
        const caseCount = direct.get(s.id) ?? 0;
        return {
          id: s.id,
          suiteId: s.suiteId,
          parentId: s.parentId,
          name: s.name,
          code: s.code,
          sortOrder: s.sortOrder,
          caseCount,
          totalCount: caseCount + children.reduce((sum, c) => sum + c.totalCount, 0),
          children,
        };
      });
    const sections = build(null);
    const unsectionedCount = direct.get(null) ?? 0;
    return {
      suiteId,
      unsectionedCount,
      total: unsectionedCount + sections.reduce((sum, n) => sum + n.totalCount, 0),
      sections,
    };
  }

  /** The section as a tree node (with counts and children). */
  private async nodeOf(s: Section): Promise<SectionNode> {
    const tree = await this.treeDTO(s.suiteId);
    const find = (nodes: SectionNode[]): SectionNode | null => {
      for (const n of nodes) {
        if (n.id === s.id) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    return (
      find(tree.sections) ?? {
        id: s.id,
        suiteId: s.suiteId,
        parentId: s.parentId,
        name: s.name,
        code: s.code,
        sortOrder: s.sortOrder,
        caseCount: 0,
        totalCount: 0,
        children: [],
      }
    );
  }
}
