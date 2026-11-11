'use client';

import type { ApiTokenDTO } from '@tmt/shared';
import { differenceInDays, isBefore, parseISO } from 'date-fns';
import { BookOpen, Info, KeyRound, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { StatusPill } from '@/components/common/status-pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useModalTarget } from '@/hooks/use-modal-target';
import { ApiError } from '@/lib/api/client';
import { useRevokeToken, useTokens } from '@/lib/api/tokens';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { RED } from '@/lib/status';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';
import { CreateTokenForm } from './create-token-form';
import { junitUploadCommand, whoAmICommand } from './token-examples';

/** Server limit of active (not expired, not revoked) tokens per user. */
export const MAX_ACTIVE = 20;

export const isExpired = (t: Pick<ApiTokenDTO, 'expiresAt'>, now: Date) =>
  t.expiresAt !== null && isBefore(parseISO(t.expiresAt), now);

/** "Expires today" / "In 3 days" for tokens expiring within a week, else null. */
export function expirySoon(expiresAt: string, now: Date): string | null {
  const days = differenceInDays(parseISO(expiresAt), now);
  if (days >= 7) return null;
  return days < 1 ? 'Expires today' : `In ${days} day${days === 1 ? '' : 's'}`;
}

function Expiry({ token, now }: { token: ApiTokenDTO; now: Date }) {
  if (!token.expiresAt) return <span className="text-muted-foreground">Never</span>;
  if (isExpired(token, now))
    return (
      <>
        <StatusPill tone={RED}>Expired</StatusPill>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(token.expiresAt)}</p>
      </>
    );
  const soon = expirySoon(token.expiresAt, now);
  return (
    <>
      <p title={formatDateTime(token.expiresAt)}>{formatDate(token.expiresAt)}</p>
      {soon && <p className="text-xs text-warning">{soon}</p>}
    </>
  );
}

export function ApiTokensPage() {
  const tokens = useTokens();
  const revoke = useRevokeToken();
  const creator = useModalTarget<true>();
  const [locked, setLocked] = useState(false);
  const [now] = useState(() => new Date());

  const list = tokens.data ?? [];
  const active = list.filter((t) => !isExpired(t, now)).length;
  const full = active >= MAX_ACTIVE;

  const openCreator = () => {
    setLocked(false);
    creator.open(true);
  };

  const onRevoke = (t: ApiTokenDTO) =>
    confirmAction({
      title: `Revoke “${t.name}”?`,
      message: 'Scripts and CI jobs that use this token stop working immediately.',
      confirmLabel: 'Revoke token',
      danger: true,
      onConfirm: async () => {
        try {
          await revoke.mutateAsync(t.id);
          notifySuccess(`Token ${t.name} revoked.`);
        } catch (err) {
          if (err instanceof ApiError && err.code === 'TOKEN_NOT_FOUND')
            notifySuccess(`Token ${t.name} was already revoked.`);
          else notifyError(err, 'Could not revoke the token');
        }
      },
    });

  const button = (
    <Button onClick={openCreator} disabled={full || tokens.isError}>
      <Plus />
      New token
    </Button>
  );
  const newButton = full ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>You have {MAX_ACTIVE} active tokens — revoke one first</TooltipContent>
    </Tooltip>
  ) : (
    button
  );

  return (
    <>
      <PageHeader
        title="API tokens"
        subtitle="Personal tokens for scripts and CI pipelines. A token acts as you, with your project roles."
        actions={newButton}
      />
      <div className="flex flex-col gap-6">
        <Card className="gap-0 py-0">
          <QueryState query={tokens}>
            {list.length === 0 ? (
              <EmptyState
                icon={<KeyRound className="size-6" strokeWidth={1.6} />}
                title="No API tokens yet"
                description="Create a token to upload JUnit results from CI or to call the REST API from your own scripts."
                action={newButton}
              />
            ) : (
              <>
                <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[130px]">Created</TableHead>
                      <TableHead className="w-[140px]">Last used</TableHead>
                      <TableHead className="w-[170px]">Expires</TableHead>
                      <TableHead className="w-[96px]">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((t) => (
                      <TableRow key={t.id} className={cn(isExpired(t, now) && 'opacity-70')}>
                        <TableCell>
                          <p className="font-semibold">{t.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{t.prefix}…</p>
                        </TableCell>
                        <TableCell title={formatDateTime(t.createdAt)}>
                          {formatDate(t.createdAt)}
                        </TableCell>
                        <TableCell
                          className={cn(!t.lastUsedAt && 'text-muted-foreground')}
                          title={t.lastUsedAt ? formatDateTime(t.lastUsedAt) : undefined}
                        >
                          {t.lastUsedAt ? formatRelative(t.lastUsedAt) : 'Never'}
                        </TableCell>
                        <TableCell>
                          <Expiry token={t} now={now} />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onRevoke(t)}
                            aria-label={`Revoke ${t.name}`}
                          >
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                  {active} of {MAX_ACTIVE} active tokens. Last use is updated at most every 5
                  minutes.
                </p>
              </>
            )}
          </QueryState>
        </Card>
        <Card className="gap-4 px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-[1_1_420px]">
              <h2 className="font-semibold">Using a token</h2>
              <p className="text-sm text-muted-foreground">
                Send it in the <b>Authorization</b> header — no CSRF header is needed with a token.
                Windows PowerShell: use <b>curl.exe</b> and <b>$env:TMT_TOKEN</b>.
              </p>
            </div>
            <Button asChild variant="secondary" className="text-accent-foreground">
              <Link href={routes.apiDocs}>
                <BookOpen />
                REST API reference
              </Link>
            </Button>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">Check the token</p>
              <CodeBlock code={whoAmICommand()} copyLabel="Copy command" />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">Upload JUnit XML results to a test run</p>
              <CodeBlock code={junitUploadCommand()} copyLabel="Copy command" />
              <p className="text-xs text-muted-foreground">
                The ids are in the address of the run page:{' '}
                <span className="font-mono">/projects/&lt;projectId&gt;/runs/&lt;runId&gt;</span>.
                Add <b>dryRun=true</b> to preview without saving.
              </p>
            </div>
          </div>
          <Alert className="bg-secondary">
            <Info />
            <AlertDescription>
              Tokens cannot manage tokens, passwords or users. Revoke a token as soon as a script no
              longer needs it; administrators can revoke all tokens of a user.
            </AlertDescription>
          </Alert>
        </Card>
      </div>

      {creator.target && (
        <Dialog open={creator.opened} onOpenChange={(o) => !o && creator.close()}>
          <DialogContent
            className="sm:max-w-[620px]"
            // Once the token is shown, only the buttons close the dialog (no accidental loss).
            onInteractOutside={(e) => locked && e.preventDefault()}
            onEscapeKeyDown={(e) => locked && e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{locked ? 'Your new API token' : 'New API token'}</DialogTitle>
              <DialogDescription className="sr-only">
                Personal API token for scripts and CI jobs.
              </DialogDescription>
            </DialogHeader>
            <CreateTokenForm
              key={creator.key}
              onClose={creator.close}
              onCreated={() => setLocked(true)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
