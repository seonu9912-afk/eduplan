"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import type {Result} from "@/lib/models";

const uuid=z.uuid();
async function check(workspaceId:string){
  const db=await createClient();
  const user=await db.auth.getUser();
  if(user.error||!user.data.user)throw Error("로그인이 필요합니다.");
  const membership=await db.from("workspace_members").select("role")
    .eq("workspace_id",workspaceId).eq("user_id",user.data.user.id).maybeSingle();
  if(membership.error||!membership.data||!["admin","editor"].includes(membership.data.role))
    throw Error("교육과정 수정 권한이 없습니다.");
  return db;
}
function err(e:unknown){return e instanceof Error?e.message:"교과목을 수정하지 못했습니다.";}
export async function renameCurriculumSubjectV4(input:unknown):Promise<Result>{
  try{
    const v=z.object({workspaceId:uuid,subjectId:uuid,name:z.string().trim().min(1).max(60)}).parse(input);
    const db=await check(v.workspaceId);
    const {data,error}=await db.from("subjects").update({name:v.name})
      .eq("id",v.subjectId).eq("workspace_id",v.workspaceId).select("id").maybeSingle();
    if(error)throw error;
    if(!data)throw Error("수정할 교과목이 없거나 편집 권한이 없습니다.");
    revalidatePath("/app","layout");
    return {ok:true,data:undefined};
  }catch(e){return {ok:false,error:err(e)};}
}
export async function renameCurriculumGroupV4(input:unknown):Promise<Result>{
  try{
    const v=z.object({workspaceId:uuid,groupId:uuid,name:z.string().trim().min(1).max(60)}).parse(input);
    const db=await check(v.workspaceId);
    const {data,error}=await db.from("subject_groups").update({name:v.name})
      .eq("id",v.groupId).eq("workspace_id",v.workspaceId).select("id").maybeSingle();
    if(error)throw error;
    if(!data)throw Error("수정할 교과군이 없습니다.");
    revalidatePath("/app","layout");
    return {ok:true,data:undefined};
  }catch(e){return {ok:false,error:err(e)};}
}
export async function reorderCurriculumSubjectsV4(input:unknown):Promise<Result<number>>{
  try{
    const v=z.object({workspaceId:uuid,groupId:uuid,
      ordered:z.array(uuid).min(1).max(250)}).parse(input);
    const db=await check(v.workspaceId);
    const response=await db.rpc("reorder_curriculum_subjects_v4",{
      p_workspace:v.workspaceId,p_group:v.groupId,p_order:v.ordered,
    });
    if(response.error)throw response.error;
    revalidatePath("/app","layout");
    return {ok:true,data:response.data};
  }catch(e){return {ok:false,error:err(e)};}
}
