import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    middlewareClientMaxBodySize: '100mb',
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },

  async redirects() {
    return [
      {
        source: '/studio',
        destination: '/',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
