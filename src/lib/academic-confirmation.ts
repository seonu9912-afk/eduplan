import { annualSchema, type AnnualPlan } from "./academic";
import type { ExportData } from "./academic-workbook";
import type { Json } from "./database.types";

export type AcademicConfirmation = {
  at: string;
  version: number;
  document: AnnualPlan;
  source: ExportData;
};

export function parseAcademicConfirmation(value: Json | undefined): AcademicConfirmation | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const { at, version, document, source } = value;
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) || typeof version !== "number" ||
      !source || Array.isArray(source) || typeof source !== "object" ||
      !["grades", "semesters", "events", "plans", "hours", "subjects", "groups"]
        .every((key) => Array.isArray(source[key]))) return null;
  const parsed = annualSchema.safeParse(document);
  if (!parsed.success) return null;
  return { at, version, document: parsed.data, source: source as unknown as ExportData };
}
