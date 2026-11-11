import { describe, expect, it } from '@jest/globals';
import { isUnder, routes, toQueryString } from './routes';

describe('routes', () => {
  it('builds project paths', () => {
    expect(routes.project(3)).toBe('/projects/3');
    expect(routes.plan(3, 9)).toBe('/projects/3/plans/9');
    expect(routes.runReport(3, 7)).toBe('/projects/3/runs/7/report');
    expect(routes.settingsTemplates(3)).toBe('/projects/3/settings/templates');
  });

  it('adds only meaningful query parameters', () => {
    expect(routes.cases(3)).toBe('/projects/3/cases');
    expect(routes.cases(3, { suite: 2, q: 'power on', section: null })).toBe(
      '/projects/3/cases?suite=2&q=power+on',
    );
    expect(routes.run(3, 7, { case: 11 })).toBe('/projects/3/runs/7?case=11');
  });

  it('keeps the login back-link except for the start page', () => {
    expect(routes.login()).toBe('/login');
    expect(routes.login('/')).toBe('/login');
    expect(routes.login('/projects/3?x=1')).toBe('/login?next=%2Fprojects%2F3%3Fx%3D1');
  });

  it('serialises query strings and prefix matches', () => {
    expect(toQueryString({ a: 1, b: '', c: null, d: false, e: true })).toBe('?a=1&e=true');
    expect(toQueryString()).toBe('');
    expect(isUnder('/projects/3/plans/9', '/projects/3/plans')).toBe(true);
    expect(isUnder('/projects/3/plansx', '/projects/3/plans')).toBe(false);
  });
});
