import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    webpackMemoryOptimizations: true,
    webpackBuildWorker: false,
    preloadEntriesOnStart: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.parallelism = 1;
      if (config.optimization?.minimizer) {
        config.optimization.minimizer = config.optimization.minimizer.map(
          (plugin: { options?: { parallel?: boolean | number } }) => {
            if (plugin.options) plugin.options.parallel = false;
            return plugin;
          }
        );
      }
    }
    return config;
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Frame-Options",
          value: "SAMEORIGIN",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
      ],
    },
  ],
};

export default nextConfig;
