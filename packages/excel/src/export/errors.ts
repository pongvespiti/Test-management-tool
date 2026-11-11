/** Problems with a report template (wrong file, missing run sheet, unsupported content). */
export class TemplateError extends Error {
  readonly code: 'INVALID_TEMPLATE' | 'TOO_LARGE' | 'RUN_SHEET_NOT_FOUND' | 'UNSUPPORTED_TEMPLATE';

  constructor(code: TemplateError['code'], message: string) {
    super(message);
    this.name = 'TemplateError';
    this.code = code;
  }
}
