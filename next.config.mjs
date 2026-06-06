import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  compress: true,
  experimental: {
    optimizeCss: true,
  },
  webpack(config, { isServer, nextRuntime }) {
    // web-push and pg use Node.js built-ins (http, https, net, tls).
    // For client and edge-runtime bundles these aren't available, so
    // tell webpack to skip them (the actual code path is guarded by
    // NEXT_RUNTIME check at runtime and never runs in those envs).
    if (!isServer || nextRuntime === 'edge') {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        http: false,
        https: false,
        fs: false,
        stream: false,
        crypto: false,
        os: false,
        perf_hooks: false,
        dns: false,
        path: false,
        zlib: false,
        child_process: false,
      };
    }
    return config;
  },
  images: {
    formats: ['image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    minimumCacheTTL: 2592000,
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
