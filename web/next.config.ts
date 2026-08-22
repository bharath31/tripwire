import path from 'node:path';
import type { NextConfig } from 'next';

const repositoryRoot = path.resolve(process.cwd(), '..');

const isDevelopment = process.env.NODE_ENV === 'development';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://vitals.vercel-insights.com https://*.vercel-insights.com",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
  outputFileTracingRoot: repositoryRoot,
  poweredByHeader: false,
  turbopack: { root: repositoryRoot },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
