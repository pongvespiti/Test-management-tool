import type {
  Attachment,
  Defect,
  Project,
  Release,
  Section,
  Suite,
  TestCase,
  TestPlan,
  User,
} from '@tmt/database';
import { AppConfig } from '../../src/config/app-config.js';
import type { AuthUser, ProjectContext } from '../../src/common/types/auth.js';
import type { jest } from '@jest/globals';
import type { ReportTemplate, RunCase, RunCaseResult, TestRun } from '@tmt/database';
import type { ProjectIntegration } from '@tmt/database';

const T0 = new Date('2026-01-15T08:00:00.000Z');

/** Validated configuration with test defaults (no real database is contacted in unit tests). */
export function unitConfig(env: Record<string, string> = {}): AppConfig {
  return AppConfig.fromEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://unit@localhost:5432/unit',
    LOG_LEVEL: 'silent',
    ...env,
  });
}

export function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    username: 'alice',
    displayName: 'Alice',
    isAdmin: false,
    mustChangePassword: false,
    ...overrides,
  };
}

export function projectCtx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return { id: 10, key: 'ACS', name: 'ACS Smart control', role: 'lead', ...overrides };
}

export function userRow(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: 'alice',
    displayName: 'Alice',
    email: null,
    passwordHash: 'scrypt$x',
    authProvider: 'local',
    isAdmin: false,
    isActive: true,
    mustChangePassword: false,
    failedLogins: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function projectRow(overrides: Partial<Project> = {}): Project {
  return {
    id: 10,
    key: 'ACS',
    name: 'ACS Smart control',
    description: null,
    docNoPattern: '{YY}TR-TEAM-{MM}-{SEQ}',
    isArchived: false,
    requireCaseReview: false,
    nextDefectSeq: 1,
    nextSessionSeq: 1,
    envDimensions: [],
    createdById: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function releaseRow(overrides: Partial<Release> = {}): Release {
  return {
    id: 5,
    projectId: 10,
    name: 'FW 2.4.0',
    description: null,
    startDate: null,
    endDate: null,
    status: 'planned',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function suiteRow(overrides: Partial<Suite> = {}): Suite {
  return {
    id: 2,
    projectId: 10,
    name: 'Modbus system test',
    prefix: 'MBS',
    description: null,
    topic: null,
    fieldDefs: [],
    envTemplate: [],
    nextSeq: 1,
    sortOrder: 0,
    isArchived: false,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function sectionRow(overrides: Partial<Section> = {}): Section {
  return {
    id: 1,
    suiteId: 2,
    parentId: null,
    name: 'Power',
    code: null,
    sortOrder: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function caseRow(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 100,
    suiteId: 2,
    sectionId: null,
    seq: 36,
    code: null,
    title: 'Power ON from app',
    caseType: 'Normal',
    status: 'ready',
    priority: 'medium',
    tags: [],
    estimateMinutes: null,
    references: null,
    template: 'text',
    steps: [],
    precondition: null,
    procedure: null,
    expected: null,
    remark: null,
    summaryGroup: null,
    custom: {},
    sortOrder: 1,
    version: 1,
    isDeleted: false,
    source: null,
    reviewerId: null,
    reviewRequestedById: null,
    reviewRequestedAt: null,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdById: 1,
    updatedById: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function planRow(overrides: Partial<TestPlan> = {}): TestPlan {
  return {
    id: 7,
    projectId: 10,
    releaseId: null,
    docNo: '26TR-TEAM-10-001',
    title: 'FW 2.4 system test',
    purpose: null,
    testMethod: null,
    judgementCriteria: null,
    rawDataPath: null,
    startDate: null,
    dueDate: null,
    overallJudgement: null,
    judgementNote: null,
    status: 'draft',
    completedAt: null,
    completedById: null,
    templateId: null,
    signedCopyId: null,
    createdById: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function defectRow(overrides: Partial<Defect> = {}): Defect {
  return {
    id: 30,
    projectId: 10,
    seq: 12,
    title: 'App shows wrong temperature',
    description: null,
    steps: null,
    expected: null,
    actual: null,
    severity: 'major',
    priority: 'medium',
    status: 'new',
    assigneeId: null,
    reporterId: 1,
    releaseId: null,
    foundIn: null,
    fixedIn: null,
    foundInBuildId: null,
    fixedInBuildId: null,
    environment: null,
    externalKey: null,
    externalUrl: null,
    externalStatus: null,
    externalSyncedAt: null,
    createdAt: T0,
    updatedAt: T0,
    resolvedAt: null,
    closedAt: null,
    ...overrides,
  };
}

export function attachmentRow(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: '7d0c3f5e-4a6b-4c8e-9b1a-2f3e4d5c6b7a',
    projectId: 10,
    entityType: 'defect',
    entityId: 30,
    fileName: 'screen.png',
    mimeType: 'image/png',
    sizeBytes: 2048n,
    sha256: 'a'.repeat(64),
    storageKey: 'files/2026/01/x',
    createdById: 1,
    createdAt: T0,
    ...overrides,
  };
}

export function sharedStepRow(overrides: Partial<DbSharedStep> = {}): DbSharedStep {
  return {
    id: 3,
    projectId: 10,
    name: 'Log in',
    description: null,
    steps: [{ action: 'Open the app', expected: 'Login page' }],
    version: 1,
    createdById: 1,
    updatedById: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function importRow(overrides: Partial<DbImport> = {}): DbImport {
  return {
    id: 4,
    projectId: 10,
    kind: 'cases',
    suiteId: 2,
    runId: null,
    fileName: 'cases.xlsx',
    sheet: 'Cases',
    layout: 'generic',
    stats: { created: 3 },
    createdById: 1,
    createdAt: T0,
    ...overrides,
  };
}

type DbSharedStep = import('@tmt/database').SharedStep;
type DbImport = import('@tmt/database').Import;

// ---------------------------------------------------------------- execution, templates, automation

export function runRow(overrides: Partial<TestRun> = {}): TestRun {
  return {
    id: 3,
    planId: 7,
    suiteId: 2,
    code: 'KR_01',
    scenario: null,
    environment: [],
    testerId: null,
    testedDate: null,
    dueDate: null,
    judgement: null,
    judgementNote: null,
    remark: null,
    sortOrder: 1,
    sourceRunId: null,
    buildId: null,
    createdById: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function runCaseRow(overrides: Partial<RunCase> = {}): RunCase {
  return {
    id: 50,
    runId: 3,
    testCaseId: 100,
    caseVersion: 1,
    displayId: 'MBS-036',
    code: null,
    title: 'Power ON from app',
    caseType: 'Normal',
    sectionPath: [],
    priority: 'medium',
    tags: [],
    estimateMinutes: null,
    references: null,
    template: 'text',
    precondition: null,
    procedure: null,
    expected: null,
    steps: [],
    caseRemark: null,
    summaryGroup: null,
    custom: {},
    sortOrder: 1,
    assigneeId: null,
    status: 'untested',
    actualResult: null,
    resultRemark: null,
    stepResults: null,
    executedById: null,
    executedAt: null,
    elapsedSec: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function runCaseResultRow(overrides: Partial<RunCaseResult> = {}): RunCaseResult {
  return {
    id: 900,
    runCaseId: 50,
    status: 'ok',
    actualResult: null,
    remark: null,
    stepResults: null,
    source: 'ui',
    executedById: 1,
    executedAt: T0,
    elapsedSec: null,
    ...overrides,
  };
}

export function reportTemplateRow(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    id: 4,
    projectId: 10,
    suiteId: null,
    name: 'TEAM report',
    description: null,
    attachmentId: '9b2f0a3e-1c4d-4e5f-8a6b-7c8d9e0f1a2b',
    config: { runSheet: 'RUN' },
    isDefault: false,
    createdById: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/**
 * A deep-mocked Prisma `groupBy` as a plain jest mock: its generic overloads defeat the
 * jest-mock-extended typing (`groupByMock(db.runCase.groupBy).mockResolvedValue(rows)`).
 */
export function groupByMock(fn: unknown): jest.Mock<(...args: unknown[]) => Promise<unknown>> {
  return fn as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
}

// ---------------------------------------------------------------- JUnit XML samples

/** pytest --junitxml style (one <testsuite> inside <testsuites>). */
export const PYTEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<testsuites name="pytest tests">
  <testsuite name="pytest" errors="1" failures="1" skipped="1" tests="6" time="3.15" timestamp="2026-10-27T10:00:00.000000+07:00" hostname="ci-runner">
    <testcase classname="tests.test_auth" name="test_login" time="0.50" />
    <testcase classname="tests.test_modbus" name="Read  REGISTER 40001" time="1.25">
      <failure message="AssertionError: expected 0x01">tests/test_modbus.py:12: in test_read&#10;    assert value == 1&#10;E   assert 0 == 1</failure>
    </testcase>
    <testcase classname="tests.test_modbus" name="test_ADP_003_write" time="0.25">
      <skipped type="pytest.skip" message="requires hardware">tests/test_modbus.py:20: requires hardware</skipped>
    </testcase>
    <testcase classname="tests.test_misc" name="Duplicate title" time="0.10" />
    <testcase classname="tests.test_misc" name="test_unknown_feature" time="0.20" />
    <testcase classname="tests.test_props" name="whatever name" time="0.30">
      <properties><property name="tmt_id" value="adp_006" /></properties>
      <error message="ConnectionError" type="OSError">Traceback (most recent call last): &lt;socket&gt; refused</error>
      <system-out><![CDATA[connecting to 192.168.1.20:502 <!DOCTYPE html> & more]]></system-out>
    </testcase>
  </testsuite>
</testsuites>`;

/** maven-surefire style (`<testsuite>` root, properties, CDATA stack traces). */
export const SUREFIRE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" name="com.example.app.AdapterIT" time="2.7" tests="3" errors="0" skipped="0" failures="1">
  <properties>
    <property name="java.version" value="21.0.4"/>
    <property name="tmt_id" value="ADP-005"/>
  </properties>
  <testcase name="WR-1" classname="com.example.app.AdapterIT" time="1.0"/>
  <testcase name="WR-1" classname="com.example.app.AdapterRetryIT" time="1.5">
    <failure message="expected:&lt;1&gt; but was:&lt;2&gt;" type="java.lang.AssertionError"><![CDATA[java.lang.AssertionError: expected:<1> but was:<2>
	at com.example.app.AdapterRetryIT.write(AdapterRetryIT.java:42)]]></failure>
  </testcase>
  <testcase name="loginWorks" classname="com.example.app.ADP_001Test" time="0.2"/>
</testsuite>`;

export const JUNIT_LONG_NAME = `test_${'x'.repeat(120)}`;

/** Nested suites, used with createMissing. */
export const NESTED_XML = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="Mobile App">
    <testsuite name="Login screen">
      <testcase classname="app.LoginTest" name="shows error on wrong password" time="0.4"><failure message="no error label"/></testcase>
      <testcase classname="app.LoginTest" name="remembers user" time="0.1"/>
    </testsuite>
    <testcase classname="app.Smoke" name="opens" time="0.2"/>
    <testcase classname="app.Smoke" name="opens" time="0.3"><skipped/></testcase>
    <testcase classname="app.Smoke" name="${JUNIT_LONG_NAME}"/>
  </testsuite>
  <testsuite name="">
    <testcase name="no suite name"/>
  </testsuite>
</testsuites>`;

/** Jira settings row: basic auth, certificate checks off, a (fake) sealed secret. */
export function projectIntegrationRow(
  overrides: Partial<ProjectIntegration> = {},
): ProjectIntegration {
  return {
    id: 1,
    projectId: 10,
    kind: 'jira',
    enabled: true,
    config: {
      baseUrl: 'https://jira.example',
      projectKey: 'TEAM',
      issueType: 'Defect',
      authType: 'basic',
      username: 'qa@x',
      verifyTls: false,
    },
    secretEnc: 'v1:a:b:c',
    updatedById: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}
