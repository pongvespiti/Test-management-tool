import { describe, expect, it } from '@jest/globals';
import { ApiError } from '@/lib/api/client';
import { defectPrefill } from '../runs/defect-prefill';
import { makeDefect, makeRunCase } from '../runs/test-fixtures';
import {
  defectFormValues,
  isForward,
  jiraIssueUrl,
  jiraMessages,
  orderTransitions,
  transitionLabel,
  workflowIndex,
} from './defect-model';
import { sameSet } from './defects-page';
import { applyDefectsPatch, parseDefectsUrl } from './use-defects-url-state';

describe('defect form values', () => {
  it('reads an existing defect and adds the external key only when shown', () => {
    const d = makeDefect({ externalKey: 'TEAM-1', fixedIn: null, assignee: null, release: null });
    const values = defectFormValues(d, undefined, true);
    expect(values).toMatchObject({
      title: 'Fan does not start',
      description: 'Seen after a firmware update',
      fixedIn: '',
      assigneeId: null,
      releaseId: null,
      externalKey: 'TEAM-1',
    });
    expect(defectFormValues(d, undefined, false)).not.toHaveProperty('externalKey');
    expect(
      defectFormValues(
        makeDefect({
          description: null,
          steps: null,
          expected: null,
          actual: null,
          foundIn: null,
          environment: null,
        }),
        undefined,
        false,
      ),
    ).toMatchObject({
      description: '',
      steps: '',
      expected: '',
      actual: '',
      foundIn: '',
      environment: '',
    });
  });

  it('starts a new defect from a prefill or empty', () => {
    expect(defectFormValues(null, undefined, true)).toEqual({
      title: '',
      description: '',
      steps: '',
      expected: '',
      actual: '',
      severity: 'major',
      priority: 'medium',
      assigneeId: null,
      releaseId: null,
      foundIn: '',
      fixedIn: '',
      environment: '',
      externalKey: '',
    });
    expect(
      defectFormValues(
        null,
        {
          title: 'T',
          description: 'D',
          steps: 'S',
          expected: 'E',
          actual: 'A',
          severity: 'minor',
          priority: 'low',
          assigneeId: 2,
          releaseId: 4,
          foundIn: 'FW 1',
          environment: 'Env',
        },
        false,
      ),
    ).toEqual({
      title: 'T',
      description: 'D',
      steps: 'S',
      expected: 'E',
      actual: 'A',
      severity: 'minor',
      priority: 'low',
      assigneeId: 2,
      releaseId: 4,
      foundIn: 'FW 1',
      fixedIn: '',
      environment: 'Env',
    });
  });
});

describe('workflow wording', () => {
  it('labels every transition', () => {
    expect(transitionLabel('new', 'open')).toBe('Confirm');
    expect(transitionLabel('in_progress', 'open')).toBe('Back to open');
    expect(transitionLabel('open', 'in_progress')).toBe('Start progress');
    expect(transitionLabel('open', 'resolved')).toBe('Mark resolved');
    expect(transitionLabel('resolved', 'closed')).toBe('Verify & close');
    expect(transitionLabel('closed', 'reopened')).toBe('Reopen');
    expect(transitionLabel('new', 'rejected')).toBe('Reject');
    expect(transitionLabel('open', 'new')).toBe('New');
  });

  it('puts forward transitions first', () => {
    expect(isForward('new', 'open')).toBe(true);
    expect(isForward('in_progress', 'open')).toBe(false);
    expect(isForward('open', 'rejected')).toBe(false);
    expect(orderTransitions('open', ['rejected', 'in_progress', 'resolved'])).toEqual([
      'in_progress',
      'resolved',
      'rejected',
    ]);
  });

  it('places statuses on the main path', () => {
    expect(workflowIndex('new')).toBe(0);
    expect(workflowIndex('reopened')).toBe(1);
    expect(workflowIndex('closed')).toBe(4);
    expect(workflowIndex('rejected')).toBe(-1);
  });
});

