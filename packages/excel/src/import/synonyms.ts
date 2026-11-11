import type { ImportLayout, ImportTarget } from '@tmt/shared';

/**
 * Canonical form used to compare headers and labels: lower-case letters/digits only
 * (Thai letters kept), so "Pre-conditions", "Pre condition" and "Precondition" compare by
 * `preconditions` / `precondition`.
 */
export function canon(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9฀-๿]+/g, '');
}

type Target = Exclude<ImportTarget, 'custom'>;

/** Generic header synonyms (team files, TestRail, Xray, Zephyr and our own library export). */
const GENERIC: Record<string, Target> = {
  // section
  category: 'section',
  section: 'section',
  sectionhierarchy: 'section',
  sectionname: 'section',
  folder: 'section',
  module: 'section',
  feature: 'section',
  testsuite: 'section',
  // section code
  sectionid: 'section_code',
  sectioncode: 'section_code',
  groupid: 'section_code',
  groupcode: 'section_code',
  // case code
  id: 'code',
  no: 'code',
  number: 'code',
  caseid: 'code',
  casecode: 'code',
  testcaseid: 'code',
  testid: 'code',
  tcid: 'code',
  tcno: 'code',
  key: 'code',
  testkey: 'code',
  issuekey: 'code',
  // title
  title: 'title',
  testcase: 'title',
  testcasename: 'title',
  testcasetitle: 'title',
  name: 'title',
  summary: 'title',
  testtopic: 'title',
  topic: 'title',
  testname: 'title',
  scenario: 'title',
  testscenario: 'title',
  // type
  type: 'type',
  testcasetype: 'type',
  casetype: 'type',
  testtype: 'type',
  // texts
  precondition: 'precondition',
  preconditions: 'precondition',
  prerequisite: 'precondition',
  prerequisites: 'precondition',
  steps: 'procedure',
  step: 'procedure',
  teststep: 'procedure',
  teststeps: 'procedure',
  procedure: 'procedure',
  testprocedure: 'procedure',
  testprocedures: 'procedure',
  action: 'procedure',
  actions: 'procedure',
  stepsstep: 'procedure',
  testscriptstepbystepstep: 'procedure',
  expectedresult: 'expected',
  expectedresults: 'expected',
  expected: 'expected',
  expectedoutcome: 'expected',
  stepsexpectedresult: 'expected',
  testscriptstepbystepexpectedresult: 'expected',
  remark: 'remark',
  remarks: 'remark',
  comment: 'remark',
  comments: 'remark',
  note: 'remark',
  notes: 'remark',
  summarygroup: 'summary_group',
  functiongroup: 'summary_group',
  reportgroup: 'summary_group',
  // v1.1: priority
  priority: 'priority',
  prio: 'priority',
  casepriority: 'priority',
  testpriority: 'priority',
  // v1.1: tags
  tags: 'tags',
  tag: 'tags',
  labels: 'tags',
  keywords: 'tags',
  // v1.1: estimate (minutes)
  estimate: 'estimate',
  est: 'estimate',
  estimation: 'estimate',
  estimated: 'estimate',
  estimatedtime: 'estimate',
  estimatemin: 'estimate',
  estimatemins: 'estimate',
  estimateminutes: 'estimate',
  timeestimate: 'estimate',
  duration: 'estimate',
  durationmin: 'estimate',
  durationmins: 'estimate',
  durationminutes: 'estimate',
  // v1.1: references (requirements, Jira keys, specs)
  reference: 'references',
  references: 'references',
  ref: 'references',
  refs: 'references',
  requirement: 'references',
  requirements: 'references',
  requirementid: 'references',
  reqid: 'references',
  req: 'references',
  jira: 'references',
  jirakey: 'references',
  jiraid: 'references',
  jiraissue: 'references',
  story: 'references',
  userstory: 'references',
  storyid: 'references',
  // execution data — never imported into the library
  actualresult: 'ignore',
  actualresults: 'ignore',
  actual: 'ignore',
  result: 'ignore',
  results: 'ignore',
  resultokngetc: 'ignore',
  testresult: 'ignore',
  judgement: 'ignore',
  judgment: 'ignore',
  overalljudgement: 'ignore',
  status: 'ignore',
  tester: 'ignore',
  testedby: 'ignore',
  testdate: 'ignore',
  testeddate: 'ignore',
  date: 'ignore',
  executedby: 'ignore',
  executedon: 'ignore',
  // TestRail bookkeeping columns
  sectiondepth: 'ignore',
  sectiondescription: 'ignore',
  createdby: 'ignore',
  createdon: 'ignore',
  updatedby: 'ignore',
  updatedon: 'ignore',
};

