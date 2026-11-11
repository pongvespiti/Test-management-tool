/** DOM helpers for page-level keyboard shortcuts and paste handling (run page, defect page). */

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'number',
  'password',
  'tel',
  'url',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

/** True when the element takes typed text (inputs, textareas, selects, contenteditable). */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

/** True for elements whose own Enter/Space behaviour must win (buttons, links, menu items …). */
export function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="option"], [role="checkbox"], [role="tab"]',
    ),
  );
}

/**
 * An open dialog, alert dialog, sheet or popover: page shortcuts must not act behind it. Dialogs
 * marked `data-page-shortcuts` (the run case drawer on small screens) keep the page shortcuts.
 */
export function isModalOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"]:not([data-page-shortcuts]), [role="alertdialog"][data-state="open"]',
    ) !== null
  );
}

/** The event happened inside a popover, menu, listbox or command list. */
export function isInDropdown(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      '[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [cmdk-root]',
    ),
  );
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** `screenshot-20261028-141503.png` for a pasted image without a useful name. */
export function pastedImageName(file: Blob, now = new Date()): string {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `screenshot-${stamp}.${IMAGE_EXT[file.type] ?? 'png'}`;
}
