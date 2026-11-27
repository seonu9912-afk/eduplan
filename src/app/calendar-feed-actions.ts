"use server";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const inputSchema=z.object({workspaceId:z.uuid(),yearId:z.uuid(),op:z.enum(["status","issue","revoke","enable","disable"]),calendar:z.boolean().default(true),plans:z.boolean().default(false)});
const resultSchema=z.object({enabled:z.boolean(),active:z.boolean(),admin:z.boolean()});
export async function manageCalendarFeed(input:unknown) {
  const parsed=inputSchema.safeParse(input);
  if(!parsed.success)return {ok:false as const,error:"요청 정보를 확인하세요."};
  const v=parsed.data,db=await createClient();
  const token=v.op==="issue"?randomBytes(32).toString("hex"):null;
  const response=await db.rpc("calendar_feed_manage",{target:v.workspaceId,year_id:v.yearId,op:v.op,hash_value:token?createHash("sha256").update(token).digest("hex"):"",calendar:v.calendar,plans:v.plans});
  const data=resultSchema.safeParse(response.data);
  if(response.error||!data.success)return {ok:false as const,error:"외부 캘린더 설정을 불러오거나 변경하지 못했습니다. 권한 및 서버 설정을 확인하세요."};
  return {ok:true as const,data:data.data,token};
}
