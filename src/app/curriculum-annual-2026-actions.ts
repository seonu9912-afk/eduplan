"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {uuid} from "@/lib/domain";
import {ANNUAL_2026_YEAR,ANNUAL_2026_ROWS,
  type Annual2026CustomRow} from "@/lib/annual-curriculum-2026";
import type {Result} from "@/lib/models";
import type {Json} from "@/lib/database.types";

const knownRows=new Set(ANNUAL_2026_ROWS.map(row=>row.id));
const identifiers=z.object({workspaceId:uuid,year:z.literal(ANNUAL_2026_YEAR)});
const editsSchema=z.record(z.string(),z.string().max(48))
  .refine(record=>Object.keys(record).length<=3500,{message:"수정한 셀이 너무 많습니다."});
const rowsSchema=z.array(z.object({
  id:z.string().regex(/^extra[a-f0-9]{32}$/),
  afterId:z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
  section:z.enum(["subject","creative","free"]),
  group:z.string().trim().min(1).max(60),
  subject:z.string().trim().min(1,"추가한 과목의 이름을 입력해 주세요.").max(60),
})).max(100).superRefine((rows,ctx)=>{
  const allowed=new Map(ANNUAL_2026_ROWS.map(row=>[row.id,row]));
  const ids=new Set<string>();
  for(const row of rows){
    if(allowed.has(row.id)||ids.has(row.id)){
      ctx.addIssue({code:"custom",message:"추가 과목의 ID가 중복되어 있습니다."});return;
    }
    const parent=allowed.get(row.afterId);
    if(!parent||parent.kind!=="subject"||parent.section!==row.section||parent.group!==row.group){
      ctx.addIssue({code:"custom",message:"추가 과목의 교과군이 올바르지 않습니다."});return;
    }
    allowed.set(row.id,{...parent,id:row.id,subject:row.subject,cells:{}});
    ids.add(row.id);
  }
});
function ensureEdits(edits:Record<string,string>,rows:readonly Annual2026CustomRow[]){
  const allowed=new Set([...knownRows,...rows.map(row=>row.id)]);
  for(const key of Object.keys(edits)){
    const match=/^([A-Za-z][A-Za-z0-9]*):(\d{1,2})$/.exec(key);
    if(!match||!allowed.has(match[1])||Number(match[2])<4||Number(match[2])>26)
      throw Error("등록되지 않은 과목이나 셀에 입력값이 있습니다.");
  }
}
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
export type Annual2026SheetLoad={version:number;edits:Record<string,string>;
  customRows:Annual2026CustomRow[];updatedAt:string|null};
export async function loadAnnual2026Sheet(input:unknown):Promise<Result<Annual2026SheetLoad>>{
  try{
    const v=identifiers.parse(input);
    const db=await member(v.workspaceId);
    const {data,error}=await db.from("curriculum_annual_excel_sheets")
      .select("version,edits,custom_rows,updated_at").eq("workspace_id",v.workspaceId)
      .eq("academic_year",v.year).maybeSingle();
    if(error)throw error;
    const customRows=rowsSchema.parse(data?.custom_rows??[]);
    const edits=editsSchema.parse(data?.edits??{});
    ensureEdits(edits,customRows);
    return {ok:true,data:{
      version:data?.version??0,edits,customRows,updatedAt:data?.updated_at??null,
    }};
  }catch(error){return {ok:false,error:errText(error)};}
}
export async function saveAnnual2026Sheet(input:unknown):Promise<Result<Annual2026SheetSave>>{
  try{
    const v=identifiers.extend({expectedVersion:z.number().int().min(0),
      edits:editsSchema,customRows:rowsSchema}).parse(input);
    ensureEdits(v.edits,v.customRows);
    const db=await member(v.workspaceId,true);
    const {data,error}=await db.rpc("save_curriculum_annual_excel_sheet_v2",{
      target:v.workspaceId,target_year:v.year,expected_version:v.expectedVersion,
      next_edits:v.edits as Json,next_custom_rows:v.customRows as Json,
    });
    if(error)throw error;
    const result=z.object({version:z.number().int().min(0),ok:z.boolean()}).parse(data);
    if(result.ok)revalidatePath("/app","layout");
    return {ok:true,data:result};
  }catch(error){return {ok:false,error:errText(error)};}
}
