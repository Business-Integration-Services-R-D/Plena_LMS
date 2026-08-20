import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1gb",
    },
    // Required for large video uploads (default truncates at 10MB)
    middlewareClientMaxBodySize: "1gb",
  },
};

export default nextConfig;
