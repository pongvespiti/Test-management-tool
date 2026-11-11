/** Report template rows → TemplateDTO, and the built-in template entry (id 0). */
import type { ReportTemplate } from '@tmt/database';
import type { TemplateDTO, UserRef } from '@tmt/shared';
import { refOf } from '../../common/users/user-refs.js';

/**
 * The built-in report template shipped with `@tmt/excel` (`defaultTemplatePath()`), listed first
 * with id 0. `runSheet` is the per-run sheet of that workbook.
 */
export const BUILT_IN_TEMPLATE = {
  id: 0,
  name: 'Standard test report (built-in)',
  description: 'Default test report layout shipped with the application',
  fileName: 'default-report.xlsx',
  runSheet: 'RUN',
} as const;

/** `report_templates.config`. */
export interface TemplateConfig {
  runSheet?: string | null;
}

export function templateConfigOf(t: Pick<ReportTemplate, 'config'>): TemplateConfig {
  return t.config && typeof t.config === 'object' && !Array.isArray(t.config)
    ? (t.config as TemplateConfig)
    : {};
}

export function builtInTemplateDTO(projectId: number, isDefault: boolean): TemplateDTO {
  return {
    id: BUILT_IN_TEMPLATE.id,
    projectId,
    suiteId: null,
    name: BUILT_IN_TEMPLATE.name,
    description: BUILT_IN_TEMPLATE.description,
    fileName: BUILT_IN_TEMPLATE.fileName,
    runSheet: BUILT_IN_TEMPLATE.runSheet,
    isDefault,
    builtIn: true,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function toTemplateDTO(
  t: ReportTemplate,
  fileName: string,
  users: Map<number, UserRef>,
): TemplateDTO {
  return {
    id: t.id,
    projectId: t.projectId,
    suiteId: t.suiteId,
    name: t.name,
    description: t.description,
    fileName,
    runSheet: templateConfigOf(t).runSheet ?? null,
    isDefault: t.isDefault,
    builtIn: false,
    createdBy: refOf(users, t.createdById),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
