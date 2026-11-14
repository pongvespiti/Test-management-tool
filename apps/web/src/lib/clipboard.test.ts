import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { copyText } from './clipboard';

type Writable = { writeText: (text: string) => Promise<void> };

function setClipboard(clipboard: Writable | undefined, secure: boolean) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
}

function stubExecCommand(result: boolean | Error) {
  const copied: string[] = [];
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: jest.fn(() => {
      if (result instanceof Error) throw result;
      copied.push(document.querySelector('textarea')?.value ?? '');
      return result;
    }),
  });
  return copied;
}

describe('copyText', () => {
  afterEach(() => {
    setClipboard(undefined, false);
    document.body.innerHTML = '';
  });

  it('uses the Clipboard API on HTTPS', async () => {
    const writeText = jest.fn(async (_text: string) => undefined);
    setClipboard({ writeText }, true);
    await expect(copyText('summary')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('summary');
  });

  it('falls back to a hidden text box on plain HTTP (no Clipboard API)', async () => {
    setClipboard(undefined, false);
    const copied = stubExecCommand(true);
    await expect(copyText('summary over http')).resolves.toBe(true);
    expect(copied).toEqual(['summary over http']);
    // The helper text box is gone again.
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back when the browser refuses the Clipboard API', async () => {
    setClipboard({ writeText: async () => Promise.reject(new Error('denied')) }, true);
    stubExecCommand(true);
    await expect(copyText('x')).resolves.toBe(true);
  });

  it('reports failure when neither way works, and gives focus back to the button', async () => {
    setClipboard(undefined, false);
    stubExecCommand(new Error('not allowed'));
    const dialog = document.createElement('div');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    await expect(copyText('x', button)).resolves.toBe(false);
    expect(document.activeElement).toBe(button);
    expect(dialog.querySelector('textarea')).toBeNull();
  });
});
