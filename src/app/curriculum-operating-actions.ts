"use server";
import { requirePlanPermission } from "@/lib/plan-permissions.server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import type {Json} from "@/lib/database.types";
import type {Result} from "@/lib/models";
import type {OperatingDocument,SourceCohort} from "@/lib/curriculum-operating-v4";
import {composeOperating,validateOperating} from "@/lib/curriculum-operating-v4";
import type {CurriculumDocument} from "@/lib/curriculum-design";

const uuid=z.uuid();
const scope=z.object({workspaceId:uuid,year:z.number().int().min(2000).max(2100)});
const cell=z.object({
  subjectId:uuid,grade:z.number().int().min(1).max(3),
  semester:z.number().int().min(1).max(2),weekly:z.number().min(0).max(100),
  weeks:z.number().int().min(1).max(24),adjustment:z.number().min(-1500).max(1500),
  note:z.string().max(500),
});
const choice=z.object({
  id:uuid,name:z.string().min(1).max(100),grade:z.number().int().min(1).max(3),
  semester:z.number().int().min(1).max(2),subjectIds:z.array(uuid).min(2).max(50),
  requiredCount:z.number().int().min(1).max(49),
});
const offering=z.object({
  id:uuid,subjectId:uuid,grade:z.number().int().min(1).max(3),
  semester:z.number().int().min(1).max(2),classIds:z.array(uuid).max(100),
  teacherNames:z.array(z.string().min(1).max(100)).max(15),
  room:z.string().max(90),note:z.string().max(500),
});
const docSchema=z.object({
  format:z.literal("eduplan-operating-v4"),
  year:z.number().int().min(2000).max(2100),
  sourceVersions:z.record(z.string(),z.object({
    planId:uuid,planVersion:z.number().int().nonnegative(),
    documentVersion:z.number().int().nonnegative(),
  })),
  cells:z.array(cell).min(1).max(3500),
  choiceSets:z.array(choice).max(100),
  offerings:z.array(offering).max(1000),
});
const saveSchema=scope.extend({expectedVersion:z.number().int().nonnegative(),
  action:z.enum(["save","confirm"]).default("save"),document:docSchema});
