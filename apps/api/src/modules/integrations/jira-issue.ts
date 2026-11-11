/**
 * Jira issue content for a TMT defect: summary `[BUG-12] title` (≤ 255 characters) and a
 * wiki-markup description built from the defect, its linked run cases and a TMT link.
 * User text goes into `{noformat}` blocks or escaped table cells, so it cannot inject markup.
 */
import {
  DEFECT_PRIORITY_LABELS,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  RESULT_LABELS,
  type DefectDTO,
} from '@tmt/shared';

export const JIRA_SUMMARY_MAX = 255;
/** Label put on every issue created from TMT. */
export const TMT_LABEL = 'tmt';

/** `[BUG-12] title` on one line, cut with an ellipsis at Jira's 255 characters. */
export function issueSummary(d: Pick<DefectDTO, 'key' | 'title'>): string {
  const summary = `[${d.key}] ${d.title.replace(/\s+/g, ' ').trim()}`;
  return summary.length <= JIRA_SUMMARY_MAX
    ? summary
    : `${summary.slice(0, JIRA_SUMMARY_MAX - 1).trimEnd()}…`;
}

/** Literal multi-line text. */
function noformat(text: string): string {
  const body = text
    .replace(/\r\n?/g, '\n')
    .replace(/\{noformat\}/gi, '{ noformat}')
    .trim();
  return `{noformat}\n${body}\n{noformat}`;
}

/** One table cell: single line, markup characters escaped, never empty. */
export function wikiCell(value: string | null | undefined): string {
  const text = (value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\/g, '＼') // a backslash next to a cell separator would escape it
    .replace(/[|[\]{}*_+^~?!#-]/g, (c) => `\\${c}`)
    .trim();
  return text === '' ? ' ' : text;
}

export interface IssueContext {
  projectKey: string;
  projectName: string;
  /** External base URL of TMT (`PUBLIC_URL`); null = no link. */
  publicUrl: string | null;
}

/** Wiki-markup description: texts, details table, environment, linked results and a TMT link. */
export function issueDescription(d: DefectDTO, ctx: IssueContext): string {
  const out: string[] = [];
  const block = (heading: string, text: string | null) => {
    if (text && text.trim() !== '') out.push(`h3. ${heading}`, noformat(text), '');
  };
  block('Description', d.description);
  block('Steps to reproduce', d.steps);
  block('Expected result', d.expected);
  block('Actual result', d.actual);

  out.push('h3. Details', '||Field||Value||');
  const row = (label: string, value: string | null | undefined) => {
    if (value) out.push(`|${label}|${wikiCell(value)}|`);
  };
  row('TMT defect', `${d.key} (${ctx.projectKey} · ${ctx.projectName})`);
  row('Severity', DEFECT_SEVERITY_LABELS[d.severity]);
  row('Priority', DEFECT_PRIORITY_LABELS[d.priority]);
  row('Status in TMT', DEFECT_STATUS_LABELS[d.status]);
  row('Release', d.release?.name);
  row('Found in', d.foundIn);
  row('Fixed in', d.fixedIn);
  row('Reported by', d.reporter?.displayName);
  row('Assignee', d.assignee?.displayName);
  out.push('');
  block('Environment', d.environment);

  if (d.links.length > 0) {
    out.push('h3. Linked test results', '||Case||Title||Run||Test plan||Result||');
    for (const l of d.links) {
      const cells = [
        l.caseDisplayId,
        l.caseTitle,
        l.runCode,
        l.planDocNo,
        l.resultStatus ? RESULT_LABELS[l.resultStatus] : null,
      ];
      out.push(`|${cells.map(wikiCell).join('|')}|`);
    }
    out.push('');
  }

  out.push('----');
  out.push(
    ctx.publicUrl
      ? `Created from TMT defect [${d.key}|${ctx.publicUrl}/projects/${d.projectId}/defects/${d.id}].`
      : `Created from TMT defect ${d.key}.`,
  );
  return out.join('\n');
}
