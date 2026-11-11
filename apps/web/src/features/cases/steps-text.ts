import type { PlainStepDTO } from '@tmt/shared';

/** A numbered line: `1. text`, `1) text`, `12.text` — but not a decimal such as `1.5 V`. */
const NUMBERED = /^\s*(\d{1,3})\s*[.)](?!\d)\s*(.*)$/;

interface NumberedText {
  /** Text before the first numbered line. */
  preamble: string;
  /** Numbered items; unnumbered lines continue the item above them. */
  items: { n: number; text: string }[];
}

/** Splits free text into numbered items (`1.` / `1)` at the start of a line). */
export function splitNumbered(text: string): NumberedText {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const preamble: string[] = [];
  const items: { n: number; lines: string[] }[] = [];
  for (const line of lines) {
    const m = NUMBERED.exec(line);
    // Both groups always participate in a match.
    if (m) items.push({ n: Number(m[1]), lines: [m[2]!] });
    else if (items.length > 0) items[items.length - 1]!.lines.push(line);
    else preamble.push(line);
  }
  return {
    preamble: preamble.join('\n').trim(),
    items: items.map((it) => ({ n: it.n, text: it.lines.join('\n').trim() })),
  };
}

const join = (a: string, b: string) => [a, b].filter((s) => s !== '').join('\n');

/**
 * "Convert numbered lines to steps" (Text → Steps). The procedure's numbered lines become steps and
 * the expected result's numbered lines go to the step with the same number. Nothing is dropped:
 * a procedure without numbers becomes one step, text before the first number is kept with the
 * first step, an expected result without numbers belongs to the last step, and expected lines
 * whose number has no step are added to the last step.
 */
export function textToSteps(procedure: string, expected: string): PlainStepDTO[] {
  const proc = splitNumbered(procedure);
  const exp = splitNumbered(expected);
  if (proc.items.length === 0) {
    const action = proc.preamble;
    const expectedText = expected.trim();
    return action || expectedText ? [{ action, expected: expectedText }] : [];
  }
  const steps = proc.items.map((it) => ({ n: it.n, action: it.text, expected: [] as string[] }));
  if (proc.preamble) steps[0]!.action = join(proc.preamble, steps[0]!.action);
  const last = steps[steps.length - 1]!;
  if (exp.items.length === 0) {
    if (exp.preamble) last.expected.push(exp.preamble);
  } else {
    exp.items.forEach((it, i) => {
      const text = i === 0 && exp.preamble ? join(exp.preamble, it.text) : it.text;
      const target =
        steps.find((s) => s.n === it.n && s.expected.length === 0) ??
        steps.find((s) => s.n === it.n) ??
        last;
      target.expected.push(text);
    });
  }
  return steps.map((s) => ({
    action: s.action,
    expected: s.expected.filter((t) => t !== '').join('\n'),
  }));
}
