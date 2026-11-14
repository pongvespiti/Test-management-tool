import { describe, expect, it } from '@jest/globals';
import nextConfig from '../../next.config';

/** Bytes of a Next.js size string such as '100mb'. */
function bytes(size: string | number | undefined): number {
  if (typeof size === 'number') return size;
  const m = /^(\d+)(kb|mb|gb)$/i.exec(size ?? '');
  if (!m) return 0;
  const unit = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[
    m[2]!.toLowerCase() as 'kb' | 'mb' | 'gb'
  ];
  return Number(m[1]) * unit;
}

describe('next.config', () => {
  it('lets uploads through the /api proxy up to well above the API upload limit (25 MB default)', () => {
    // Below the API limit the proxy cuts the body and people get a bare 500 instead of the API's
    // "File too large" message.
    expect(bytes(nextConfig.experimental?.proxyClientMaxBodySize)).toBeGreaterThan(26 * 1024 ** 2);
  });
});
