import { version } from "../../package.json";

export const buildInfo = {
  version,
  builtAt: process.env.EDUPLAN_BUILD_TIME || null,
  commit: process.env.EDUPLAN_BUILD_SHA || null,
  deployment: process.env.EDUPLAN_BUILD_ENV || "development",
  id: process.env.EDUPLAN_BUILD_ID || null,
};
