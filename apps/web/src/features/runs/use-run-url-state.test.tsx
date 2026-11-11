import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { followUrl, openUrl, urlParams } from '../cases/test-utils';
import { NO_FILTERS } from './run-cases';
import { applyRunPatch, parseRunFilters, useRunUrlState } from './use-run-url-state';

const parse = (qs: string) => parseRunFilters(new URLSearchParams(qs));
const patch = (qs: string, p: Parameters<typeof applyRunPatch>[1]) =>
  Object.fromEntries(applyRunPatch(new URLSearchParams(qs), p));

describe('run URL state', () => {
  it('parses the filters and ignores unknown values', () => {
    expect(parse('')).toEqual(NO_FILTERS);
    expect(
      parse('q=fan&status=ng,untested,bad&assignee=me&priority=high,x&tag=wifi&section=Power'),
    ).toEqual({
      q: 'fan',
      status: ['untested', 'ng'],
      assignee: 'me',
      priority: ['high'],
      tag: 'wifi',
      section: 'Power',
    });
    expect(parse('assignee=none').assignee).toBe('none');
    expect(parse('assignee=4').assignee).toBe(4);
    expect(parse('assignee=x&tag=&section=').assignee).toBeNull();
  });

  it('applies patches and removes empty values', () => {
    expect(
      patch('case=1&q=a', {
        caseId: 5,
        q: ' fan ',
        status: ['ng'],
        assignee: 3,
        priority: ['low', 'high'],
        tag: 'wifi',
        section: 'A › B',
      }),
    ).toEqual({
      case: '5',
      q: 'fan',
      status: 'ng',
      assignee: '3',
      priority: 'low,high',
      tag: 'wifi',
      section: 'A › B',
    });
    expect(
      patch('case=5&q=fan&status=ng&assignee=me&priority=low&tag=x&section=y', {
        caseId: null,
        q: '',
        status: [],
        assignee: null,
        priority: [],
        tag: null,
        section: null,
      }),
    ).toEqual({});
    expect(patch('case=5', {})).toEqual({ case: '5' });
  });

  it('reads and replaces the URL; the filters stay stable when only the case changes', () => {
    openUrl('/projects/3/runs/7?status=ng');
    const { result, rerender } = renderHook(() => useRunUrlState());
    expect(result.current.caseId).toBeNull();
    const filters = result.current.filters;
    act(() => result.current.update({ caseId: 12 }));
    expect(urlParams()).toEqual({ status: 'ng', case: '12' });
    followUrl();
    rerender();
    expect(result.current.caseId).toBe(12);
    expect(result.current.filters).toBe(filters);
    act(() => result.current.update({ status: [] }));
    followUrl();
    rerender();
    expect(result.current.filters).toEqual(NO_FILTERS);
  });
});
