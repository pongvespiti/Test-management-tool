import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  importAnalyzeSchema,
  ImportAnalysisDTO,
  ImportPreviewDTO,
  ImportRecordDTO,
  ImportResultDTO,
  importRunSchema,
  ImportSheetInfo,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type ImportAnalyzeBody = z.input<typeof importAnalyzeSchema> & { suiteId?: number };
export type ImportRunBody = z.input<typeof importRunSchema>;

export interface ImportUploadResult {
  uploadId: string;
  fileName: string;
  sheets: ImportSheetInfo[];
}

/** Earlier imports of the project (latest 50). */
export function useImports(projectId: number) {
  return useQuery({
    queryKey: qk.imports(projectId),
    queryFn: () => api.get<ImportRecordDTO[]>(`/projects/${projectId}/imports`),
  });
}

/** Step 1: upload an .xlsx/.csv; the server keeps it for ~2 h under `uploadId`. */
export function useImportUpload(projectId: number) {
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (fraction: number) => void }) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return api.upload<ImportUploadResult>(`/projects/${projectId}/imports/upload`, fd, {
        onProgress,
      });
    },
  });
}

/** Step 2: analyse a sheet (header row, layout, column suggestions, environment block). */
export function useImportAnalyze(projectId: number) {
  return useMutation({
    mutationFn: (body: ImportAnalyzeBody) =>
      api.post<ImportAnalysisDTO>(`/projects/${projectId}/imports/analyze`, body),
  });
}

/** Step 3a: dry run with the chosen mapping. */
export function useImportPreview(projectId: number) {
  return useMutation({
    mutationFn: (body: ImportRunBody) =>
      api.post<ImportPreviewDTO>(`/projects/${projectId}/imports/preview`, body),
  });
}

/** Step 3b: import for real (one transaction). */
export function useImportCommit(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportRunBody) =>
      api.post<ImportResultDTO>(`/projects/${projectId}/imports/commit`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.imports(projectId) });
      void qc.invalidateQueries({ queryKey: qk.suites(projectId) });
      void qc.invalidateQueries({ queryKey: qk.sections(projectId) });
      void qc.invalidateQueries({ queryKey: qk.cases(projectId) });
      void qc.invalidateQueries({ queryKey: qk.tags(projectId) });
    },
  });
}
