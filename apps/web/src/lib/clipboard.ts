/**
 * Copies text to the clipboard. `navigator.clipboard` only exists on HTTPS/localhost, and the tool is
 * often opened over plain HTTP on the internal server, so fall back to a hidden textarea + execCommand.
 * `near` is an element to attach the textarea to (keeps it inside a modal's focus trap).
 */
export async function copyText(text: string, near?: HTMLElement | null): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall back below
    }
  }
  const host = near?.parentElement ?? document.body;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  Object.assign(ta.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  host.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  host.removeChild(ta);
  near?.focus();
  return ok;
}
