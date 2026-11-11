import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  ATTACHMENT_ENTITY_TYPES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TEMPLATES,
  CASE_TYPES,
  COMMENT_ENTITY_TYPES,
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  IMPORT_KINDS,
  JUDGEMENTS,
  PLAN_STATUSES,
  PROJECT_ROLES,
  RELEASE_STATUSES,
  RESULT_SOURCES,
  RESULT_STATUSES,
} from '@tmt/shared';
import * as Enums from '../src/generated/prisma/enums.js';
import { ALL_TABLES } from '../src/tables.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const migrationsDir = path.join(ROOT, 'prisma', 'migrations');
const migrationSql = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => fs.readFileSync(path.join(migrationsDir, d.name, 'migration.sql'), 'utf8'))
  .join('\n');

/** `@@map("table")` of every model in the Prisma schema. */
const mappedTables = [
  ...schema.matchAll(/^model\s+\w+\s*\{[\s\S]*?@@map\("([^"]+)"\)[\s\S]*?^\}/gm),
].map((m) => m[1]);

describe('database schema contract', () => {
  it('maps every model to a snake_case table', () => {
    const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
    expect(mappedTables).toHaveLength(models.length);
    for (const table of mappedTables) expect(table).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('lists every table exactly once in ALL_TABLES (used to reset the test database)', () => {
    expect(new Set(ALL_TABLES).size).toBe(ALL_TABLES.length);
    expect([...ALL_TABLES].sort()).toEqual([...mappedTables].sort());
  });

  it('creates every table in the committed migrations', () => {
    for (const table of mappedTables) {
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it.each([
    ['ProjectRole', PROJECT_ROLES],
    ['ReleaseStatus', RELEASE_STATUSES],
    ['CaseType', CASE_TYPES],
    ['CaseStatus', CASE_STATUSES],
    ['CasePriority', CASE_PRIORITIES],
    ['CaseTemplate', CASE_TEMPLATES],
    ['PlanStatus', PLAN_STATUSES],
    ['Judgement', JUDGEMENTS],
    ['ResultStatus', RESULT_STATUSES],
    ['ResultSource', RESULT_SOURCES],
    ['DefectStatus', DEFECT_STATUSES],
    ['DefectSeverity', DEFECT_SEVERITIES],
    ['DefectPriority', DEFECT_PRIORITIES],
    ['AttachmentEntityType', ATTACHMENT_ENTITY_TYPES],
    ['CommentEntityType', COMMENT_ENTITY_TYPES],
    ['ImportKind', IMPORT_KINDS],
  ])('database enum %s mirrors the shared contract', (name, values) => {
    const dbEnum = (Enums as Record<string, Record<string, string>>)[name];
    expect(dbEnum).toBeDefined();
    expect(Object.values(dbEnum!).sort()).toEqual([...values].sort());
  });
});
