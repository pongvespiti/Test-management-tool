import type { Attachment } from '@tmt/database';
import { API_PREFIX, type AttachmentDTO, type UserRef } from '@tmt/shared';
import { refOf } from '../../common/users/user-refs.js';

/** Relative download URL of an attachment (served through the web app's `/api` proxy). */
export function attachmentUrl(projectId: number, id: string): string {
  return `${API_PREFIX}/projects/${projectId}/attachments/${id}/download`;
}

export function toAttachmentDTO(a: Attachment, users: Map<number, UserRef>): AttachmentDTO {
  return {
    id: a.id,
    entityType: a.entityType,
    entityId: a.entityId,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: Number(a.sizeBytes),
    createdBy: refOf(users, a.createdById),
    createdAt: a.createdAt.toISOString(),
    url: attachmentUrl(a.projectId, a.id),
  };
}
