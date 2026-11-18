"use server";

import {z} from "zod";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import type {Result} from "@/lib/models";

const inputSchema=z.object({
  workspaceId:z.uuid(),
  groupId:z.uuid(),
  names:z.array(z.string().trim().min(1).max(60)).min(1).max(60),
});

/** Adds multiple subjects to one existing group without changing any curriculum document.
 * Supabase RLS and explicit membership/group checks ensure workspace isolation.
 */
export async function addCurriculumSubjectsInBulk(input:unknown):Promise<Result<{count:number}>>{
  try{
    const data=inputSchema.parse(input);
    const db=await createClient();
    const identity=await db.auth.getUser();
    if(identity.error||!identity.data.user)throw Error("로그인 후 과목을 추가해 주세요.");
    const member=await db.from("workspace_members").select("role")
      .eq("workspace_id",data.workspaceId)
      .eq("user_id",identity.data.user.id).maybeSingle();
    if(member.error||!member.data||!["admin","editor"].includes(member.data.role))
      throw Error("이 학교의 과목을 수정할 권한이 없습니다.");
    const {data:group,error:groupError}=await db.from("subject_groups")
      .select("id").eq("workspace_id",data.workspaceId)
      .eq("id",data.groupId).maybeSingle();
    if(groupError||!group)throw Error("교과군을 찾을 수 없습니다.");
    const names=data.names.map(name=>name.trim());
    if(new Set(names).size!==names.length)
      throw Error("한 번에 입력한 목록에 중복 과목이 있습니다.");
    const current=await db.from("subjects").select("name")
      .eq("workspace_id",data.workspaceId).eq("group_id",data.groupId);
    if(current.error)throw Error("기존 과목 목록을 확인할 수 없습니다.");
    const duplicates=names.filter(name=>current.data.some(row=>row.name===name));
    if(duplicates.length)throw Error("이미 등록된 과목: "+duplicates.join(", "));
    const result=await db.from("subjects").insert(names.map(name=>({
      workspace_id:data.workspaceId,group_id:data.groupId,name,
    }))).select("id");
    if(result.error)throw result.error;
    if(result.data.length!==names.length)throw Error("추가한 과목 수를 확인해 주세요.");
    revalidatePath("/app","layout");
    return {ok:true,data:{count:result.data.length}};
  }catch(error){
    const msg=error instanceof z.ZodError?error.issues[0]?.message:
      error instanceof Error?error.message:"과목 등록 요청을 처리하지 못했습니다.";
    return {ok:false,error:msg??"과목명을 확인해 주세요."};
  }
}


/** Idempotently prepares missing national subject-group shells, without creating
 * duplicate subjects or replacing existing locally configured groups.
 */
export async function addCurriculumGroupsInBulk(input:unknown):Promise<Result<{count:number}>>{
  try{
    const data=z.object({workspaceId:z.uuid(),
      names:z.array(z.string().trim().min(1).max(60)).min(1).max(20)}).parse(input);
    const db=await createClient();
    const identity=await db.auth.getUser();
    if(identity.error||!identity.data.user)throw Error("로그인이 필요합니다.");
    const member=await db.from("workspace_members").select("role")
      .eq("workspace_id",data.workspaceId).eq("user_id",identity.data.user.id).maybeSingle();
    if(member.error||!member.data||!["admin","editor"].includes(member.data.role))
      throw Error("교육과정 편집 권한이 없습니다.");
    const current=await db.from("subject_groups").select("name")
      .eq("workspace_id",data.workspaceId);
    if(current.error)throw Error("교과군 목록을 확인할 수 없습니다.");
    const known=new Set(current.data.map(group=>group.name));
    const names=[...new Set(data.names)].filter(name=>!known.has(name));
    if(names.length){
      const result=await db.from("subject_groups").insert(
        names.map(name=>({workspace_id:data.workspaceId,name})));
      if(result.error)throw result.error;
    }
    revalidatePath("/app","layout");
    return {ok:true,data:{count:names.length}};
  }catch(error){
    const msg=error instanceof z.ZodError?error.issues[0]?.message:
      error instanceof Error?error.message:"교과군을 준비하지 못했습니다.";
    return {ok:false,error:msg??"교과군 정보를 확인해 주세요."};
  }
}
