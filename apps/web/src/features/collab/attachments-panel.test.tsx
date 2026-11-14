import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { makeProject, renderWithProviders } from '@/test/render';
import { mockApi } from '../cases/test-utils';
import { bob, installFakeXhr, makeAttachment } from '../runs/test-fixtures';
import { AttachmentsPanel } from './attachments-panel';

const image = makeAttachment();
const pdf = makeAttachment({
  id: 'a2',
  fileName: 'log.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 3 * 1024 * 1024,
  createdBy: bob,
});

function renderPanel(props: Partial<Parameters<typeof AttachmentsPanel>[0]> = {}, role = 'tester') {
  return renderWithProviders(
    <AttachmentsPanel
      entityType="run_case"
      entityId={101}
      attachments={[image, pdf]}
      canUpload
      pasteToUpload
      {...props}
    />,
    { project: makeProject({ myRole: role as 'tester' }) },
  );
}

function pasteImage(target: EventTarget, name: string, types = ['Files']) {
  const file = new File(['png'], name, { type: 'image/png' });
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [file], types } });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('AttachmentsPanel', () => {
  it('shows thumbnails with open and download links; testers delete their own files', async () => {
    const api = mockApi({ 'DELETE /projects/3/attachments/a1': undefined });
    const { user } = renderPanel();
    expect(screen.getByRole('link', { name: 'Open screen.png' })).toHaveAttribute(
      'href',
      '/api/v1/projects/3/attachments/a1/download',
    );
    expect(screen.getByRole('link', { name: 'Download log.pdf' })).toHaveAttribute(
      'href',
      '/api/v1/projects/3/attachments/a2/download?download=1',
    );
    expect(screen.getByText('3.0 MB · Bob Lead')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete log.pdf' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete screen.png' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete file “screen.png”?');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/attachments/a1')).toHaveLength(1));
  });

  it('lets a lead delete any file', () => {
    renderPanel({}, 'lead');
    expect(screen.getByRole('button', { name: 'Delete log.pdf' })).toBeInTheDocument();
  });

  it('uploads chosen files with progress', async () => {
    const requests = installFakeXhr();
    const { user, container } = renderPanel({ attachments: [] });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    const req = requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/upload/projects/3/attachments');
    expect(req.body.get('entityType')).toBe('run_case');
    expect(req.body.get('entityId')).toBe('101');
    expect((req.body.get('file') as File).name).toBe('notes.txt');
    act(() => req.progress(0.5));
    expect(screen.getByRole('progressbar', { name: 'Uploading notes.txt' })).toBeInTheDocument();
    await act(async () => req.respond(201, makeAttachment({ id: 'a9', fileName: 'notes.txt' })));
    await waitFor(() =>
      expect(screen.queryByRole('progressbar', { name: 'Uploading notes.txt' })).toBeNull(),
    );
  });

  it('reports a failed upload', async () => {
    const error = jest.spyOn(toast, 'error');
    const requests = installFakeXhr();
    const { user, container } = renderPanel();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'big.mp4', { type: 'video/mp4' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () =>
      requests[0]!.respond(413, { error: { code: 'TOO_LARGE', message: 'File too large' } }),
    );
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Could not upload big.mp4', expect.anything()),
    );
  });

  it('uploads pasted screenshots, but not inside a text field holding text', async () => {
    const requests = installFakeXhr();
    renderPanel();
    const event = pasteImage(document.body, 'image.png');
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect((requests[0]!.body.get('file') as File).name).toMatch(/^screenshot-\d{8}-\d{6}\.png$/);
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    pasteImage(field, 'chart.png', ['Files', 'text/plain']);
    pasteImage(field, 'chart.png');
    await waitFor(() => expect(requests).toHaveLength(2));
    expect((requests[1]!.body.get('file') as File).name).toBe('chart.png');
    field.remove();
  });

  it('shows read-only lists without upload', () => {
    renderPanel({ canUpload: false, attachments: [] }, 'viewer');
    expect(screen.getByText('No files attached.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload files' })).not.toBeInTheDocument();
    fireEvent.paste(document.body);
  });
});
