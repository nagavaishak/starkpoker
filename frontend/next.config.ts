import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force webpack (not Turbopack) — Next.js 16 uses Turbopack by default
  // but Turbopack panics on file: symlinked workspace packages.
  // Build scripts use `next build --webpack` to select webpack.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Stub Node-only modules that circomlibjs/snarkjs reference on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
