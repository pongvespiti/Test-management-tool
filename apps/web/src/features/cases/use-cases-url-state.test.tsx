import { beforeEach, describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { setNavigation } from '@/test/mocks/next-navigation';
import { followUrl, openUrl, urlParams } from './test-utils';
import { applyCasesPatch, caseLink, parseCasesUrl, useCasesUrlState } from './use-cases-url-state';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';

const parse = (qs: string) => parseCasesUrl(new URLSearchParams(qs));
const patch = (qs: string, p: Parameters<typeof applyCasesPatch>[1]) =>
  Object.fromEntries(applyCasesPatch(new URLSearchParams(qs), p));

describe('parseCasesUrl', () => {
  it('reads every parameter', () => {
    expect(
      parse(
        'suite=2&section=11&case=9&q=fan&type=Abnormal&status=draft&priority=high, low,x&tag=wifi&page=3',
      ),
    ).toEqual({
      suiteId: 2,
      sectionId: 11,
      unsectioned: false,
      caseId: 9,
      q: 'fan',
      caseType: 'Abnormal',
      status: 'draft',
      priority: ['high', 'low'],
      tag: 'wifi',
      page: 3,
    });
  });

  it('ignores invalid values and reads `section=none`', () => {
    expect(parse('suite=x&section=none&case=-1&type=Odd&status=done&page=0')).toEqual({
      suiteId: null,
      sectionId: null,
      unsectioned: true,
      caseId: null,
      q: '',
      caseType: null,
      status: null,
      priority: [],
      tag: '',
      page: 1,
    });
  });
});

describe('applyCasesPatch', () => {
  it('sets and removes values and resets the page on filter changes', () => {
    expect(patch('suite=1&page=4', { q: 'fan', priority: ['critical', 'high'] })).toEqual({
      suite: '1',
      q: 'fan',
      priority: 'critical,high',
    });
    expect(
      patch('suite=1&q=fan&priority=low&tag=x&type=Normal', {
        q: '',
        priority: [],
        tag: null,
        caseType: undefined,
      }),
    ).toEqual({ suite: '1' });
  });

  it('keeps the page when only the open case changes or the page is set', () => {
    expect(patch('suite=1&page=4', { caseId: 9 })).toEqual({ suite: '1', page: '4', case: '9' });
    expect(patch('suite=1&page=4', { page: 5 })).toEqual({ suite: '1', page: '5' });
    expect(patch('suite=1&page=4', { page: 1 })).toEqual({ suite: '1' });
  });

  it('switches between a section and the unsectioned cases', () => {
    expect(patch('section=11', { unsectioned: true, sectionId: null })).toEqual({
      section: 'none',
    });
    expect(patch('section=none', { sectionId: 12, unsectioned: false })).toEqual({ section: '12' });
    expect(patch('section=none', { unsectioned: false })).toEqual({});
    expect(patch('section=11', { unsectioned: false })).toEqual({ section: '11' });
    expect(patch('section=11', { sectionId: null })).toEqual({});
  });
});

describe('caseLink', () => {
  it('opens one case in its suite', () => {
    expect(caseLink(3, { id: 9, suiteId: 2 })).toBe('/projects/3/cases?suite=2&case=9');
  });
});

describe('useCasesUrlState / useUrlSearchParams', () => {
  beforeEach(() => openUrl('/projects/3/cases?suite=1'));

  it('replaces the URL by default and pushes on request', () => {
    const { result, rerender } = renderHook(() => useCasesUrlState());
    expect(result.current.suiteId).toBe(1);
    const length = window.history.length;
    act(() => result.current.update({ q: 'fan' }));
    expect(urlParams()).toEqual({ suite: '1', q: 'fan' });
    expect(window.history.length).toBe(length);
    act(() => result.current.update({ caseId: 9 }, { push: true }));
    expect(window.history.length).toBe(length + 1);
    followUrl();
    rerender();
    expect(result.current).toMatchObject({ q: 'fan', caseId: 9 });
  });

  it('does not write an unchanged URL and drops the query when empty', () => {
    const { result } = renderHook(() => useUrlSearchParams());
    const length = window.history.length;
    act(() => result.current[1]((p) => p, { push: true }));
    expect(window.history.length).toBe(length);
    act(() =>
      result.current[1]((p) => {
        p.delete('suite');
        return p;
      }),
    );
    expect(window.location.pathname).toBe('/projects/3/cases');
    expect(window.location.search).toBe('');
  });

  it('follows the router when the URL changes elsewhere', () => {
    const { result, rerender } = renderHook(() => useUrlSearchParams());
    setNavigation({ search: '?suite=4&q=x' });
    rerender();
    expect(result.current[0].get('suite')).toBe('4');
  });
});
