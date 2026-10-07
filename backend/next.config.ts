import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
    // Required for large video uploads (default truncates at 10MB)
    middlewareClientMaxBodySize: "2gb",
  },
};

export default nextConfig;
