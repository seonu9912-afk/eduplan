import { getOperationsData } from "@/lib/operations-data";
import { getTeachingData } from "@/lib/teaching-data";
import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/data";
import { seoulToday } from "@/lib/domain";
import { WorkspaceApp } from "@/components/workspace-app";
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; section: string }>;
  searchParams: Promise<{ year?: string; cohort?: string }>;
}) {
  const [p, q] = await Promise.all([params, searchParams]);
  if (
    ![
      "home",
      "notifications",
      "teachers",
      "calendar",
      "curriculum",
      "timetable",
      "plans",
      "settings",
      "people",
      "teaching",
    ].includes(p.section)
  )
    notFound();
  const context = await getWorkspaceContext(p.workspaceId, q.year, p.section);
  context.operations = await getOperationsData(context, p.section);
  if (p.section === "teaching" && context.year)
    context.teaching = await getTeachingData(p.workspaceId, context.year.id);
  return (
    <WorkspaceApp
      key={`${context.userId}-${p.workspaceId}-${context.year?.id}`}
      context={context}
      section={p.section}
      today={seoulToday()}
      initialCohort={q.cohort}
    />
  );
}
