import { describe, expect, it } from '@jest/globals';
import type { DefectDTO } from '@tmt/shared';
import { issueDescription, issueSummary, wikiCell } from './jira-issue.js';

const defect = (over: Partial<DefectDTO> = {}): DefectDTO => ({
  id: 1,
  projectId: 1,
  key: 'BUG-1',
  title: 't',
  severity: 'minor',
  priority: 'low',
  status: 'new',
  assignee: null,
  release: null,
  linkSummary: null,
  externalKey: null,
  externalStatus: null,
  createdAt: '',
  updatedAt: '',
  description: null,
  steps: null,
  expected: null,
  actual: null,
  reporter: null,
  foundIn: null,
  fixedIn: null,
  environment: null,
  externalUrl: null,
  externalSyncedAt: null,
  resolvedAt: null,
  closedAt: null,
  links: [],
  attachments: [],
  allowedTransitions: [],
  ...over,
});
const ctx = { projectKey: 'JIR', projectName: 'Jira project', publicUrl: null };

describe('Jira issue content', () => {
  it('builds the summary with the defect key, at most 255 characters', () => {
    expect(issueSummary({ key: 'BUG-12', title: 'Adapter\nreboots' })).toBe(
      '[BUG-12] Adapter reboots',
    );
    const long = issueSummary({ key: 'BUG-12', title: 'x'.repeat(300) });
    expect(long).toHaveLength(255);
    expect(long.startsWith('[BUG-12] xxx')).toBe(true);
    expect(long.endsWith('…')).toBe(true);
    expect(issueSummary({ key: 'BUG-1', title: 'x'.repeat(246) })).toHaveLength(254);
  });

  it('escapes table cells so user text cannot break the table or inject markup', () => {
    expect(wikiCell('a|b [link|http://x] {code} *b* line\nbreak')).toBe(
      'a\\|b \\[link\\|http://x\\] \\{code\\} \\*b\\* line break',
    );
    expect(wikiCell('C:\\data')).toBe('C:＼data');
    expect(wikiCell(null)).toBe(' ');
    expect(wikiCell(' \t ')).toBe(' ');
  });

  it('names the defect without a link when PUBLIC_URL is not set', () => {
    const text = issueDescription(defect(), ctx);
    expect(text).toContain('|Severity|Minor|');
    expect(text.endsWith('Created from TMT defect BUG-1.')).toBe(true);
    expect(text).not.toContain('h3. Linked test results');
    expect(text).not.toContain('h3. Description');
  });

  it('puts texts in noformat blocks, details in a table and links the TMT defect', () => {
    const text = issueDescription(
      defect({
        id: 9,
        projectId: 3,
        key: 'BUG-9',
        description: 'Seen on {noformat} *router*\r\nagain',
        steps: '1. Hold WPS',
        environment: 'FW: 2.1.0',
        release: { id: 1, name: 'R1' },
        fixedIn: '2.2',
        reporter: { id: 1, username: 'qa', displayName: 'QA Tester' },
        links: [
          {
            id: 1,
            runCaseId: 2,
            testCaseId: 3,
            runId: 4,
            runCode: 'RUN-A',
            planId: 5,
            planDocNo: '26TR-1',
            caseDisplayId: 'WIFI-001',
            caseCode: null,
            caseTitle: 'Pair | app',
            resultStatus: 'ng',
          },
          {
            id: 2,
            runCaseId: null,
            testCaseId: null,
            runId: null,
            runCode: null,
            planId: null,
            planDocNo: null,
            caseDisplayId: null,
            caseCode: null,
            caseTitle: null,
            resultStatus: null,
          },
        ],
      }),
      { ...ctx, publicUrl: 'http://tmt.local' },
    );
    expect(text).toContain(
      'h3. Description\n{noformat}\nSeen on { noformat} *router*\nagain\n{noformat}',
    );
    expect(text).toContain('h3. Steps to reproduce\n{noformat}\n1. Hold WPS\n{noformat}');
    expect(text).toContain('|TMT defect|BUG\\-9 (JIR · Jira project)|');
    expect(text).toContain('|Release|R1|');
    expect(text).toContain('|Fixed in|2.2|');
    expect(text).toContain('|Reported by|QA Tester|');
    expect(text).not.toContain('|Assignee|');
    expect(text).toContain('h3. Environment\n{noformat}\nFW: 2.1.0\n{noformat}');
    expect(text).toContain('|WIFI\\-001|Pair \\| app|RUN\\-A|26TR\\-1|NG|');
    expect(text).toContain('| | | | | |');
    expect(text).toContain(
      'Created from TMT defect [BUG-9|http://tmt.local/projects/3/defects/9].',
    );
  });
});
