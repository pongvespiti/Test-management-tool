/**
 * Test double of `next/navigation` (mapped in jest.config.js). Tests set the current URL with
 * `setNavigation()` and assert navigations on `mockRouter`.
 */
import { jest } from '@jest/globals';

interface NavigationState {
  pathname: string;
  search: string;
  params: Record<string, string | string[]>;
}

const initial: NavigationState = { pathname: '/', search: '', params: {} };
let state: NavigationState = { ...initial };

export const mockRouter = {
  push: jest.fn<(href: string) => void>(),
  replace: jest.fn<(href: string) => void>(),
  back: jest.fn<() => void>(),
  forward: jest.fn<() => void>(),
  refresh: jest.fn<() => void>(),
  prefetch: jest.fn<(href: string) => void>(),
};

export function setNavigation(next: Partial<NavigationState>): void {
  state = { ...state, ...next };
}

export function resetNavigation(): void {
  state = { ...initial };
  for (const fn of Object.values(mockRouter)) fn.mockReset();
}

export const useRouter = () => mockRouter;
export const usePathname = () => state.pathname;
export const useSearchParams = () => new URLSearchParams(state.search);
export const useParams = () => state.params;
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];

export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}

export function redirect(url: string): never {
  throw new Error(`NEXT_REDIRECT ${url}`);
}