describe('Jira helpers', () => {
  it('builds issue URLs', () => {
    expect(jiraIssueUrl(null, 'X-1')).toBeNull();
    expect(jiraIssueUrl('https://jira.example.com//', 'TEAM-12')).toBe(
      'https://jira.example.com/browse/TEAM-12',
    );
  });

  it('collects extra Jira messages', () => {
    const err = new ApiError(502, 'JIRA_ERROR', 'Jira refused: Summary is required', {
      messages: ['Summary is required', 'Priority is invalid', 3],
    });
    expect(jiraMessages(err)).toEqual(['Priority is invalid']);
    expect(jiraMessages(new ApiError(502, 'JIRA_ERROR', 'x'))).toEqual([]);
    expect(jiraMessages(new ApiError(409, 'ALREADY_LINKED', 'x'))).toEqual([]);
    expect(jiraMessages(new Error('x'))).toEqual([]);
  });
});

describe('defect prefill from a run case', () => {
  const run = {
    environment: [
      { label: 'FW version', value: '2.4.0' },
      { label: 'Router', value: 'ASUS' },
      { label: 'Build', value: '' },
    ],
  };

  it('uses the saved result of a text case', () => {
    expect(defectPrefill(makeRunCase({ actualResult: 'Off' }), run, null)).toEqual({
      title: '[UOT-001] Power on the unit',
      steps: 'Precondition:\nUnit is installed\n\nPress ON',
      expected: 'Unit starts',
      actual: 'Off',
      environment: 'FW version: 2.4.0\nRouter: ASUS',
      foundIn: 'FW version 2.4.0',
    });
  });

  it('uses the draft and failed steps of a step case', () => {
    const rc = makeRunCase({
      precondition: null,
      procedure: null,
      expected: null,
      steps: [
        { action: 'Open', expected: 'Opened', sharedStepName: null },
        { action: 'Pair', expected: '', sharedStepName: null },
        { action: 'Check', expected: 'Fine', sharedStepName: null },
      ],
    });
    const draft = {
      status: 'ng' as const,
      actualResult: '  ',
      remark: '',
      elapsedSec: 0,
      timerStartedAt: null,
      stepResults: [
        { status: 'ok' as const, actual: '' },
        { status: 'ng' as const, actual: 'Timeout ' },
        { status: 'blocked' as const, actual: '' },
      ],
    };
    const prefill = defectPrefill(rc, { environment: [] }, draft);
    expect(prefill.steps).toBe('1. Open\n2. Pair\n3. Check');
    expect(prefill.expected).toBe('1. Opened\n3. Fine');
    expect(prefill.actual).toBe('Step 2 (NG): Timeout\nStep 3 (Blocked): —');
    expect(prefill.environment).toBe('');
    expect(
      defectPrefill(makeRunCase({ procedure: null, expected: null }), run, null).expected,
    ).toBe('');
  });
});

const parse = (qs: string) => parseDefectsUrl(new URLSearchParams(qs));
const patch = (qs: string, p: Parameters<typeof applyDefectsPatch>[1]) =>
  Object.fromEntries(applyDefectsPatch(new URLSearchParams(qs), p));

describe('defects URL state', () => {
  it('parses the filters', () => {
    expect(parse('')).toEqual({
      q: '',
      status: [],
      severity: [],
      releaseId: null,
      assignee: null,
      page: 1,
    });
    expect(parse('q=fan&status=open,x,new&severity=minor&release=4&assignee=me&page=3')).toEqual({
      q: 'fan',
      status: ['new', 'open'],
      severity: ['minor'],
      releaseId: 4,
      assignee: 'me',
      page: 3,
    });
    expect(parse('assignee=7&page=0').assignee).toBe(7);
    expect(parse('page=-2').page).toBe(1);
  });

  it('applies patches and resets the page on filter changes', () => {
    expect(
      patch('page=3', {
        q: ' fan ',
        status: ['open'],
        severity: ['major', 'minor'],
        releaseId: 4,
        assignee: 2,
      }),
    ).toEqual({ q: 'fan', status: 'open', severity: 'major,minor', release: '4', assignee: '2' });
    expect(
      patch('q=a&status=open&severity=major&release=4&assignee=me&page=2', {
        q: '',
        status: [],
        severity: [],
        releaseId: null,
        assignee: null,
      }),
    ).toEqual({});
    expect(patch('q=a', { page: 4 })).toEqual({ q: 'a', page: '4' });
    expect(patch('q=a&page=4', { page: 1 })).toEqual({ q: 'a' });
  });

  it('compares status sets', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a'], ['a', 'b'])).toBe(false);
    expect(sameSet(['a', 'c'], ['a', 'b'])).toBe(false);
  });
});
