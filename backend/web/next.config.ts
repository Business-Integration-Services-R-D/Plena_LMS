import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    // Required for large video uploads (default truncates at 10MB)
    middlewareClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
