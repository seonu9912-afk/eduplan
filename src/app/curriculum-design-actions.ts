"use server";
import { requirePlanPermission } from "@/lib/plan-permissions.server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/domain";
import { type CurriculumDocument } from "@/lib/curriculum-design";
import type { Result } from "@/lib/models";
import type { Json } from "@/lib/database.types";

const idOnly = z.object({ planId: uuid });
const sourceVersion = z.object({
  planId: uuid,
  expectedPlanVersion: z.number().int().positive(),
  expectedDocVersion: z.number().int().nonnegative(),
  document: z.object({
    format: z.literal("eduplan-curriculum-v2"),
    cohortYear: z.number().int().min(2000).max(2100),
    weeks: z.record(z.string(), z.object({
      count: z.union([z.literal(16),z.literal(17)]),
      status: z.enum(["confirmed","provisional"]),
    })),
    termWeeks: z.record(z.string(),z.object({
      count:z.union([z.literal(16),z.literal(17)]),
      status:z.enum(["confirmed","provisional"]),
    })).optional(),
    excludedSubjectIds:z.array(uuid).max(300).optional(),
    choiceSets:z.array(z.object({
      id:uuid,name:z.string().trim().min(1).max(100),
      grade:z.number().int().min(1).max(6),semester:z.number().int().min(1).max(2),
      subjectIds:z.array(uuid).min(2).max(50),
      requiredCount:z.number().int().min(1).max(49),
    })).max(100).optional(),
    cells: z.array(z.object({
      subjectId: uuid, grade: z.number().int().min(1).max(6),
      semester: z.number().int().min(1).max(2),
      weekly: z.number().min(0).max(100),
      manual: z.number().min(-2000).max(2000),
      adjustments: z.array(z.object({
        id: z.string().max(70), kind: z.string().max(80), hours: z.number().min(-2000).max(2000),
        note: z.string().max(500).optional(),
      })).max(20),
    })).min(1).max(3600),
  }),
});
function issue(error: unknown) {
  if(error instanceof z.ZodError) return error.issues[0]?.message ?? "입력한 값을 확인해 주세요.";
  // Supabase/PostgREST returns plain objects, not Error instances.
  if(error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message.replace(/(?:postgres|database|SQLSTATE)[^.]*/ig,"저장 서버");
  return "교육과정 서버 요청에 실패했습니다.";
}
async function checkWorkspace(planId: string, canEdit: boolean) {
  const db=await createClient();
  const identity=await db.auth.getUser();
  if(identity.error || !identity.data.user) throw Error("로그인이 필요합니다.");
  const plan=await db.from("curriculum_plans").select("id,workspace_id,cohort_year,version")
    .eq("id",planId).maybeSingle();
  if(plan.error || !plan.data) throw Error("편성표를 찾지 못했습니다.");
  const membership=await db.from("workspace_members").select("role")
    .eq("workspace_id",plan.data.workspace_id).eq("user_id",identity.data.user.id).maybeSingle();
  if (membership.error || !membership.data) throw Error("이 학교의 구성원이 아닙니다.");
  if (canEdit) await requirePlanPermission(db, plan.data.workspace_id, "curriculum");
  return {db,plan:plan.data,role:membership.data.role,userId:identity.data.user.id};
}
export async function loadCurriculumDesign(input: unknown): Promise<Result<{
  document: CurriculumDocument | null;
  documentVersion:number;
  planVersion:number;
  lock:{editor_id:string;expires_at:string}|null;
  snapshots:{id:string;version:number;confirmed_at:string}[];
}>> {
  try {
    const {planId}=idOnly.parse(input);
    const {db,plan}=await checkWorkspace(planId,false);
    const [doc,lock,snaps]=await Promise.all([
      db.rpc("read_curriculum_design",{target_plan:planId}),
      db.from("curriculum_design_locks").select("editor_id,expires_at").eq("plan_id",planId).maybeSingle(),
      db.from("curriculum_design_snapshots").select("id,version,confirmed_at")
        .eq("plan_id",planId).order("confirmed_at",{ascending:false}).limit(8),
    ]);
    if(doc.error||lock.error||snaps.error) throw Error("교육과정 상세 자료를 불러오지 못했습니다.");
    const saved=doc.data as unknown as {document:unknown;version:number;planVersion:number}|null;
    return {ok:true,data:{
      document: (saved?.document as unknown as CurriculumDocument)??null,
      documentVersion:saved?.version??0,
      planVersion:saved?.planVersion??plan.version,
      lock:lock.data??null,snapshots:snaps.data??[],
    }};
  } catch(error){return {ok:false,error:issue(error)};}
}
export async function claimCurriculumDesign(input: unknown): Promise<Result<{
  acquired:boolean;expires_at?:string;editor_id?:string;
}>> {
  try{
    const data=z.object({planId:uuid,force:z.boolean().optional()}).parse(input);
    const {db,role}=await checkWorkspace(data.planId,true);
    if(data.force && role!=="admin") throw Error("관리자만 편집권을 회수할 수 있습니다.");
    const result=await db.rpc("curriculum_design_acquire",
      {target_plan:data.planId,take_over:data.force??false});
    if(result.error)throw result.error;
    const output=z.object({acquired:z.boolean(),expires_at:z.string().optional(),
      editor_id:z.string().optional()}).parse(result.data);
    return {ok:true,data:output};
  }catch(error){return {ok:false,error:issue(error)};}
}
export async function releaseCurriculumDesign(input: unknown): Promise<Result> {
  try{
    const {planId}=idOnly.parse(input);
    const {db}=await checkWorkspace(planId,true);
    const result=await db.rpc("curriculum_design_release",{target_plan:planId});
    if(result.error) throw result.error;
    return {ok:true,data:undefined};
  }catch(error){return {ok:false,error:issue(error)};}
}
export async function saveCurriculumDesign(input: unknown): Promise<Result<{
  ok:boolean;planVersion:number;documentVersion:number;
}>> {
  try{
    const v=sourceVersion.parse(input);
    const {db,plan}=await checkWorkspace(v.planId,true);
    if(v.document.cohortYear!==plan.cohort_year)throw Error("입학년도와 편성표가 일치하지 않습니다.");
    const response=await db.rpc("curriculum_design_save",{
      target_plan:v.planId,expected_plan_version:v.expectedPlanVersion,
      expected_doc_version:v.expectedDocVersion,next_document:v.document as unknown as Json,
    });
    if(response.error)throw response.error;
    const output=z.object({ok:z.boolean(),planVersion:z.number(),documentVersion:z.number()}).parse(response.data);
    if(!output.ok)throw Error("다른 교사가 먼저 저장했거나 편집권이 만료되었습니다. 입력 내용은 그대로 유지됩니다. 최신 편성표와 편집권을 확인해 주세요.");
    revalidatePath("/app","layout");
    return {ok:true,data:output};
  }catch(error){return {ok:false,error:issue(error)};}
}
export async function confirmCurriculumDesign(input: unknown): Promise<Result<{id:string;version:number}>> {
  try{
    const {planId,expectedPlanVersion,expectedDocVersion,startsOn,note}=z.object({
      planId:uuid,expectedPlanVersion:z.number().int().positive(),expectedDocVersion:z.number().int().positive(),
      startsOn:z.iso.date().optional(),note:z.string().trim().max(500).default(""),
    }).parse(input);
    const {db}=await checkWorkspace(planId,true);
    const version={
      target_plan:planId,expected_plan_version:expectedPlanVersion,expected_doc_version:expectedDocVersion,
    };
    const response=startsOn
      ? await db.rpc("publish_curriculum_from",{...version,effective_date:startsOn,note})
      : await db.rpc("curriculum_design_confirm_version",version);
    if(response.error)throw response.error;
    const output=z.object({ok:z.boolean(),id:uuid,version:z.number()}).parse(response.data);
    revalidatePath("/app","layout");
    return {ok:true,data:{id:output.id,version:output.version}};
  }catch(error){return {ok:false,error:issue(error)};}
}
