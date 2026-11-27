import type { AnnualPlan } from "./academic";
type Business = AnnualPlan["business"][number];

export function operationNames(plan: AnnualPlan): string[] {
  return plan.workSettings?.operationNames ??
    ((plan.workSettings?.dutyEnabled ?? plan.business.some((row) => row.kind === "당직")) ? ["당직"] : []);
}

export function operationName(row: Business): string | undefined {
  return row.kind === "당직" ? "당직" : row.kind === "운영업무" ? row.operationName : undefined;
}

export function visibleWorkItem(plan: AnnualPlan, row: Business) {
  const name = operationName(row);
  return !name || operationNames(plan).includes(name);
}

export function workItemTitle(row: Business) {
  const name = operationName(row) ?? (row.kind === "출장" ? "출장" : undefined);
  return name ? `${name} · ${row.text}${row.participants ? ` (${row.participants})` : ""}` : row.text;
}

export function workItemChoice(row: Partial<Business>) {
  return row.kind === "당직" ? "operation:당직" :
    row.kind === "운영업무" ? `operation:${row.operationName ?? ""}` : row.kind ?? "업무";
}
