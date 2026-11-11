'use client';

import './globals.css';

/** Last-resort boundary when the root layout itself fails (renders its own document). */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex max-w-[520px] flex-col gap-4 rounded-xl border bg-card p-6">
          <h1 className="text-lg font-semibold">The application crashed</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error stopped the page. Reload to try again; if it keeps happening, tell
            your administrator what you were doing.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
            <a
              href="/"
              className="flex h-9 items-center rounded-md border px-4 text-sm font-medium"
            >
              Go to start page
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
