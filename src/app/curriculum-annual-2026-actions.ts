"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {uuid} from "@/lib/domain";
import {ANNUAL_2026_YEAR,ANNUAL_2026_ROWS} from "@/lib/annual-curriculum-2026";
import type {Result} from "@/lib/models";
import type {Json} from "@/lib/database.types";

const knownRows=new Set(ANNUAL_2026_ROWS.map(row=>row.id));
const identifiers=z.object({workspaceId:uuid,year:z.literal(ANNUAL_2026_YEAR)});
const editsSchema=z.record(z.string(),z.string().max(48))
  .superRefine((edits,ctx)=>{
    if(Object.keys(edits).length>1200){
      ctx.addIssue({code:"custom",message:"편집한 셀이 너무 많습니다."});return;
    }
    for(const key of Object.keys(edits)){
      const m=/^([A-Za-z][A-Za-z0-9]*):(\d{1,2})$/.exec(key);
      if(!m||!knownRows.has(m[1])||Number(m[2])<4||Number(m[2])>26){
        ctx.addIssue({code:"custom",message:"유효하지 않은 편성표 셀이 포함되어 있습니다."});return;
      }
    }
  });
async function member(workspaceId:string,canEdit=false){
  const db=await createClient();
  const auth=await db.auth.getUser();
  if(auth.error||!auth.data.user)throw Error("로그인이 필요합니다.");
  const m=await db.from("workspace_members").select("role").eq("workspace_id",workspaceId)
    .eq("user_id",auth.data.user.id).maybeSingle();
  if(m.error||!m.data||canEdit&&!["admin","editor"].includes(m.data.role))
    throw Error(canEdit?"이 편성표를 수정할 권한이 없습니다.":"교육과정 자료에 접근할 권한이 없습니다.");
  return db;
}
function errText(error:unknown){
  if(error instanceof z.ZodError)return error.issues[0]?.message??"입력값을 확인해 주세요.";
  if(error instanceof Error&&/[가-힣]/.test(error.message))return error.message;
  return "교육과정 편성표를 처리하지 못했습니다.";
}
export type Annual2026SheetSave={version:number;ok:boolean};
export type Annual2026SheetLoad={version:number;edits:Record<string,string>;updatedAt:string|null};
export async function loadAnnual2026Sheet(input:unknown):Promise<Result<Annual2026SheetLoad>>{
  try{
    const v=identifiers.parse(input);
    const db=await member(v.workspaceId);
    const {data,error}=await db.from("curriculum_annual_excel_sheets")
      .select("version,edits,updated_at").eq("workspace_id",v.workspaceId)
      .eq("academic_year",v.year).maybeSingle();
    if(error)throw error;
    return {ok:true,data:data?{
      version:data.version,edits:editsSchema.parse(data.edits),updatedAt:data.updated_at,
    }:{version:0,edits:{},updatedAt:null}};
  }catch(error){return {ok:false,error:errText(error)};}
}
export async function saveAnnual2026Sheet(input:unknown):Promise<Result<Annual2026SheetSave>>{
  try{
    const v=identifiers.extend({expectedVersion:z.number().int().min(0),edits:editsSchema}).parse(input);
    const db=await member(v.workspaceId,true);
    const {data,error}=await db.rpc("save_curriculum_annual_excel_sheet",{
      target:v.workspaceId,target_year:v.year,expected_version:v.expectedVersion,
      next_edits:v.edits as Json,
    });
    if(error)throw error;
    const result=z.object({version:z.number().int().min(0),ok:z.boolean()}).parse(data);
    if(result.ok)revalidatePath("/app","layout");
    return {ok:true,data:result};
  }catch(error){return {ok:false,error:errText(error)};}
}
