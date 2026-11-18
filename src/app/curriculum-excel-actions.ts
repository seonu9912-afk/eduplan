"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {uuid} from "@/lib/domain";
import type {Result} from "@/lib/models";
import type {Json} from "@/lib/database.types";

const term=z.object({
  grade:z.number().int().min(1).max(3),
  semester:z.number().int().min(1).max(2),
  weekly:z.number().min(0).max(100),
  final:z.number().int().min(0).max(2000),
  adjustment:z.number().min(-2000).max(2000),
});
const schema=z.object({
  workspaceId:uuid,year:z.number().int().min(2000).max(2100),
  kind:z.enum(["cohort","operating"]),
  courses:z.array(z.object({name:z.string().trim().min(1).max(90),
    group:z.string().trim().min(1).max(60),
    terms:z.array(term).max(6)})).min(1).max(120),
});
export async function applyCurriculumExcel(input:unknown):Promise<Result<{
  batchId:string;groups:number;subjects:number;hours:number;cohorts:number;
}>>{
 try{
  const v=schema.parse(input);
  const db=await createClient();
  const auth=await db.auth.getUser();
  if(auth.error||!auth.data.user)throw Error("로그인이 필요합니다.");
  const member=await db.from("workspace_members").select("role")
    .eq("workspace_id",v.workspaceId).eq("user_id",auth.data.user.id).maybeSingle();
  if(member.error||!member.data||!["admin","editor"].includes(member.data.role))
    throw Error("교육과정 편집 권한이 없습니다.");
  const result=await db.rpc("curriculum_excel_apply",{
    target:v.workspaceId,source_year:v.year,source_kind:v.kind,
    entries:v.courses as unknown as Json,
  });
  if(result.error)throw Error(result.error.message);
  const parsed=z.object({ok:z.boolean(),batchId:uuid,groups:z.number(),
    subjects:z.number(),hours:z.number(),cohorts:z.number().nullable()}).parse(result.data);
  revalidatePath("/app","layout");
  return {ok:true,data:{batchId:parsed.batchId,groups:parsed.groups,
    subjects:parsed.subjects,hours:parsed.hours,cohorts:parsed.cohorts??0}};
 }catch(error){
  const message=error instanceof z.ZodError?error.issues[0]?.message:
    error instanceof Error?error.message:"엑셀 등록 요청을 처리하지 못했습니다.";
  return {ok:false,error:message??"엑셀 등록 입력을 확인해 주세요."};
 }
}
