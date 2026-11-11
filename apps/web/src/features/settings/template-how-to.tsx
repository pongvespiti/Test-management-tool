import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

const P = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-secondary px-1 py-px font-mono text-[12.5px]">{children}</code>
);

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Start from the blank controlled form',
    body: (
      <>
        Type placeholders into the cells that should be filled, e.g. <P>{'${plan.docNo}'}</P> in the
        document-number cell or <P>{'${plan.title}'}</P>. Everything else — logos, merged cells,
        print setup, signature boxes — stays exactly as in the form. Signature boxes stay blank for
        hand signing.
      </>
    ),
  },
  {
    title: 'Repeat rows with tables',
    body: (
      <>
        A row that contains <P>{'${table:…}'}</P> placeholders is repeated once per item. On the
        summary sheet, a row with <P>{'${table:runs.code}'}</P> and{' '}
        <P>{'${table:runs.judgement}'}</P> lists every test run.
      </>
    ),
  },
  {
    title: 'One sheet per run',
    body: (
      <>
        Name the per-run sheet as the template&apos;s run sheet (e.g. <P>RUN</P>). The export copies
        it once per run, renames each copy to the run code and removes the original. On it use{' '}
        <P>{'${run.code}'}</P>, <P>{'${env.unit_model}'}</P> and one case row such as{' '}
        <P>{'${table:cases.no}'}</P> <P>{'${table:cases.title}'}</P>{' '}
        <P>{'${table:cases.result}'}</P>.
      </>
    ),
  },
  {
    title: 'Merge section cells',
    body: (
      <>
        Put <P>{'${table:cases.sectionMerged}'}</P> in the section column to merge each
        section&apos;s cells vertically (<P>{'${table:cases.section}'}</P> writes the name on the
        first row only).
      </>
    ),
  },
  {
    title: 'Upload and check',
    body: (
      <>
        Upload the .xlsx and use <b>Check</b>: it lists the placeholders found, flags unknown ones
        (they would export as empty cells) and confirms that the run sheet exists.
      </>
    ),
  },
];

/** Short guide to the template language (ADR-002). */
export function TemplateHowTo() {
  return (
    <Card className="gap-1 px-5">
      <h2 className="font-semibold">How templates work</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Exports fill the team&apos;s own Excel form, so the report matches the controlled document.
        Tip: download the built-in template to see a working example.
      </p>
      <ol className="flex flex-col gap-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="text-sm leading-relaxed text-foreground/80">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
