/** Owner: W6 (report templates page). W3 reads `useTemplates` (plan form, export dialog). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  TemplateCheckDTO,
  TemplateDTO,
  templateFieldsSchema,
  updateTemplateSchema,
} from '@tmt/shared';
import { safeFileName } from '@tmt/shared';
import { api, downloadFile } from './client';
import { qk } from './keys';

export type TemplateFieldsBody = z.input<typeof templateFieldsSchema>;
export type UpdateTemplateBody = z.input<typeof updateTemplateSchema>;

/** `GET templates/placeholders`: every placeholder, written as `${…}`, grouped by where it works. */
export interface TemplatePlaceholders {
  /** Usable on every sheet (`${plan.docNo}`, `${today}` …). */
  workbook: string[];
  /** Summary rows, one per run (`${table:runs.code}` …). */
  runs: string[];
  /** Header values of the per-run sheet (`${run.code}`, `${env.unit_model}` …). */
  run: string[];
  /** Case rows of the per-run sheet (`${table:cases.title}` …). */
  cases: string[];
}

/** Report templates; the first item is the built-in default (`id: 0`, `builtIn: true`). */
export function useTemplates(projectId: number) {
  return useQuery({
    queryKey: qk.templates(projectId),
    queryFn: () => api.get<TemplateDTO[]>(`/projects/${projectId}/templates`),
    staleTime: 30_000,
  });
}

export function useUploadTemplate(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, fields }: { file: File; fields: TemplateFieldsBody }) => {
      const fd = new FormData();
      // Text fields first: the server reads them before the file part.
      fd.append('name', fields.name);
      if (fields.description) fd.append('description', fields.description);
      if (fields.suiteId !== undefined && fields.suiteId !== null)
        fd.append('suiteId', String(fields.suiteId));
      if (fields.runSheet) fd.append('runSheet', fields.runSheet);
      if (fields.isDefault !== undefined) fd.append('isDefault', String(fields.isDefault));
      fd.append('file', file, file.name);
      return api.upload<TemplateDTO>(`/projects/${projectId}/templates`, fd);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.templates(projectId) }),
  });
}

export function useUpdateTemplate(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, ...body }: UpdateTemplateBody & { templateId: number }) =>
      api.patch<TemplateDTO>(`/projects/${projectId}/templates/${templateId}`, body),
    // Prefix key: also refreshes the checks (run sheet / suite may have changed).
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.templates(projectId) }),
  });
}

export function useDeleteTemplate(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: number) =>
      api.delete(`/projects/${projectId}/templates/${templateId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.templates(projectId) }),
  });
}

/**
 * Placeholders found in a template (inner text, e.g. `plan.title`, `table:cases.no`), the unknown
 * ones, the sheets and whether the run sheet exists. `templateId` 0 = the built-in template.
 */
export function useTemplateCheck(projectId: number, templateId: number | null) {
  return useQuery({
    queryKey: qk.templateCheck(projectId, templateId ?? -1),
    queryFn: () =>
      api.get<TemplateCheckDTO>(`/projects/${projectId}/templates/${templateId}/check`),
    enabled: templateId !== null && templateId >= 0,
  });
}

/** Reference list of placeholders a template author can use in this project. */
export function useTemplatePlaceholders(projectId: number) {
  return useQuery({
    queryKey: qk.templatePlaceholders(projectId),
    queryFn: () => api.get<TemplatePlaceholders>(`/projects/${projectId}/templates/placeholders`),
    staleTime: 60_000,
  });
}

export function downloadTemplate(
  projectId: number,
  template: Pick<TemplateDTO, 'id' | 'fileName' | 'name'>,
) {
  return downloadFile(
    `/projects/${projectId}/templates/${template.id}/download`,
    undefined,
    template.fileName || `${safeFileName(template.name, 'template')}.xlsx`,
  );
}
