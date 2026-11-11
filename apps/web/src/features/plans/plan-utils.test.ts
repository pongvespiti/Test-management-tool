import { describe, expect, it } from '@jest/globals';
import { makeSection } from '@/features/cases/test-utils';
import {
  countByStatus,
  envSummary,
  nextFreeCode,
  oneOf,
  planMatches,
  preferredTemplate,
  resultBreakdown,
  sectionOptions,
  suggestDuplicateCode,
  suggestRerunCode,
  suiteNamesOf,
  suitesLabel,
  templateOptions,
  usedCodes,
} from './plan-utils';
import { counts, makePlan, makeRunSummary, makeTemplate } from './test-fixtures';

describe('plan helpers', () => {
  it('lists the distinct suites of the runs and labels them', () => {
    const plan = makePlan({
      runs: [
        makeRunSummary({ suiteName: 'A' }),
        makeRunSummary({ suiteName: 'B' }),
        makeRunSummary({ suiteName: 'A' }),
      ],
    });
    expect(suiteNamesOf(plan)).toEqual(['A', 'B']);
    expect(suitesLabel([])).toBeNull();
    expect(suitesLabel(['A'])).toBe('Suite: A');
    expect(suitesLabel(['A', 'B'])).toBe('Suites: A, B');
  });

  it('summarises the filled environment values', () => {
    const env = [
      { label: 'Unit', value: ' Gen 4 ' },
      { label: 'Phone', value: '' },
      { label: 'FW', value: '3.12' },
      { label: 'OS', value: 'iOS 18' },
      { label: 'App', value: '2.0' },
    ];
    expect(envSummary(env)).toBe('Gen 4 · 3.12 · iOS 18');
    expect(envSummary(env, 1)).toBe('Gen 4');
    expect(envSummary([])).toBe('');
  });

  it('suggests free run codes', () => {
    const used = usedCodes([{ code: 'KR_01' }, { code: ' kr_02 ' }, { code: 'KR_01_R1' }]);
    expect(used).toEqual(new Set(['kr_01', 'kr_02', 'kr_01_r1']));
    expect(nextFreeCode('KR_', used)).toBe('KR_03');
    expect(nextFreeCode('X', new Set(), 3, 7)).toBe('X007');
    const all = new Set(Array.from({ length: 500 }, (_, i) => `z${i + 1}`));
    expect(nextFreeCode('Z', all, 1)).toBe('Z');

    expect(suggestRerunCode('KR_01', used)).toBe('KR_01_R2');
    expect(suggestRerunCode('KR_01_R1', used)).toBe('KR_01_R2');
    expect(suggestRerunCode('KR_05', used)).toBe('KR_05_R1');

    expect(suggestDuplicateCode('KR_01', used)).toBe('KR_03');
    expect(suggestDuplicateCode('MBS_009', new Set())).toBe('MBS_010');
    expect(suggestDuplicateCode('AP', new Set(['ap_2']))).toBe('AP_3');
  });

  it('states NG and blocked always and other results only when present', () => {
    expect(resultBreakdown(counts({ ok: 4 }))).toBe('4 OK, 0 NG, 0 blocked');
    expect(
      resultBreakdown(counts({ ok: 1, ok_cond: 2, ng: 3, blocked: 4, na: 5, nt: 6, untested: 7 })),
    ).toBe('1 OK, 2 OK w/ cond., 3 NG, 4 blocked, 5 N/A, 6 N/T, 7 untested');
  });

  it('accepts only known URL values', () => {
    expect(oneOf(['a', 'b'] as const, null)).toBeNull();
    expect(oneOf(['a', 'b'] as const, 'b')).toBe('b');
    expect(oneOf(['a', 'b'] as const, 'c')).toBeNull();
  });

  it('matches plans by doc no., title or run code', () => {
    const plan = makePlan({ docNo: '26TR-1', title: 'Adapter test' });
    expect(planMatches(plan, '')).toBe(true);
    expect(planMatches(plan, '26tr')).toBe(true);
    expect(planMatches(plan, 'adapter')).toBe(true);
    expect(planMatches(plan, 'kr_01')).toBe(true);
    expect(planMatches(plan, 'zzz')).toBe(false);
  });

  it('counts plans per status', () => {
    const list = [
      makePlan({ status: 'draft' }),
      makePlan({ status: 'completed' }),
      makePlan({ status: 'completed' }),
    ];
    expect(countByStatus(list)).toEqual({ draft: 1, in_progress: 0, completed: 2 });
  });

  it('prefers the plan template, then the project default, then the built-in one', () => {
    const builtIn = makeTemplate();
    const custom = makeTemplate({ id: 4, name: 'Customer form', builtIn: false });
    const def = makeTemplate({ id: 5, name: 'Default form', builtIn: false, isDefault: true });
    expect(preferredTemplate({ templateId: 4 }, [builtIn, custom, def])).toBe(custom);
    expect(preferredTemplate({ templateId: null }, [builtIn, custom, def])).toBe(def);
    expect(preferredTemplate({ templateId: 9 }, [builtIn, custom])).toBe(builtIn);
    expect(preferredTemplate({ templateId: null }, [])).toBeUndefined();
  });

  it('builds the template options of the plan form', () => {
    const builtIn = makeTemplate();
    const custom = makeTemplate({ id: 4, name: 'Customer form', builtIn: false });
    const def = makeTemplate({ id: 5, name: 'Default form', builtIn: false, isDefault: true });
    expect(templateOptions([builtIn, custom, def], null)).toEqual([
      { value: '0', label: 'Project default (Default form)' },
      { value: '4', label: 'Customer form' },
      { value: '5', label: 'Default form' },
    ]);
    expect(templateOptions([builtIn], 4)).toEqual([
      { value: '0', label: 'Project default (Built-in test report)' },
      { value: '4', label: 'Template #4' },
    ]);
    expect(templateOptions([], null)).toEqual([{ value: '0', label: 'Project default' }]);
    expect(templateOptions([custom], 4)).toHaveLength(2);
  });

  it('flattens the section tree with depths', () => {
    const tree = [
      makeSection({
        id: 1,
        name: 'Power',
        code: '1',
        children: [makeSection({ id: 2, name: 'On/off', code: null, children: [] })],
      }),
      makeSection({ id: 3, name: 'Timer', code: null, children: [] }),
    ];
    expect(sectionOptions(tree)).toEqual([
      { value: '1', label: '1 · Power', depth: 0 },
      { value: '2', label: 'On/off', depth: 1 },
      { value: '3', label: 'Timer', depth: 0 },
    ]);
  });
});
