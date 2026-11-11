'use client';

import { DEFAULT_DOC_NO_PATTERN, suggestDocNo } from '@tmt/shared';
import { format } from 'date-fns';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pluralize } from '@/lib/format';

const TOKENS = [
  { token: '{YY}', meaning: 'Year, two digits' },
  { token: '{YYYY}', meaning: 'Year, four digits' },
  { token: '{MM}', meaning: 'Month, two digits' },
  { token: '{SEQ}', meaning: 'Next free number for the same prefix' },
] as const;

const KNOWN = new Set<string>(TOKENS.map((t) => t.token));

/** Tokens in a pattern that the server does not replace (kept as text). */
export function unknownTokens(pattern: string): string[] {
  return [...new Set(pattern.match(/\{[^{}]*\}/g) ?? [])].filter((t) => !KNOWN.has(t));
}

function example(token: string, now: Date): string {
  if (token === '{SEQ}') return '1, 2, 3 …';
  return suggestDocNo([], now, token);
}

/** Document-number pattern input with token buttons and a live preview (shared `suggestDocNo`). */
export function DocNoPatternField({
  value,
  onChange,
  onBlur,
  inputRef,
  error,
  readOnly,
  docNos,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Focus target for form errors (react-hook-form `field.ref`). */
  inputRef?: (el: HTMLInputElement | null) => void;
  error?: string;
  readOnly: boolean;
  /** Document numbers of the existing plans (null while loading or unavailable). */
  docNos: string[] | null;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  // One reference date per mount: the preview must not change between renders.
  const [now] = useState(() => new Date());
  const pattern = value.trim() || DEFAULT_DOC_NO_PATTERN;
  const next = suggestDocNo(docNos ?? [], now, pattern);
  const unknown = unknownTokens(pattern);

  const insert = (token: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2">
        <Label htmlFor={id} className={error ? 'text-destructive' : undefined}>
          Document number pattern
        </Label>
        <Input
          id={id}
          ref={(el) => {
            input.current = el;
            inputRef?.(el);
          }}
          className="font-mono"
          placeholder={DEFAULT_DOC_NO_PATTERN}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onBlur={onBlur}
          readOnly={readOnly}
          maxLength={60}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-description${error ? ` ${id}-error` : ''}`}
        />
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          Suggests the Doc. No. of new test plans. Leave empty for the default{' '}
          {DEFAULT_DOC_NO_PATTERN}.
        </p>
        {error && (
          <p id={`${id}-error`} className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {!readOnly && (
        <div
          role="group"
          aria-label="Insert a token"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-xs text-muted-foreground">Insert:</span>
          {TOKENS.map((t) => (
            <Button
              key={t.token}
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 px-2 font-mono text-accent-foreground"
              onClick={() => insert(t.token)}
              aria-label={`Insert ${t.token}`}
            >
              {t.token}
            </Button>
          ))}
        </div>
      )}
      <div className="rounded-md border bg-muted p-4">
        <p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          Next suggested number
        </p>
        <p
          aria-live="polite"
          className="mt-1 font-mono text-xl font-semibold [overflow-wrap:anywhere]"
        >
          {next}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          For a plan created in {format(now, 'MMMM yyyy')}
          {docNos ? `, after the ${pluralize(docNos.length, 'existing plan')}` : ''}. Testers can
          still type another number — the official one comes from document control.
        </p>
        {!pattern.includes('{SEQ}') && (
          <p className="mt-1.5 text-xs text-warning">
            Without {'{SEQ}'} every plan of a month gets the same suggestion.
          </p>
        )}
        {unknown.length > 0 && (
          <p className="mt-1.5 text-xs text-warning">
            {unknown.join(', ')}{' '}
            {unknown.length === 1 ? 'is not a token and stays' : 'are not tokens and stay'} as text.
          </p>
        )}
      </div>
      <dl className="m-0">
        {TOKENS.map((t) => (
          <div key={t.token} className="flex items-baseline gap-3 py-0.5">
            <dt className="w-16 shrink-0 font-mono text-sm font-semibold">{t.token}</dt>
            <dd className="m-0 text-sm text-muted-foreground">
              <span className="mr-3 font-mono text-foreground/80">{example(t.token, now)}</span>
              {t.meaning}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
