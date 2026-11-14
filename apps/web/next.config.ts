import type { NextConfig } from 'next';

/**
 * The browser only talks to this Next.js server; `/api/*` is forwarded to the NestJS API by
 * `src/proxy.ts` (target from the API_URL environment variable at runtime), so the session
 * cookie stays first-party and no CORS is needed.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  experimental: {
    // Uploads (attachments, Excel imports, report templates, JUnit files) pass through the `/api`
    // proxy, which cuts bodies at 10 MB by default (the API then sees a broken request). The API
    // enforces MAX_UPLOAD_MB (default 25) with a clear message; this only has to stay above it.
    proxyClientMaxBodySize: '100mb',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
