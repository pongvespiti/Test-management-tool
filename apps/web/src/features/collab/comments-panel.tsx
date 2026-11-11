'use client';

import type { CommentEntityType } from '@tmt/shared';
import { MessageSquare, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { QueryState } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useComments, useCreateComment, useDeleteComment } from '@/lib/api/collab';
import { formatDateTime, formatRelative } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { UserAvatar } from './user-avatar';

/** Discussion on a run case or defect: oldest first, the author or a lead may delete. */
export function CommentsPanel({
  entityType,
  entityId,
  canComment,
}: {
  entityType: CommentEntityType;
  entityId: number;
  canComment: boolean;
}) {
  const { projectId, role } = useProject();
  const { user } = useAuth();
  const comments = useComments(projectId, entityType, entityId);
  const create = useCreateComment(projectId);
  const remove = useDeleteComment(projectId);
  const [body, setBody] = useState('');
  const list = comments.data ?? [];

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await create.mutateAsync({ entityType, entityId, body: text });
      setBody('');
    } catch (err) {
      notifyError(err, 'Could not add the comment');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <QueryState query={comments}>
        {list.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="size-4" aria-hidden />
            No comments yet.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {list.map((c) => {
              const mayDelete = c.author?.id === user?.id || role === 'lead';
              return (
                <li key={c.id} className="flex items-start gap-2.5">
                  <UserAvatar user={c.author ?? { displayName: '?' }} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <p className="text-sm">
                        <span className="font-semibold">
                          {c.author?.displayName ?? 'Deleted user'}
                        </span>{' '}
                        <span
                          className="text-xs text-muted-foreground"
                          title={formatDateTime(c.createdAt)}
                        >
                          · {formatRelative(c.createdAt)}
                        </span>
                      </p>
                      {mayDelete && (
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
                                  .mutateAsync({ commentId: c.id, entityType, entityId })
                                  .catch((e) => notifyError(e, 'Could not delete the comment')),
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
      {canComment && (
        <div className="flex flex-col gap-1.5">
          <Textarea
            aria-label="Add a comment"
            placeholder="Add a comment… (Ctrl+Enter to send)"
            rows={2}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => void submit()}
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
