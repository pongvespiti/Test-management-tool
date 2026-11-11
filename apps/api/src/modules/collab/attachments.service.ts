import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import type { Attachment, AttachmentEntityType } from '@tmt/database';
import { roleAtLeast, type AttachmentDTO, type AttachmentFieldsInput } from '@tmt/shared';
import type { Request } from 'express';
import { AppException, conflict, forbidden, notFound } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { assertMultipart } from '../execution/http-files.js';
import { isInlineType } from '../storage/mime.js';
import { StorageService } from '../storage/storage.service.js';
import { UploadService, type MultipartFile } from '../storage/upload.service.js';
import { toAttachmentDTO } from './attachments.mapper.js';
import { attachmentsOf } from './attachments.queries.js';
import { evidenceLocked, isLockedByPlan, resolveEntity } from './entities.queries.js';

/** A stored attachment opened for download. */
export interface AttachmentFile {
  attachment: Attachment;
  /** Shown in the browser (images, PDF, video, text) unless a download was requested. */
  inline: boolean;
  stream: Readable;
}

/**
 * Attachments (evidence, logs, screenshots) on run cases, plans, defects, test cases and
 * comments. Files live in the storage; rows reference them by opaque storage keys.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
    private readonly uploads: UploadService,
  ) {}

  /** Attachments of one entity, oldest first. */
  async list(
    projectId: number,
    entityType: AttachmentEntityType,
    entityId: number,
  ): Promise<AttachmentDTO[]> {
    const db = this.prisma.db;
    const rows = await attachmentsOf(db, projectId, entityType, [entityId]);
    const users = await loadUserRefs(
      db,
      rows.map((r) => r.createdById),
    );
    return rows.map((r) => toAttachmentDTO(r, users));
  }

  /**
   * Stores the uploaded file and attaches it to the entity of `fields`. Evidence of completed
   * plans is locked (409 PLAN_LOCKED). The stored file is removed again when anything fails.
   */
  async upload(
    ctx: ProjectContext,
    me: AuthUser,
    req: Pick<Request, 'is'>,
    file: MultipartFile | undefined,
    fields: AttachmentFieldsInput,
  ): Promise<AttachmentDTO> {
    const db = this.prisma.db;
    assertMultipart(req);
    const upload = await this.uploads.store(file);
    let row: Attachment;
    try {
      const target = await resolveEntity(db, ctx.id, fields.entityType, fields.entityId);
      if (isLockedByPlan(fields.entityType, target)) throw evidenceLocked(target.plan?.docNo);
      row = await db.$transaction(async (tx) => {
        const a = await tx.attachment.create({
          data: {
            projectId: ctx.id,
            entityType: fields.entityType,
            entityId: fields.entityId,
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            sizeBytes: upload.stored.sizeBytes,
            sha256: upload.stored.sha256,
            storageKey: upload.stored.storageKey,
            createdById: me.id,
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: fields.entityType,
          entityId: fields.entityId,
          action: 'attachment_added',
          summary: `Attached ${upload.fileName} to ${target.label}`,
        });
        return a;
      });
    } catch (e) {
      await this.storage.removeMany([upload.stored.storageKey]);
      throw e;
    }
    return toAttachmentDTO(row, await loadUserRefs(db, [me.id]));
  }

  /** An attachment of the project; `null` (a malformed id) and unknown ids are 404. */
  async getInProject(projectId: number, attachmentId: string | null): Promise<Attachment> {
    const a = attachmentId
      ? await this.prisma.db.attachment.findFirst({ where: { id: attachmentId, projectId } })
      : null;
    if (!a) throw notFound('Attachment', 'ATTACHMENT_NOT_FOUND');
    return a;
  }

  /** Opens the stored file (404 FILE_MISSING when the row has lost its file). */
  async open(
    projectId: number,
    attachmentId: string | null,
    forceDownload: boolean,
  ): Promise<AttachmentFile> {
    const attachment = await this.getInProject(projectId, attachmentId);
    if (!(await this.storage.exists(attachment.storageKey))) {
      throw new AppException(
        404,
        'FILE_MISSING',
        'The stored file is missing — ask an administrator to restore it',
      );
    }
    return {
      attachment,
      inline: !forceDownload && isInlineType(attachment.mimeType),
      stream: this.storage.openReadStream(attachment.storageKey),
    };
  }

  /** Deletes an attachment — the uploader or a lead; never template files or locked evidence. */
  async remove(ctx: ProjectContext, me: AuthUser, attachmentId: string | null): Promise<void> {
    const db = this.prisma.db;
    const a = await this.getInProject(ctx.id, attachmentId);
    if (a.createdById !== me.id && !roleAtLeast(ctx.role, 'lead')) {
      throw forbidden('Only the uploader or a project lead can delete this file');
    }
    if (a.entityType === 'template') {
      throw conflict(
        'TEMPLATE_FILE',
        'This file belongs to a report template — delete the template instead',
      );
    }
    let label = a.fileName;
    if (a.entityId !== null) {
      // The owner may be gone already (orphaned row): then the file is deleted without a label.
      const target = await resolveEntity(db, ctx.id, a.entityType, a.entityId).catch(() => null);
      if (target && isLockedByPlan(a.entityType, target)) throw evidenceLocked(target.plan?.docNo);
      if (target) label = `${a.fileName} from ${target.label}`;
    }
    await db.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: a.id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: a.entityType,
        entityId: a.entityId,
        action: 'attachment_deleted',
        summary: `Deleted ${label}`,
      });
    });
    await this.storage.removeMany([a.storageKey]);
  }
}
