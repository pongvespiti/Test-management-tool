import type { Comment } from '@tmt/database';
import type { CommentDTO, UserRef } from '@tmt/shared';
import { refOf } from '../../common/users/user-refs.js';

export function toCommentDTO(c: Comment, users: Map<number, UserRef>): CommentDTO {
  return {
    id: c.id,
    entityType: c.entityType,
    entityId: c.entityId,
    body: c.body,
    author: refOf(users, c.authorId),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
