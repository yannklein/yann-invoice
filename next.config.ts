import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // The MCP consent page must not be framed (clickjacking the Allow button).
  async headers() {
    return [{ source: '/oauth/authorize', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }, { key: 'X-Frame-Options', value: 'DENY' }] }];
  },
};

export default nextConfig;
