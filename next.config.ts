import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tăng giới hạn body size của proxy layer lên 50GB cho file video 20GB+ siêu lớn
    proxyClientMaxBodySize: '50gb',

    // Tăng giới hạn body size cho Server Actions / Uploads
    serverActions: {
      bodySizeLimit: '50gb',
    },
  },

  // Đảm bảo better-sqlite3 (native addon) không bị bundle vào client
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
