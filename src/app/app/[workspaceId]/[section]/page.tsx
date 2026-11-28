import { getOperationsData } from "@/lib/operations-data";
import { loadTeachingDeadlines } from "@/lib/teaching-deadlines-data";
import { getTeachingData } from "@/lib/teaching-data";
import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/data";
import { seoulToday, uuid } from "@/lib/domain";
import { loadSchoolTasks } from "@/lib/school-tasks-data";
import { WorkspaceApp } from "@/components/workspace-app";
import { managementDomains } from "@/lib/school-publications";
import { SchoolHomePublicData } from "@/components/features/school-home-public-data";
import { schoolMealEndTimes } from "@/lib/school-operations";
import { loadPlanOverview } from "@/lib/plan-overview.server";
import { loadOperationAudit } from "@/lib/operation-audit.server";
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; section: string }>;
  searchParams: Promise<{ year?: string; cohort?: string; view?: string; date?: string; period?: string; task?: string; source?: string; workItem?: string; quick?: string; submissionCourse?: string }>;
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
  const management = p.section === "teachers" || p.section === "teaching" || (q.view === "manage" && !!managementDomains[p.section]);
  const context = await getWorkspaceContext(p.workspaceId, q.year, p.section, management);
  const taskYear = !management && (p.section === "home" || p.section === "plans") ? context.year?.id : undefined;
  const [operations, tasks, teachingDeadlines] = await Promise.all([
    getOperationsData(context, p.section, management),
    taskYear ? loadSchoolTasks(context.workspace.id, taskYear) : undefined,
    context.year ? loadTeachingDeadlines(context.workspace.id,context.year.id) : undefined,
  ]);
  context.operations = operations;
  context.myTasks = tasks;
  context.teachingDeadlines = teachingDeadlines;
  if (taskYear) context.taskFocus = {
    id: uuid.safeParse(q.task).data,
    source: typeof q.source === "string" && q.source.length <= 80 ? q.source : undefined,
  };
  if (p.section === "teaching" && context.year && management)
    context.teaching = await getTeachingData(p.workspaceId, context.year.id);
  const [planOverview,operationAudit] = p.section === "settings" && context.role === "admin" ? await Promise.all([loadPlanOverview(context),loadOperationAudit(context)]) : [undefined,undefined];
  const today = seoulToday();
  return (
    <WorkspaceApp
      key={`${context.userId}-${p.workspaceId}-${context.year?.id}`}
      context={context}
      section={p.section}
      today={today}
      initialCohort={q.cohort}
      initialScheduleDate={q.date}
      initialSchedulePeriod={q.period}
      initialQuickAdd={q.quick==="1"}
      initialSubmissionCourse={uuid.safeParse(q.submissionCourse).data}
      initialWorkItem={typeof q.workItem === "string" && q.workItem.length <= 80 ? q.workItem : undefined}
      management={management}
      planOverview={planOverview}
      operationAudit={operationAudit}
      homePublicData={p.section === "home"
        ? <SchoolHomePublicData school={context.school} today={today} unavailable={context.schoolInfoError} mealEnds={schoolMealEndTimes(context, today)} />
        : undefined}
    />
  );
}
