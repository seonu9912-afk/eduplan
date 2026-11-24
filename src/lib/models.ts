import type { SchoolType } from "./domain";
import type { Database } from "./database.types";
export type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Role = "admin" | "editor" | "viewer";
export type Member = {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
};
export type TeachingData = {
  courses: Row<"teaching_courses">[];
  editors: Row<"teaching_course_editors">[];
  classes: Row<"teaching_course_classes">[];
  plans: Row<"teaching_plans">[];
  standards: Row<"achievement_standards">[];
  copies: Pick<
    Row<"teaching_courses">,
    | "id"
    | "academic_year_id"
    | "grade"
    | "semester"
    | "subject_name"
    | "teacher_name"
  >[];
};
export type Context = {
  operations?: import("./staffing").OperationsData;
  teaching?: TeachingData;
  userId: string;
  email: string;
  profile: Row<"profiles">;
  workspaces: Row<"workspaces">[];
  workspace: Row<"workspaces">;
  role: Role;
  schoolType: SchoolType;
  grades: number[];
  years: Row<"academic_years">[];
  year: Row<"academic_years"> | null;
  annual: Row<"annual_academic_plans"> | null;
  semesters: Row<"semesters">[];
  classes: Row<"classes">[];
  events: Row<"events">[];
  activities: Row<"activity_log">[];
  groups: Row<"subject_groups">[];
  subjects: Row<"subjects">[];
  plans: Row<"curriculum_plans">[];
  hours: Row<"curriculum_hours">[];
  members: Member[];
  invitations: Pick<
    Row<"invitations">,
    "id" | "email" | "role" | "expires_at" | "accepted_at" | "revoked_at"
  >[];
};
export type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
