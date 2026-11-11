'use client';

import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CopyButton } from '@/components/common/copy-button';
import { StatusPill } from '@/components/common/status-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GREEN, ORANGE, OUTLINE } from '@/lib/status';
import { CodeBlock } from './code-block';
import { InlineMarkdown } from './inline-markdown';
import { MinRoleLabel, minRoleHint } from './min-role-label';
import {
  constraintsOf,
  curlFor,
  fieldsOf,
  typeOf,
  type ApiDoc,
  type ApiOperation,
  type SchemaField,
} from './openapi';

const STATUS_TEXT: Record<string, string> = {
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '204': 'No content',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}

function FieldTable({
  rows,
  showIn = false,
}: {
  rows: (SchemaField & { in?: string })[];
  showIn?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="px-3 py-1.5 font-semibold">Name</th>
            {showIn && <th className="w-[70px] px-3 py-1.5 font-semibold">In</th>}
            <th className="px-3 py-1.5 font-semibold">Type</th>
            <th className="px-3 py-1.5 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.in ?? ''}:${r.name}`} className="border-t align-top">
              <td className="px-3 py-1.5 whitespace-nowrap">
                <span className="font-mono font-semibold">{r.name}</span>
                {r.required && (
                  <span className="ml-1.5 text-xs font-semibold text-destructive">required</span>
                )}
              </td>
              {showIn && <td className="px-3 py-1.5 text-muted-foreground">{r.in}</td>}
              <td className="px-3 py-1.5 font-mono text-xs text-foreground/80 [overflow-wrap:anywhere]">
                {r.type}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                {[r.description, ...r.notes].filter(Boolean).join(' · ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Everything about one operation: role, parameters, body, response, errors, curl. */
export function ApiOperationDetails({
  doc,
  op,
  origin,
}: {
  doc: ApiDoc;
  op: ApiOperation;
  origin: string;
}) {
  const [schemaOpen, setSchemaOpen] = useState(false);
  const params = op.parameters.map((p) => ({
    name: p.name,
    in: p.in,
    type: typeOf(p.schema),
    required: p.required,
    notes: constraintsOf(p.schema),
    description: p.description,
  }));
  const body = op.requestBody;
  const fields = fieldsOf(body?.schema ?? null);
  const link = `${origin}/api-docs#op-${op.key}`;

  return (
    <div className="flex flex-col gap-4 pt-1">
      {op.notes && (
        <p className="text-sm">
          <InlineMarkdown text={op.notes} />
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-[1_1_360px] flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Who can call it</span>
            <MinRoleLabel role={op.minRole} />
            <span className="text-muted-foreground">{minRoleHint(op.minRole)}</span>
          </div>
          {op.sessionOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <StatusPill tone={ORANGE} leftSection={<Lock aria-hidden className="size-3" />}>
                    Session only
                  </StatusPill>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Refused to API tokens (403 TOKEN_NOT_ALLOWED) — use a browser session
              </TooltipContent>
            </Tooltip>
          )}
          {op.deprecated && <StatusPill tone={OUTLINE}>Deprecated</StatusPill>}
        </div>
        <div className="flex items-center gap-1.5">
          {op.operationId && (
            <span className="text-xs text-muted-foreground">
              operationId <code className="font-mono">{op.operationId}</code>
            </span>
          )}
          <CopyButton value={link} label="Copy link to this endpoint" />
        </div>
      </div>

      {params.length > 0 && (
        <Section title="Parameters">
          <FieldTable rows={params} showIn />
        </Section>
      )}

      {body && (
        <Section title="Request body">
          <p className="mb-1.5 text-sm text-muted-foreground">
            <code className="font-mono text-xs">{body.contentType}</code>
            {body.description ? (
              <>
                {' '}
                · <InlineMarkdown text={body.description} />
              </>
            ) : null}
          </p>
          {fields.length > 0 ? (
            <FieldTable rows={fields} />
          ) : (
            <p className="text-sm text-muted-foreground">No documented fields.</p>
          )}
          {body.schema && (
            <div className="mt-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-primary"
                onClick={() => setSchemaOpen((o) => !o)}
                aria-expanded={schemaOpen}
              >
                {schemaOpen ? <ChevronDown /> : <ChevronRight />}
                {schemaOpen ? 'Hide JSON schema' : 'Show JSON schema'}
              </Button>
              {schemaOpen && (
                <div className="mt-1.5">
                  <CodeBlock
                    code={JSON.stringify(body.schema, null, 2)}
                    copyLabel="Copy schema"
                    scroll
                  />
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      <Section title="Response">
        {op.success ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={GREEN}>
              {op.success.status} {STATUS_TEXT[op.success.status] ?? ''}
            </StatusPill>
            {op.success.status !== '204' && op.success.description && (
              <code className="font-mono text-sm">{op.success.description}</code>
            )}
            {op.success.contentType && (
              <span className="text-xs text-muted-foreground">{op.success.contentType}</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not documented.</p>
        )}
      </Section>

      {op.errorCodes.length > 0 && (
        <Section title="Error codes">
          <div className="flex flex-wrap gap-1.5">
            {op.errorCodes.map((c) => (
              <Badge
                key={c}
                variant="outline"
                className="rounded-sm border-[#ffc9c9] font-mono text-destructive"
              >
                {c}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            In <code className="font-mono">error.code</code>; the common codes listed at the top
            apply too.
          </p>
        </Section>
      )}

      <Section title="Example">
        <CodeBlock code={curlFor(doc, op, origin)} copyLabel="Copy command" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {op.isPublic
            ? 'No sign-in needed.'
            : op.sessionOnly
              ? 'Session only: sign in first with POST /api/v1/auth/login (curl -c cookies.txt …).'
              : 'Replace the <…> placeholders; $TMT_TOKEN holds your API token.'}
        </p>
      </Section>
    </div>
  );
}
