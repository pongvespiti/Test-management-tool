import { serverEnv } from '@/lib/env';
import { forwardUpload } from '@/lib/upload-forward';
import { streamingFetch } from '@/lib/upload-transport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Evidence uploads (screen recordings can be hundreds of MB) are streamed straight to the API.
 * They do not go through `/api/*` and `src/proxy.ts`, because Next.js holds a request body that
 * passes its proxy in memory. Same API endpoint, same rules: POST /api/v1/projects/:id/attachments.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await params;
  return forwardUpload(request, serverEnv.apiUrl, projectId, streamingFetch);
}