async function access(workspaceId:string,edit:boolean){
  const db=await createClient();
  const {data:user,error:userError}=await db.auth.getUser();
  if(userError||!user.user)throw Error("로그인 후 교육과정을 열어 주세요.");
  const member=await db.from("workspace_members").select("role")
    .eq("workspace_id",workspaceId).eq("user_id",user.user.id).maybeSingle();
  if (member.error || !member.data) throw Error("이 학교의 구성원이 아닙니다.");
  if (edit) await requirePlanPermission(db, workspaceId, "curriculum");
  return db;
}
function issue(error:unknown){
  if(error instanceof z.ZodError)return error.issues[0]?.message??"시수 입력값을 확인해 주세요.";
  if(error instanceof Error)return error.message.replace(/(?:postgres|database|SQLSTATE)[^. ]*/gi,"저장 서버");
  return "운영편제 요청을 처리하지 못했습니다.";
}
async function projection(db:Awaited<ReturnType<typeof access>>,workspaceId:string,year:number){
  const years=[year,year-1,year-2];
  const plans=await db.from("curriculum_plans").select("id,cohort_year,version")
    .eq("workspace_id",workspaceId).in("cohort_year",years);
  if(plans.error)throw plans.error;
  const ids=plans.data.map(plan=>plan.id);
  const docs=ids.length?await db.from("curriculum_design_documents")
    .select("plan_id,version,document").eq("workspace_id",workspaceId).in("plan_id",ids)
    :{data:[],error:null};
  const legacy=ids.length?await db.from("curriculum_hours")
    .select("plan_id,subject_id,grade,semester,hours").eq("workspace_id",workspaceId)
    .in("plan_id",ids):{data:[],error:null};
  if(docs.error||legacy.error)throw Error("입학년도별 교육과정 데이터를 불러오지 못했습니다.");
  const sources:SourceCohort[]=plans.data.map(plan=>{
    const d=docs.data.find(x=>x.plan_id===plan.id);
    return {planId:plan.id,cohortYear:plan.cohort_year,planVersion:plan.version,
      documentVersion:d?.version??0,document:(d?.document as unknown as CurriculumDocument)??null,
      legacyHours:legacy.data.filter(x=>x.plan_id===plan.id).map(x=>({
        subjectId:x.subject_id,grade:x.grade,semester:x.semester,hours:x.hours,
      }))};
  });
  return {computed:composeOperating(year,sources),
    missing:years.filter(y=>!sources.some(s=>s.cohortYear===y)),
    sources:sources.map(s=>({cohort:s.cohortYear,version:s.documentVersion,
      kind:s.document?"3개년 상세 문서":"기존 학기 편성표"}))};
}
export type OperatingLoad={
  document:OperatingDocument|null;version:number;status:"draft"|"confirmed";
  projection:OperatingDocument;missing:number[];
  sources:{cohort:number;version:number;kind:string}[];
  history:{version:number;saved_at:string;status:string}[];
};
export async function loadOperatingV4(input:unknown):Promise<Result<OperatingLoad>>{
  try{
    const v=scope.parse(input),db=await access(v.workspaceId,false);
    const [record,history,source]=await Promise.all([
      db.from("curriculum_operating_sheets").select("document,version,status")
        .eq("workspace_id",v.workspaceId).eq("academic_year",v.year).maybeSingle(),
      db.from("curriculum_operating_history").select("version,saved_at,status")
        .eq("workspace_id",v.workspaceId).eq("academic_year",v.year)
        .order("version",{ascending:false}).limit(12),
      projection(db,v.workspaceId,v.year),
    ]);
    if(record.error||history.error)throw Error("운영편제 저장 내용을 불러오지 못했습니다.");
    const doc=record.data?.document as OperatingDocument|undefined;
    return {ok:true,data:{document:doc??null,version:record.data?.version??0,
      status:(record.data?.status as "draft"|"confirmed")??"draft",
      projection:source.computed,missing:source.missing,sources:source.sources,
      history:history.data??[]}};
  }catch(error){return {ok:false,error:issue(error)};}
}
export async function saveOperatingV4(input:unknown):Promise<Result<{version:number;status:string}>>{
  try{
    const v=saveSchema.parse(input);
    const errors=validateOperating(v.document);
    if(v.document.year!==v.year||errors.length)
      throw Error(errors[0]??"운영 학년도와 편성표가 일치하지 않습니다.");
    const db=await access(v.workspaceId,true);
    const subjects=await db.from("subjects").select("id").eq("workspace_id",v.workspaceId);
    if(subjects.error)throw Error("교과목 목록을 검증하지 못했습니다.");
    const validIds=new Set(subjects.data.map(x=>x.id));
    if(v.document.cells.some(x=>!validIds.has(x.subjectId))||
      v.document.choiceSets.some(x=>x.subjectIds.some(id=>!validIds.has(id)))||
      v.document.offerings.some(x=>!validIds.has(x.subjectId)))
      throw Error("등록되지 않은 교과목이 포함돼 있습니다.");
    const response=await db.rpc("save_curriculum_operating_v4",{
      p_workspace:v.workspaceId,p_year:v.year,p_expected_version:v.expectedVersion,
      p_document:v.document as unknown as Json,p_action:v.action,
    });
    if(response.error)throw response.error;
    const result=z.object({ok:z.boolean(),version:z.number(),
      reason:z.string().optional(),status:z.string().optional()}).parse(response.data);
    if(!result.ok)throw Error(result.reason==="confirmed"
      ?"확정된 운영편제입니다. 원본은 보호되며 새 버전을 별도로 작성해야 합니다."
      :"다른 사용자가 먼저 저장했습니다. 새로고침 전에 입력값을 복사하거나 변경 이력을 확인해 주세요.");
    revalidatePath("/app","layout");
    return {ok:true,data:{version:result.version,status:result.status??"draft"}};
  }catch(error){return {ok:false,error:issue(error)};}
}
