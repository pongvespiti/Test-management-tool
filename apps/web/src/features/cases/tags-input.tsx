'use client';

import { X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MAX_SUGGESTIONS = 8;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const escapeClass = (c: string) => c.replace(/[\\\]^-]/g, '\\$&');

/** Adds the new values of `items` to `tags`: trimmed, case-insensitive unique, at most `max`. */
export function addTags(
  tags: readonly string[],
  items: readonly string[],
  max = Infinity,
): string[] {
  const out = [...tags];
  for (const raw of items) {
    const tag = raw.trim();
    if (!tag || out.length >= max || out.some((t) => same(t, tag))) continue;
    out.push(tag);
  }
  return out;
}

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Values offered while typing (e.g. the tags used in the project). */
  suggestions?: readonly string[];
  maxTags?: number;
  placeholder?: string;
  /** Characters that end a tag while typing or pasting (Enter always does). */
  splitChars?: readonly string[];
  clearable?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

/**
 * Free tags as chips: Enter, `,` or `;` adds the typed text, Backspace in the empty box removes the
 * last tag, suggestions are picked with the arrow keys or the mouse. Typed text is kept on blur.
 */
export function TagsInput({
  value,
  onChange,
  suggestions = [],
  maxTags = Infinity,
  placeholder,
  splitChars = [',', ';'],
  clearable = true,
  readOnly = false,
  disabled = false,
  autoFocus,
  className,
  id,
  ...aria
}: TagsInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const editable = !readOnly && !disabled;
  const full = value.length >= maxTags;
  const invalid = aria['aria-invalid'] === true || aria['aria-invalid'] === 'true';

  const matches = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.some((t) => same(t, s)) && s.toLowerCase().includes(needle))
      .slice(0, MAX_SUGGESTIONS);
  }, [suggestions, value, text]);
  const showList = open && editable && !full && matches.length > 0;

  const commit = (items: string[]) => {
    const next = addTags(value, items, maxTags);
    if (next.length !== value.length) onChange(next);
  };
  const add = (raw: string) => {
    commit([raw]);
    setText('');
    setActive(-1);
  };

  const onType = (raw: string) => {
    setOpen(true);
    setActive(-1);
    const split = new RegExp(`[${splitChars.map(escapeClass).join('')}\\n]`);
    if (splitChars.length === 0 || !split.test(raw)) {
      setText(raw);
      return;
    }
    const parts = raw.split(split);
    const rest = parts.pop() ?? '';
    commit(parts);
    setText(rest);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const picked = showList && active >= 0 ? matches[active] : undefined;
    if (e.key === 'Enter' && (picked || text.trim())) {
      e.preventDefault();
      add(picked ?? text);
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-card px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          invalid && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget || !editable) return;
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {value.map((tag, i) => (
          <Badge key={tag} variant="secondary" className="h-6 gap-1 font-normal">
            {tag}
            {editable && (
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="-mr-1 rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X />
              </button>
            )}
          </Badge>
        ))}
        {readOnly && value.length === 0 && <span className="px-1 text-muted-foreground">—</span>}
        {!readOnly && (
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={showList}
            aria-controls={showList ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            {...aria}
            autoFocus={autoFocus}
            disabled={disabled}
            value={text}
            placeholder={value.length === 0 ? placeholder : undefined}
            onChange={(e) => onType(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              if (text.trim()) add(text);
            }}
            className="h-7 min-w-[80px] flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
          />
        )}
        {clearable && editable && value.length > 0 && (
          <button
            type="button"
            aria-label="Remove all"
            className="ml-auto grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => onChange([])}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {matches.map((m, i) => (
            <li
              key={m}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(m);
              }}
              className={cn(
                'cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                i === active && 'bg-accent text-accent-foreground',
              )}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
