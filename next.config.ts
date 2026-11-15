import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

function gitCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA || process.env.EDUPLAN_SOURCE_SHA)
    return process.env.VERCEL_GIT_COMMIT_SHA || process.env.EDUPLAN_SOURCE_SHA || "";
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const nextConfig = (phase: string): NextConfig => ({
  env: {
    EDUPLAN_BUILD_TIME: phase === PHASE_PRODUCTION_BUILD ? new Date().toISOString() : "",
    EDUPLAN_BUILD_SHA: gitCommit(),
    EDUPLAN_BUILD_ENV: process.env.VERCEL_ENV ?? "development",
    EDUPLAN_BUILD_ID: process.env.VERCEL_DEPLOYMENT_ID ?? "",
  },
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
});

export default nextConfig;
