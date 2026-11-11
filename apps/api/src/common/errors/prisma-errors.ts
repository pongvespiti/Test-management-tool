import { Prisma } from '@tmt/database';

interface AdapterCause {
  originalCode?: string;
  constraint?: { index?: string; fields?: string[] };
}

function adapterCause(e: Prisma.PrismaClientKnownRequestError): AdapterCause | undefined {
  const meta = e.meta as { driverAdapterError?: { cause?: AdapterCause } } | undefined;
  return meta?.driverAdapterError?.cause;
}

/**
 * True for a unique-constraint violation (Prisma P2002), optionally of one constraint/index name
 * (e.g. `projects_key_key`) so services can map it to a specific error code.
 */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  if (!constraint) return true;
  const cause = adapterCause(e);
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  return (
    cause?.constraint?.index === constraint ||
    (Array.isArray(target) && target.includes(constraint)) ||
    target === constraint
  );
}

/** True when a required record was not found (Prisma P2025). */
export function isRecordNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}

/** Socket errors and PostgreSQL connection/shutdown states (class 08, 57P0x). */
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
]);

/** True when the database cannot be reached (mapped to 503 instead of 500). */
export function isDbUnavailable(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && DB_DOWN_CODES.has(code)) return true;
    if (cur instanceof Prisma.PrismaClientInitializationError) return true;
    if (
      cur instanceof Error &&
      /Connection terminated|timeout exceeded when trying to connect|ECONNREFUSED/i.test(
        cur.message,
      )
    ) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
