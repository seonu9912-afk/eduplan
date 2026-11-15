import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never log auth action arguments (email/password) in development.
  logging: {
    serverFunctions: false,
    incomingRequests: { ignore: [/\/auth\//, /\/invite\//] },
  },
  experimental: {
    serverComponentsHmrCache: false,
    serverActions: { bodySizeLimit: "2mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
