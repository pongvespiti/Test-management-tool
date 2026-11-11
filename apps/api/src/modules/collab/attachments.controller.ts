import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Attachment } from '@tmt/database';
import {
  attachmentFieldsSchema,
  listAttachmentsQuerySchema,
  queryBool,
  type AttachmentDTO,
  type AttachmentFieldsInput,
} from '@tmt/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { contentDisposition } from '../storage/mime.js';
import { FileUpload } from '../storage/upload.decorator.js';
import type { MultipartFile } from '../storage/upload.service.js';
import { AttachmentsService } from './attachments.service.js';

/**
 * `:attachmentId` is a UUID. Malformed ids can never exist, so the schema maps them to null and
 * they answer 404 ATTACHMENT_NOT_FOUND like unknown ids (API v1), not 400.
 */
const ATTACHMENT_ID = {
  schema: z.string().transform((v) => (z.uuid().safeParse(v).success ? v : null)),
} as const;
const downloadQuerySchema = z.object({ download: queryBool.optional() });
const UPLOAD_ERRORS = [
  'MULTIPART_REQUIRED',
  'FILE_REQUIRED',
  'EMPTY_FILE',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
];

/** Response headers of a download; `nosniff` keeps browsers from re-interpreting the bytes. */
function downloadHeaders(a: Attachment, inline: boolean): Record<string, string> {
  return {
    'Content-Type': a.mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : a.mimeType,
    'Content-Length': String(a.sizeBytes),
    'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', a.fileName),
    'X-Content-Type-Options': 'nosniff',
  };
}

@ApiTags('Collaboration')
@Controller('projects/:projectId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @ProjectPermission('read')
  @ApiErrorCodes('BAD_ENTITY')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: listAttachmentsQuerySchema }) q: AttachmentFieldsInput,
  ): Promise<AttachmentDTO[]> {
    return this.attachments.list(ctx.id, q.entityType, q.entityId);
  }

  /** Uploads evidence (any non-executable file ≤ MAX_UPLOAD_MB) to an entity of the project. */
  @Post()
  @ProjectPermission('comment')
  @FileUpload({ entityType: { type: 'string' }, entityId: { type: 'string' } })
  @ApiErrorCodes('BAD_ENTITY', 'PLAN_LOCKED', ...UPLOAD_ERRORS)
  upload(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @UploadedFile() file: MultipartFile | undefined,
    @Body({ schema: attachmentFieldsSchema }) fields: AttachmentFieldsInput,
  ): Promise<AttachmentDTO> {
    return this.attachments.upload(ctx, me, req, file, fields);
  }

  /** The file: inline for images, PDF, video and text, else (or with `?download=1`) a download. */
  @Get(':attachmentId/download')
  @ProjectPermission('read')
  @ApiErrorCodes('ATTACHMENT_NOT_FOUND', 'FILE_MISSING')
  @ApiProduces('application/octet-stream')
  async download(
    @CurrentProject() ctx: ProjectContext,
    @Param('attachmentId', ATTACHMENT_ID) attachmentId: string | null,
    @Query({ schema: downloadQuerySchema }) q: z.infer<typeof downloadQuerySchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.attachments.open(ctx.id, attachmentId, q.download ?? false);
    for (const [name, value] of Object.entries(downloadHeaders(file.attachment, file.inline))) {
      res.setHeader(name, value);
    }
    return new StreamableFile(file.stream);
  }

  /** Deletes an attachment (the uploader or a lead). */
  @Delete(':attachmentId')
  @HttpCode(204)
  @ProjectPermission('read')
  @ApiErrorCodes('ATTACHMENT_NOT_FOUND', 'PLAN_LOCKED', 'TEMPLATE_FILE')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('attachmentId', ATTACHMENT_ID) attachmentId: string | null,
  ): Promise<void> {
    return this.attachments.remove(ctx, me, attachmentId);
  }
}
