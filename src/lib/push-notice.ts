import { annualSchema } from "./academic";
import {
  createLessonResolver,
  publishedTimetable,
  myTeacherIds,
  currentAndNext,
  seoulClock,
} from "./school-operations";
import { gradesForSchoolType, schoolTypeSchema } from "./domain";
import { resourcesSchema } from "./planning-resources";
import { emptyOperations, type TeacherDirectory } from "./staffing";
import type { Context } from "./models";
export type PushSource = Pick<
  Context,
  | "userId"
  | "workspace"
  | "year"
  | "annual"
  | "semesters"
  | "classes"
  | "subjects"
  | "events"
> & {
  directory: TeacherDirectory[];
  publication: NonNullable<Context["operations"]>["publication"];
  effectiveTimetables: NonNullable<
    Context["operations"]
  >["effectiveTimetables"];
  resources: unknown;
};
/** This module is also bundled for the Edge worker. All lesson calculation stays in the common engine. */
export function pushNotice(source: PushSource, lead: number, now = new Date()) {
  const schoolType = schoolTypeSchema.parse(source.workspace.school_type);
  if (
    !source.year ||
    !source.annual ||
    !annualSchema.safeParse(source.annual.document).success
  )
    return null;
  const c: Context = {
    ...source,
    schoolType,
    grades: gradesForSchoolType(schoolType),
    email: "",
    profile: {
      id: source.userId,
      display_name: "",
      default_workspace_id: null,
    },
    role: "viewer",
    workspaces: [],
    years: [source.year],
    groups: [],
    plans: [],
    hours: [],
    members: [],
    invitations: [],
    activities: [],
    operations: {
      ...emptyOperations(),
      directory: source.directory,
      publication: source.publication,
      effectiveTimetables: source.effectiveTimetables,
      resources: resourcesSchema.parse(source.resources),
    },
  };
  const doc = publishedTimetable(c);
  if (!doc || lead <= 0) return null;
  const clock = seoulClock(now),
    ids = myTeacherIds(c),
    { next, remaining } = currentAndNext(
      createLessonResolver(
        c,
        doc,
      )(clock.date).filter((l) => ids.has(l.teacherId)),
      clock.minutes,
    );
  if (!next || remaining === null || remaining > lead) return null;
  return {
    title: `${remaining}분 후 ${next.subject} · ${next.classes} · ${next.period}교시`,
    signature: `${next.date}:${next.id}:${next.teacherId}:${next.start}:${next.end}`,
    workspaceId: c.workspace.id,
    year: c.year!.year,
    lead,
    expiresAt: Date.parse(`${next.date}T${next.start}:00+09:00`),
    path: `/app/${c.workspace.id}/home?year=${c.year!.year}`,
  };
}
