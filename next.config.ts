import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'i.pinimg.com' },
      { protocol: 'https', hostname: '**.pinimg.com' },
      { protocol: 'https', hostname: '**' }
    ]
  },
  serverExternalPackages: ['pg']
};

export default nextConfig;
