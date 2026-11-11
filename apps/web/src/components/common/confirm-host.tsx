'use client';

import { Loader2 } from 'lucide-react';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface ConfirmRequest {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  /** Red confirm button (delete-like actions). */
  danger?: boolean;
  onConfirm: () => void | Promise<unknown>;
}

let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Opens a confirmation dialog; `onConfirm` runs only after the user confirms. */
export function confirmAction(request: ConfirmRequest): void {
  current = request;
  emit();
}

/** Standard "Delete …? This cannot be undone." confirmation. */
export function confirmDelete(
  what: string,
  onConfirm: () => void | Promise<unknown>,
  extra?: ReactNode,
): void {
  confirmAction({
    title: `Delete ${what}?`,
    message: (
      <>
        This cannot be undone.
        {extra}
      </>
    ),
    confirmLabel: 'Delete',
    danger: true,
    onConfirm,
  });
}

function close() {
  current = null;
  emit();
}

/** Renders the pending confirmation (mounted once in the app providers). */
export function ConfirmHost() {
  const request = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={!!request} onOpenChange={(open) => !open && !busy && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{request?.message}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant={request?.danger ? 'destructive' : 'default'}
            disabled={busy}
            onClick={async () => {
              if (!request) return;
              setBusy(true);
              try {
                await request.onConfirm();
              } finally {
                setBusy(false);
                // onConfirm may have opened a follow-up confirmation: keep that one open.
                if (current === request) close();
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            {request?.confirmLabel ?? 'Confirm'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
