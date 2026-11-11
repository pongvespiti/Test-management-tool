/** Raised for files the import engine cannot read (wrong type, corrupt, too large when unpacked). */
export class ImportFormatError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ImportFormatError';
    this.code = code;
  }
}
