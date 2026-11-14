/**
 * Runs before every web test file: DOM matchers for `expect` and the browser APIs that jsdom lacks
 * but Radix UI primitives use.
 */
import '@testing-library/jest-dom/jest-globals';
import { afterEach } from '@jest/globals';
import { cleanup } from '@testing-library/react';
import { resetNavigation } from './mocks/next-navigation';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });
}

// Server-side tests (`@jest-environment node`) have no DOM.
const hasDom = typeof window !== 'undefined';

if (hasDom && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// Radix Select / Popover call these on elements.
if (hasDom) {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
}

afterEach(() => {
  if (!hasDom) return;
  cleanup();
  resetNavigation();
  window.localStorage.clear();
});
