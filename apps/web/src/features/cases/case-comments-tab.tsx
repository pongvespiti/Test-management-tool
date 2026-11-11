'use client';

import { MessagesSquare, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useComments, useCreateComment, useDeleteComment } from '@/lib/api/collab';
import { formatDateTime, formatRelative, initials } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';

/** Comment thread of a library case (review notes are posted here by the server too). */
export function CaseCommentsTab({ caseId }: { caseId: number }) {
  const { projectId, can, role } = useProject();
  const { user } = useAuth();
  const comments = useComments(projectId, 'test_case', caseId);
  const create = useCreateComment(projectId);
  const remove = useDeleteComment(projectId);
  const [body, setBody] = useState('');
  const list = comments.data ?? [];

  const post = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await create.mutateAsync({ entityType: 'test_case', entityId: caseId, body: text });
      setBody('');
    } catch (err) {
      notifyError(err, 'Could not post the comment');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <QueryState query={comments}>
        {list.length === 0 ? (
          <EmptyState
            compact
            icon={<MessagesSquare className="size-6" strokeWidth={1.6} />}
            title="No comments yet"
            description="Discuss the case here. Review notes also appear in this thread."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((c) => {
              const mine = user !== null && c.author?.id === user.id;
              const canDelete = mine || role === 'lead';
              const author = c.author?.displayName ?? 'Deleted user';
              return (
                <li key={c.id} className="flex items-start gap-3">
                  <Avatar aria-hidden className="size-[30px]">
                    <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                      {initials(c.author?.displayName ?? '?')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2">
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {author}
                        <span
                          className="ml-2 text-xs font-normal text-muted-foreground"
                          title={formatDateTime(c.createdAt)}
                        >
                          {formatRelative(c.createdAt)}
                        </span>
                      </p>
                      {canDelete && (
                        <IconButton
                          label="Delete comment"
                          className="size-7"
                          onClick={() =>
                            confirmAction({
                              title: 'Delete this comment?',
                              message: 'The comment is removed for everyone.',
                              confirmLabel: 'Delete',
                              danger: true,
                              onConfirm: () =>
                                remove
                                  .mutateAsync({
                                    commentId: c.id,
                                    entityType: 'test_case',
                                    entityId: caseId,
                                  })
                                  .catch((err) => notifyError(err, 'Could not delete')),
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      )}
                    </div>
                    <p className="text-sm whitespace-multiline">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      {can('comment') && (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="New comment"
            placeholder="Write a comment…"
            rows={2}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void post();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Ctrl + Enter to post</span>
            <Button
              size="sm"
              onClick={() => void post()}
              loading={create.isPending}
              disabled={!body.trim()}
            >
              Comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
