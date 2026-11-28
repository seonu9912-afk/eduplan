"use server";
import { authoringIntegrityErrors } from "@/lib/teaching-authoring";
import { z } from "zod";
import { submissionScopeSchema, submissionStatusSchema, submissionDetailSchema } from "@/lib/teaching-submissions";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/domain";
import {
  courseSchema,
  standardSchema,
  teachingDocumentSchema,
} from "@/lib/teaching";
import type { Result } from "@/lib/models";
async function dbClient() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw Error("다시 로그인해 주세요.");
  return db;
}
async function run<T>(task: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await task() };
  } catch (e) {
    if (e instanceof z.ZodError)
      return {
        ok: false,
        error: e.issues[0]?.message ?? "입력값을 확인해 주세요.",
      };
    const err = e as { code?: string; message?: string };
    return {
      ok: false,
      error:
        err.code === "23505"
          ? "이미 등록된 자료입니다. 기존 항목을 선택해 주세요."
          : err.code === "23503"
            ? "연결된 과목·학급·성취기준의 범위를 확인해 주세요."
            : err.code === "42501"
              ? "이 자료에 대한 권한이 없습니다."
              : err.message && /[가-힣]/.test(err.message)
                ? err.message
                : "저장하지 못했습니다. 입력 내용을 유지했으니 연결 상태를 확인하고 다시 시도해 주세요.",
    };
  }
}
function refresh() {
  revalidatePath("/app", "layout");
}
export async function saveTeachingCourse(
  input: unknown,
  courseId: string | null = null,
  version = 0,
  copyFrom: string | null = null,
) {
  return run(async () => {
    const settings = courseSchema.parse(input);
    if (courseId) uuid.parse(courseId);
    if (copyFrom) uuid.parse(copyFrom);
    z.number().int().min(0).parse(version);
    const db = await dbClient();
    const { data, error } = await db.rpc("save_teaching_course", {
      target: settings.workspace_id,
      target_course: courseId as unknown as string,
      expected_version: version,
      settings,
      copy_from: copyFrom as unknown as string,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function saveTeachingPlan(
  courseId: string,
  version: number,
  input: unknown,
  confirm = false,
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    const payload = teachingDocumentSchema.parse(input);
    const connectionErrors = authoringIntegrityErrors(payload);
    if (connectionErrors.length) throw new Error(connectionErrors[0]);
    const db = await dbClient();
    const scope = {
      target_course: courseId,
      expected_version: version,
      payload,
    };
    const { data, error } = await db.rpc("save_teaching_plan", { ...scope, confirm_plan: confirm });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function setTeachingPlanEditors(courseId: string, version: number, users: unknown) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    const editors = z.array(uuid).max(50).parse(users);
    const db = await dbClient();
    const { data, error } = await db.rpc("set_teaching_plan_editors", {
      target_course: courseId, expected_version: version, editors,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function registerStandard(input: unknown) {
  return run(async () => {
    const v = standardSchema.parse(input);
    const db = await dbClient();
    const { data, error } = await db
      .from("achievement_standards")
      .insert(v)
      .select("*")
      .single();
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function teachingHistory(courseId: string) {
  return run(async () => {
    uuid.parse(courseId);
    const db = await dbClient();
    const { data, error } = await db
      .from("teaching_plan_versions")
      .select("course_id,version,action,actor_name,created_at")
      .eq("course_id", courseId)
      .order("version", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  });
}
export async function restoreTeachingPlan(
  courseId: string,
  version: number,
  revision: number,
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    z.number().int().positive().parse(revision);
    const db = await dbClient();
    const { data, error } = await db.rpc("restore_teaching_plan", {
      target_course: courseId,
      expected_version: version,
      revision,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function refreshTeachingReference(
  courseId: string,
  version: number,
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    const db = await dbClient();
    const { data, error } = await db.rpc("refresh_teaching_reference", {
      target_course: courseId,
      expected_version: version,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function archiveTeachingCourse(
  courseId: string,
  version: number,
  archived: boolean,
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    z.boolean().parse(archived);
    const db = await dbClient();
    const { data, error } = await db.rpc("archive_teaching_course", {
      target_course: courseId,
      expected_version: version,
      archived_value: archived,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}

export async function submitTeachingVersion(courseId: string, version: number, input: unknown) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    const scopes = z.array(submissionScopeSchema).min(1).max(3).refine(v => new Set(v).size === v.length).parse(input);
    const db = await dbClient();
    const { data, error } = await db.rpc("submit_teaching_version", { target_course: courseId, expected_version: version, scopes });
    if (error) throw error;
    refresh();
    return z.array(uuid).parse(data);
  });
}
export async function withdrawTeachingSubmission(id: string, status: string) {
  return run(async () => {
    uuid.parse(id);
    const expected = submissionStatusSchema.parse(status);
    if (expected !== "submitted" && expected !== "reviewing") throw Error("검토 대기 또는 검토 중인 제출만 철회할 수 있습니다.");
    const db = await dbClient();
    const { error } = await db.rpc("change_teaching_submission", { target_submission: id, expected_status: expected, next_status: "withdrawn" });
    if (error) throw error;
    refresh();
    return true;
  });
}

export async function readTeachingSubmission(id: string) {
  return run(async () => {
    uuid.parse(id);
    const db = await dbClient();
    const { data, error } = await db.rpc("read_teaching_submission", {target_submission: id});
    if (error) throw error;
    return submissionDetailSchema.parse(data);
  });
}
export async function reviewTeachingSubmission(id: string, status: string, next: unknown, input: unknown) {
  return run(async () => {
    uuid.parse(id);
    const expected = z.enum(["submitted","reviewing"]).parse(status);
    const nextStatus = z.enum(["reviewing","changes_requested","accepted"]).parse(next);
    const note = z.string().trim().max(3000).parse(input);
    if (nextStatus === "changes_requested" && !note) throw Error("수정 요청 사유를 입력하세요.");
    const db = await dbClient();
    const {error} = await db.rpc("change_teaching_submission", {target_submission:id,expected_status:expected,next_status:nextStatus,note});
    if(error) throw error;
    refresh();
    return true;
  });
}

export async function loadNationalReference(school:string,version:string,subject:string) {
  return run(async()=>{
    const {nationalSubjects,levelSourceSchema}=await import("@/lib/national-reference");
    z.enum(["초등학교","중학교","고등학교"]).parse(school);
    z.enum(["2022 개정","2015 개정","기타"]).parse(version);
    z.enum(nationalSubjects).parse(subject);
    const db=await dbClient();
    const [official,source]=await Promise.all([
      db.from("national_achievement_standards").select("id,area,code,content,subject,grade_band,notice,annex,printed_page,curriculum_version,school_type").eq("school_type",school).eq("curriculum_version",version).eq("subject",subject).order("code"),
      db.from("national_achievement_level_sources").select("payload").eq("school_type",school).eq("curriculum_version",version).eq("subject",subject).maybeSingle()
    ]);
    if(official.error)throw official.error;
    if(source.error)throw source.error;
    return {official:official.data??[],source:source.data?levelSourceSchema.parse(source.data.payload):null};
  });
}
export async function importNationalStandard(workspace:string,officialId:string|null,sourceHash:string|null,code:string|null){
  return run(async()=>{
    uuid.parse(workspace);
    const db=await dbClient();
    const {levelSourceSchema,hasPrivateGlyph}=await import("@/lib/national-reference");
    let input:unknown;
    if(officialId){
      uuid.parse(officialId);
      const {data,error}=await db.from("national_achievement_standards").select("*").eq("id",officialId).single();
      if(error)throw error;
      input={workspace_id:workspace,curriculum_version:data.curriculum_version,school_type:data.school_type,subject:data.subject,grade_band:data.grade_band,code:data.code,content:data.content};
    }else{
      z.string().regex(/^[0-9a-f]{64}$/).parse(sourceHash);
      z.string().min(1).max(80).parse(code);
      const {data,error}=await db.from("national_achievement_level_sources").select("*").eq("source_sha256",sourceHash!).single();
      if(error)throw error;
      const s=levelSourceSchema.parse(data.payload);
      const r=s.standards.find(v=>v.code===code);
      if(!r||r.source_code&&r.source_code!==r.code||r.linked_code&&r.linked_code!==r.code||hasPrivateGlyph(r.standard_text))throw Error("원문 코드 또는 수식 확인이 필요한 자료입니다. 직접 등록해 주세요.");
      input={workspace_id:workspace,curriculum_version:data.curriculum_version,school_type:data.school_type,subject:r.language??data.subject,grade_band:s.source.grade_band,code:r.code,content:r.standard_text};
    }
    const v=standardSchema.parse(input);
    const existing=()=>db.from("achievement_standards").select("*").eq("workspace_id",v.workspace_id).eq("curriculum_version",v.curriculum_version).eq("school_type",v.school_type).eq("subject",v.subject).eq("grade_band",v.grade_band).eq("code",v.code).maybeSingle();
    const first=await existing();
    if(first.error)throw first.error;
    if(first.data){if(first.data.content!==v.content)throw Error("같은 코드에 다른 내용이 등록되어 있습니다. 기존 자료를 확인하세요.");return first.data;}
    const inserted=await db.from("achievement_standards").insert(v).select("*").single();
    if(inserted.error){
      if(inserted.error.code==="23505"){const retry=await existing();if(!retry.error&&retry.data?.content===v.content)return retry.data;}
      throw inserted.error;
    }
    refresh();
    return inserted.data;
  });
}
