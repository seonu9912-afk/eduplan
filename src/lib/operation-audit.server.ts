import "server-only";
import {getWorkspaceContext} from "./data";
import {getOperationsData} from "./operations-data";
import {buildOperationAudit,type AuditCheck} from "./operation-audit";
import type {Context} from "./models";
export async function loadOperationAudit(c:Context):Promise<AuditCheck[]|undefined>{
 if(c.role!=="admin"||!c.year)return undefined;
 try{
 const draft=await getWorkspaceContext(c.workspace.id,String(c.year.year),"settings",true);
 if(draft.role!=="admin")return undefined;
 draft.operations=await getOperationsData(draft,"full",true);
 return buildOperationAudit(draft);
 }catch{return [{id:"unavailable",scope:"draft",area:"calendar",label:"학교 운영 자료 점검",state:"unknown",details:["저장본 또는 공개본을 조회하지 못했습니다. 다시 불러와 주세요."],count:1}];}
}
