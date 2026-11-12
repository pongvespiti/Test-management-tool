import { describe, expect, it } from '@jest/globals';
import { makeSuite } from '../cases/test-utils';
import {
  describePlaceholder,
  editDistance,
  groupOf,
  innerOf,
  placeholderNames,
  suggestPlaceholder,
  wrapPlaceholder,
} from './placeholder-info';

const names = placeholderNames([
  makeSuite({
    fieldDefs: [{ key: 'test_id', label: 'Test ID', type: 'text', showInTable: false }],
    envTemplate: ['Unit model', 'FW version'],
  }),
  makeSuite({
    id: 2,
    fieldDefs: [{ key: 'test_id', label: 'Other label', type: 'text', showInTable: false }],
    envTemplate: ['Unit model'],
  }),
]);

describe('placeholderNames', () => {
  it('collects field and environment labels of all suites (first one wins)', () => {
    expect([...names.fields]).toEqual([['test_id', 'Test ID']]);
    expect([...names.env]).toEqual([
      ['unit_model', 'Unit model'],
      ['fw_version', 'FW version'],
    ]);
    expect(placeholderNames(undefined)).toEqual({ fields: new Map(), env: new Map() });
  });
});

describe('placeholder shapes', () => {
  it('wraps and unwraps placeholders', () => {
    expect(innerOf(' ${plan.title} ')).toBe('plan.title');
    expect(innerOf('plan.title')).toBe('plan.title');
    expect(wrapPlaceholder('plan.title')).toBe('${plan.title}');
    expect(wrapPlaceholder('${plan.title}')).toBe('${plan.title}');
  });

  it('groups placeholders by where they work', () => {
    expect(groupOf('${table:runs.code}')).toBe('runs');
    expect(groupOf('table:cases.title')).toBe('cases');
    expect(groupOf('table:requirements.key')).toBe('requirements');
    expect(groupOf('${table:dimensions.value}')).toBe('dimensions');
    expect(groupOf('table:sessions.key')).toBe('sessions');
    expect(groupOf('run.code')).toBe('run');
    expect(groupOf('env.unit_model')).toBe('run');
    expect(groupOf('table:envList.label')).toBe('run');
    expect(groupOf('plan.docNo')).toBe('workbook');
  });
});

describe('describePlaceholder', () => {
  it.each([
    ['${plan.docNo}', 'Document number of the test plan'],
    ['run.code', 'Run code (Test ID)'],
    ['run.ok', 'Number of “OK” results'],
    ['run.nope', null],
    ['env.unit_model', 'Environment “Unit model”'],
    ['env.other', 'Environment value'],
    ['table:envList.label', 'Environment label — the row repeats per entry'],
    ['table:envList.value', 'Environment value — the row repeats per entry'],
    ['table:runs.env_fw_version', 'Environment “FW version”'],
    ['table:runs.g_power', 'Result of one summary group (OK / NG …) in this run'],
    ['table:runs.judgement', 'Run judgement'],
    ['table:runs.nope', null],
    ['table:cases.cf_test_id', 'Custom field “Test ID”'],
    ['table:cases.cf_unknown', 'Custom field'],
    ['table:cases.sectionMerged', 'Section name, cells merged down the whole section'],
    ['table:cases.nope', null],
    ['table:requirements.status', 'Passing, Failing, In progress or Not covered'],
    ['table:requirements.ng', 'Number of “NG” results'],
    ['table:requirements.total', 'Number of case rows'],
    ['table:requirements.nope', null],
    ['table:dimensions.value', 'The value of that label'],
    ['table:sessions.timeBox', 'Time box in minutes'],
    ['table:sessions.nope', null],
    ['plan.nope', null],
  ])('%s', (placeholder, meaning) => {
    expect(describePlaceholder(placeholder, names)).toBe(meaning);
  });
});

describe('suggestPlaceholder', () => {
  const reference = {
    workbook: ['${plan.docNo}', '${plan.title}'],
    runs: ['${table:runs.code}'],
    run: ['${run.code}'],
    cases: ['${table:cases.title}'],
    requirements: ['${table:requirements.status}'],
    dimensions: [],
    sessions: [],
  };

  it('suggests the closest known placeholder for a small typo', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(suggestPlaceholder('plan.docno', reference)).toBe('plan.docNo');
    expect(suggestPlaceholder('table:case.title', reference)).toBe('table:cases.title');
    expect(suggestPlaceholder('something.else', reference)).toBeNull();
    expect(suggestPlaceholder('plan.title', undefined)).toBeNull();
    expect(suggestPlaceholder('table:requirement.status', reference)).toBe(
      'table:requirements.status',
    );
    expect(
      suggestPlaceholder('plan.x', {
        workbook: [],
        runs: [],
        run: [],
        cases: [],
        requirements: [],
        dimensions: [],
        sessions: [],
      }),
    ).toBeNull();
  });
});
