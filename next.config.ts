import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Stamped at build time so the home-page footer shows the deploy date.
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
