import { API_PREFIX, API_TOKEN_PREFIX } from '@tmt/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/common/copy-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { routes } from '@/lib/routes';

const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-secondary px-1 font-mono text-[0.92em] text-foreground">
    {children}
  </code>
);

/** Authentication and conventions of the REST API (ADR-004, ADR-007, api.md). */
export function ApiDocsIntro({
  origin,
  commonErrorCodes,
  sessionCookieName,
}: {
  origin: string;
  commonErrorCodes: readonly string[];
  /** Cookie name from the document (configurable on the server); null when it is not documented. */
  sessionCookieName: string | null;
}) {
  const base = `${origin}${API_PREFIX}`;
  return (
    <Card className="px-5">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Authentication</h2>
          <div>
            <p className="text-sm font-semibold">API token — scripts and CI</p>
            <p className="text-sm text-muted-foreground">
              Send <C>Authorization: Bearer {API_TOKEN_PREFIX}…</C>. Create a token on the{' '}
              <Link
                href={routes.apiTokens}
                className="text-primary underline-offset-4 hover:underline"
              >
                API tokens
              </Link>{' '}
              page. Token requests need no CSRF header and act with your project roles. Tokens
              cannot manage tokens, passwords or users (<C>403 TOKEN_NOT_ALLOWED</C>); endpoints
              marked “Session only” refuse them.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Session cookie — the browser app</p>
            <p className="text-sm text-muted-foreground">
              <C>POST {API_PREFIX}/auth/login</C> sets the{' '}
              {sessionCookieName ? <C>{sessionCookieName}</C> : 'session'} cookie. With the cookie,
              POST, PUT, PATCH and DELETE requests must also send <C>X-Requested-With: tmt</C>
              (CSRF protection). Not needed with a token.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Conventions</h2>
          <div className="flex items-center gap-2">
            <span className="flex-none text-sm text-muted-foreground">Base URL</span>
            <code className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-sm [overflow-wrap:anywhere]">
              {base}
            </code>
            <CopyButton value={base} label="Copy base URL" />
          </div>
          <p className="text-sm text-muted-foreground">
            JSON bodies; times are ISO-8601, calendar dates <C>YYYY-MM-DD</C>. Project roles are
            viewer &lt; tester &lt; lead (administrators act as lead); non-members get 404.
          </p>
          <p className="text-sm text-muted-foreground">
            Errors look like <C>{'{ "error": { "code", "message", "details"? } }'}</C>. Each
            endpoint lists its codes; any endpoint may also return:
          </p>
          {commonErrorCodes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {commonErrorCodes.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  className="rounded-sm font-mono text-muted-foreground"
                >
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
