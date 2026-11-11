import { Fragment } from 'react';

/** Renders the inline markdown used in API notes: `code` and **bold** (no HTML is ever injected). */
export function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith('`') && p.endsWith('`'))
          return (
            <code key={i} className="rounded-sm bg-secondary px-1 font-mono text-[0.92em]">
              {p.slice(1, -1)}
            </code>
          );
        if (p.length > 4 && p.startsWith('**') && p.endsWith('**'))
          return <b key={i}>{p.slice(2, -2)}</b>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
