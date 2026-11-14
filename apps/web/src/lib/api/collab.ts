import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityDTO,
  AttachmentDTO,
  CommentDTO,
  CommentEntityType,
  DashboardDTO,
} from '@tmt/shared';
import { api, buildUrl } from './client';
import { qk } from './keys';
import { STREAM_UPLOAD_PREFIX } from '../upload-path';

/** Entity types that can own attachments through the generic endpoint. */
export type AttachableType = 'run_case' | 'defect' | 'test_case' | 'plan' | 'comment';

// ------------------------------------------------------------------ comments

export function useComments(
  projectId: number,
  entityType: CommentEntityType,
  entityId: number | null,
) {
  return useQuery({
    queryKey: qk.comments(projectId, entityType, entityId ?? 0),
    queryFn: () =>
      api.get<CommentDTO[]>(`/projects/${projectId}/comments`, { entityType, entityId }),
    enabled: entityId !== null && entityId > 0,
  });
}

export function useCreateComment(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { entityType: CommentEntityType; entityId: number; body: string }) =>
      api.post<CommentDTO>(`/projects/${projectId}/comments`, body),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: qk.comments(projectId, c.entityType, c.entityId) });
      void qc.invalidateQueries({ queryKey: ['activity', projectId] });
    },
  });
}

export function useDeleteComment(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
    }: {
      commentId: number;
      entityType: CommentEntityType;
      entityId: number;
    }) => api.delete(`/projects/${projectId}/comments/${commentId}`),
    onSuccess: (_r, vars) =>
      qc.invalidateQueries({ queryKey: qk.comments(projectId, vars.entityType, vars.entityId) }),
  });
}

// ------------------------------------------------------------------ attachments

export function useAttachments(
  projectId: number,
  entityType: AttachableType,
  entityId: number | null,
) {
  return useQuery({
    queryKey: qk.attachments(projectId, entityType, entityId ?? 0),
    queryFn: () =>
      api.get<AttachmentDTO[]>(`/projects/${projectId}/attachments`, { entityType, entityId }),
    enabled: entityId !== null && entityId > 0,
  });
}

/** Uploads one file (drag & drop, picker or pasted screenshot) to an entity. */
export function useUploadAttachment(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      file,
      fileName,
      onProgress,
    }: {
      entityType: AttachableType;
      entityId: number;
      file: Blob;
      /** Name for blobs without one (pasted screenshots). */
      fileName?: string;
      onProgress?: (fraction: number) => void;
    }) => {
      const fd = new FormData();
      fd.append('entityType', entityType);
      fd.append('entityId', String(entityId));
      const name = fileName ?? (file instanceof File ? file.name : 'file');
      fd.append('file', file, name);
      // Streamed past the /api proxy so large screen recordings are not held in memory.
      return api.upload<AttachmentDTO>(
        `${STREAM_UPLOAD_PREFIX}/projects/${projectId}/attachments`,
        fd,
        { onProgress },
      );
    },
    onSuccess: (a) => {
      void qc.invalidateQueries({
        queryKey: qk.attachments(projectId, a.entityType, a.entityId ?? 0),
      });
      if (a.entityType === 'run_case') {
        void qc.invalidateQueries({ queryKey: qk.runCasesAll(projectId) });
        void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
      }
      if (a.entityType === 'defect') void qc.invalidateQueries({ queryKey: qk.defects(projectId) });
    },
  });
}

export function useDeleteAttachment(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      attachmentId,
    }: {
      attachmentId: string;
      entityType: AttachableType;
      entityId: number;
    }) => api.delete(`/projects/${projectId}/attachments/${attachmentId}`),
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries({
        queryKey: qk.attachments(projectId, vars.entityType, vars.entityId),
      });
      void qc.invalidateQueries({ queryKey: qk.runCasesAll(projectId) });
      void qc.invalidateQueries({ queryKey: qk.defects(projectId) });
    },
  });
}

/** URL for <img src>/<a href>; `download` forces Content-Disposition: attachment. */
export function attachmentUrl(projectId: number, attachmentId: string, download = false): string {
  return buildUrl(`/projects/${projectId}/attachments/${attachmentId}/download`, {
    download: download ? '1' : undefined,
  });
}

// ------------------------------------------------------------------ activity & dashboard

export function useActivity(
  projectId: number,
  params: { entityType?: string; entityId?: number; limit?: number } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.activity(projectId, params),
    queryFn: () =>
      api.get<ActivityDTO[]>(`/projects/${projectId}/activity`, {
        entityType: params.entityType,
        entityId: params.entityId,
        limit: params.limit,
      }),
    enabled,
  });
}

/** Release overview; `releaseId` null = server default (newest active release). */
export function useDashboard(projectId: number, releaseId: number | null = null) {
  return useQuery({
    queryKey: qk.dashboard(projectId, releaseId),
    queryFn: () =>
      api.get<DashboardDTO>(`/projects/${projectId}/dashboard`, {
        releaseId: releaseId ?? undefined,
      }),
  });
}
