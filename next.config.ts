import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

function gitCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA || process.env.EDUPLAN_SOURCE_SHA)
    return (
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.EDUPLAN_SOURCE_SHA || ""
    );
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const nextConfig = (phase: string): NextConfig => {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const environment = process.env.VERCEL_ENV;
    const branch = process.env.VERCEL_GIT_COMMIT_REF;
    const supabaseHost =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
    if (environment === "production" && branch !== "main") {
      throw new Error(
        "EduPlan Production deploys from the GitHub main branch.",
      );
    }
    if (
      environment === "preview" &&
      supabaseHost === "sssyjkwcsyeyfkqmdgnb.supabase.co"
    ) {
      throw new Error("EduPlan Preview requires an isolated Supabase project.");
    }
  }
  return {
    async headers() {
      return [
        {
          source: "/lesson-sw.js",
          headers: [
            {
              key: "Cache-Control",
              value: "no-cache, no-store, must-revalidate",
            },
            { key: "Service-Worker-Allowed", value: "/" },
            {
              key: "Content-Type",
              value: "application/javascript; charset=utf-8",
            },
          ],
        },
      ];
    },
    env: {
      EDUPLAN_BUILD_TIME:
        phase === PHASE_PRODUCTION_BUILD ? new Date().toISOString() : "",
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
  };
};

export default nextConfig;