/** Exact mapping for the team's recognised layouts (spec §7.4). */
const LAYOUT_MAPS: Record<Exclude<ImportLayout, 'generic'>, Record<string, Target>> = {
  unit_operation: {
    category: 'section',
    no: 'code',
    testtopic: 'title',
    type: 'type',
    precondition: 'precondition',
    testprocedure: 'procedure',
    testprocedures: 'procedure',
    expectedresult: 'expected',
    actualresult: 'ignore',
    remark: 'remark',
  },
  adapter: {
    testid: 'section_code',
    caseid: 'code',
    testtopic: 'title',
    testcasetype: 'type',
    precondition: 'precondition',
    testprocedures: 'procedure',
    testprocedure: 'procedure',
    expectedresult: 'expected',
    actualresult: 'ignore',
    remark: 'remark',
  },
  modbus_system: {
    testtopic: 'section',
    function: 'title',
    register: 'new_custom',
    preconditions: 'precondition',
    precondition: 'precondition',
    teststep: 'procedure',
    modbustestmethod: 'new_custom',
    expectedresultofcontroller: 'expected',
    expectedresultofdevice: 'new_custom',
    resultokngetc: 'ignore',
    result: 'ignore',
    remark: 'remark',
    judgement: 'ignore',
  },
  modbus_function: {
    register: 'new_custom',
    namefunction: 'title',
    expectedresult: 'expected',
    actualresult: 'ignore',
    resultokngetc: 'ignore',
    result: 'ignore',
    remark: 'remark',
    judgement: 'ignore',
  },
};

/** Headers that count towards header-row detection besides the generic synonyms. */
const EXTRA_HEADER_WORDS = new Set([
  'function',
  'register',
  'namefunction',
  'modbustestmethod',
  'expectedresultofcontroller',
  'expectedresultofdevice',
]);

export function isKnownHeader(text: string): boolean {
  const k = canon(text);
  return k !== '' && (k in GENERIC || EXTRA_HEADER_WORDS.has(k));
}

/** Separator of section levels in TMT's own library export ("Power > On/Off"). */
export const LIBRARY_SECTION_SEPARATOR = ' > ';

/**
 * True for a sheet exported by TMT's library export (Section + Case code + Summary group headers):
 * only then are section values split into levels, so team files with ">" in names stay intact.
 */
export function isLibraryExport(headers: string[]): boolean {
  const set = new Set(headers.map(canon));
  return set.has('section') && set.has('casecode') && set.has('summarygroup');
}

/** Recognises one of the team's layouts from the set of header texts. */
export function detectLayout(headers: string[]): ImportLayout {
  const set = new Set(headers.map(canon));
  const has = (...keys: string[]) => keys.every((k) => set.has(k));
  if (has('register', 'namefunction')) return 'modbus_function';
  if (has('function', 'register', 'teststep')) return 'modbus_system';
  if (has('testid', 'caseid', 'testtopic')) return 'adapter';
  if (
    has('category', 'testtopic', 'expectedresult') &&
    (set.has('testprocedure') || set.has('testprocedures'))
  ) {
    return 'unit_operation';
  }
  return 'generic';
}

/** Suggested target for a header under a layout (null = unknown header). */
export function targetFor(layout: ImportLayout, header: string): Target | null {
  const k = canon(header);
  if (k === '') return null;
  if (layout !== 'generic') {
    const t = LAYOUT_MAPS[layout][k];
    if (t) return t;
  }
  return GENERIC[k] ?? null;
}

/** Environment labels seen in the team's "Test Result Information" blocks (canonical form). */
const ENV_LABELS = new Set([
  'platform',
  'brand',
  'mobile',
  'mobilemodel',
  'smartphone',
  'os',
  'osver',
  'osversion',
  'unittype',
  'unitmodel',
  'ssid',
  'adpfw',
  'adapter',
  'wifiadapter',
  'adaptertype',
  'adapterfw',
  'adapterssid',
  'fwversion',
  'firmwareversion',
  'serverenv',
  'server',
  'apperancemode',
  'appearancemode',
  'language',
  'resolution',
  'router',
  'routerbrand',
  'appversion',
  'appver',
  'swid',
  'swidind',
  'swidod',
  'epromid',
  'eppromid',
  'epromidind',
  'epromidod',
  'swod',
  'eepromod',
  'epromod',
  'controllername',
  'controllerversion',
  'devicemodelname',
  'tester',
  'testername',
  'testeddate',
  'testdate',
  'datetime',
  'testdatetime',
  'judgement',
  'remark',
  'checker',
  'approver',
]);

/** Labels that belong to the run itself (tester, date, judgement…) rather than to its environment. */
const RUN_LEVEL_LABELS = new Set([
  'tester',
  'testername',
  'testeddate',
  'testdate',
  'datetime',
  'testdatetime',
  'judgement',
  'remark',
  'checker',
  'approver',
]);

export function isEnvLabel(text: string): boolean {
  return ENV_LABELS.has(canon(text));
}

export function isRunLevelLabel(text: string): boolean {
  return RUN_LEVEL_LABELS.has(canon(text));
}
