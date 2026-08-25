import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],

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
