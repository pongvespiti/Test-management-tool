import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';

/** Human message for any thrown error (API envelope message when available). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function notifyError(err: unknown, title = 'Something went wrong'): void {
  toast.error(title, { description: errorMessage(err), duration: 8000 });
}

export function notifyInfo(message: string, description?: string): void {
  toast.info(message, { description, duration: 2500 });
}

export function notifySuccess(message: string, description?: string): void {
  toast.success(message, { description, duration: 3500 });
}
