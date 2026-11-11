import { cn } from '@/lib/utils';
import type { HttpMethod } from './openapi';

/** Colours per HTTP method (text on background ≥ 4.5:1, same palette as the status pills). */
const METHOD_TONES: Record<HttpMethod, string> = {
  get: 'border-[#a5d8ff] bg-[#e7f5ff] text-[#1864ab]',
  post: 'border-[#b2f2bb] bg-[#ebfbee] text-[#237032]',
  put: 'border-[#ffd8a8] bg-[#fff4e6] text-[#b45309]',
  patch: 'border-[#d0bfff] bg-[#f3f0ff] text-[#6741d9]',
  delete: 'border-[#ffc9c9] bg-[#fff5f5] text-[#c92a2a]',
};

export function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] w-[62px] flex-none items-center justify-center rounded-md border font-mono text-[11.5px] font-bold tracking-[0.03em]',
        METHOD_TONES[method],
      )}
    >
      {method.toUpperCase()}
    </span>
  );
}
