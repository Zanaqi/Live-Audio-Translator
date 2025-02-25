import type { NextConfig } from 'next'
import type { Configuration } from 'webpack'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config: Configuration, { isServer }) => {
    if (!Array.isArray(config.externals)) {
      config.externals = [];
    }
    if (isServer) {
      config.externals = [
        ...(config.externals as string[]),
        'ws'
      ];
    }
    return config;
  },
}

export default nextConfig