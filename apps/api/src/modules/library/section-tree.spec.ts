import { describe, expect, it } from '@jest/globals';
import { sectionRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { buildSectionTree, loadSectionTree } from './section-tree.js';

const rows = [
  sectionRow({ id: 1, name: 'Power', sortOrder: 2 }),
  sectionRow({ id: 2, name: 'Mode', sortOrder: 1 }),
  sectionRow({ id: 3, name: 'Cool', parentId: 2, sortOrder: 0 }),
  sectionRow({ id: 4, name: 'Heat', parentId: 2, sortOrder: 0 }),
  sectionRow({ id: 5, name: 'Orphan', parentId: 99, sortOrder: 3 }),
];

describe('buildSectionTree', () => {
  const tree = buildSectionTree(rows);

  it('orders sections depth-first by sort order, then id', () => {
    expect(tree.ordered).toEqual([2, 3, 4, 1, 5]);
  });

  it('builds paths from the root and treats orphans as roots', () => {
    expect(tree.pathOf(4)).toEqual(['Mode', 'Heat']);
    expect(tree.pathOf(5)).toEqual(['Orphan']);
    expect(tree.pathOf(null)).toEqual([]);
    expect(tree.pathOf(42)).toEqual([]);
  });

  it('returns a section with all its descendants', () => {
    expect(tree.subtreeIds(2)).toEqual([2, 3, 4]);
    expect(tree.subtreeIds(1)).toEqual([1]);
    expect(tree.subtreeIds(42)).toEqual([]);
  });

  it('survives corrupted parent cycles', () => {
    const cyclic = buildSectionTree([
      sectionRow({ id: 1, parentId: 2 }),
      sectionRow({ id: 2, parentId: 1 }),
    ]);
    expect(cyclic.ordered).toEqual([]);
    expect(cyclic.subtreeIds(1).length).toBeLessThanOrEqual(130);
  });
});

describe('loadSectionTree', () => {
  it('loads the sections of one suite in stable order', async () => {
    const { db } = createPrismaMock();
    db.section.findMany.mockResolvedValue(rows);
    const tree = await loadSectionTree(db, 2);
    expect(db.section.findMany).toHaveBeenCalledWith({
      where: { suiteId: 2 },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    expect(tree.byId.size).toBe(5);
  });
});
