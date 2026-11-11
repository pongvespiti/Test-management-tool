import { describe, expect, it } from '@jest/globals';
import { jiraResultText, parseJiraKeys } from './requirement-format';

describe('parseJiraKeys', () => {
  it('splits on commas, spaces and lines, upper-cases and drops repeats', () => {
    expect(parseJiraKeys('iot-1, IOT-2\nIOT-1 ;iot-3')).toEqual({
      keys: ['IOT-1', 'IOT-2', 'IOT-3'],
      invalid: [],
    });
  });
  it('reports text that is not an issue key', () => {
    expect(parseJiraKeys('IOT-1 nope 12 nope')).toEqual({
      keys: ['IOT-1'],
      invalid: ['nope', '12'],
    });
    expect(parseJiraKeys('  ')).toEqual({ keys: [], invalid: [] });
  });
});

describe('jiraResultText', () => {
  it('says what was added and which keys Jira did not return', () => {
    expect(jiraResultText({ created: 2, updated: 1, missing: [] })).toBe('2 added, 1 refreshed.');
    expect(jiraResultText({ created: 0, updated: 0, missing: ['IOT-9'] })).toContain(
      'Not found in Jira: IOT-9',
    );
  });
});
