"use server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {getWorkspaceContext,session} from "@/lib/data";
import {annualSchema,defaultAnnual} from "@/lib/academic";
import {canPlan,type PlanningDomain} from "@/lib/planning-completion";
import {saveAnnual,saveCalendarChanges} from "@/app/actions";
import {saveTimetableDocument} from "@/app/timetable-actions";
import {newTimetableDocument,timetableDocumentSchema} from "@/lib/timetable-bridge";
import {bellRowSchema} from "@/lib/planning-resources";
import {calendarChangeSchema,type CalendarChange} from "@/lib/academic-calendar";
import {transferKinds,transferDate,mergeWorkSettings,transferWorkEvents,transferPeriods,type TransferKind,type TransferPreview,type TransferItem} from "@/lib/year-transfer";
import type {Result} from "@/lib/models";
const inputSchema=z.object({workspaceId:z.uuid(),source:z.number().int().min(2000).max(2100),target:z.number().int().min(2000).max(2100),kind:z.enum(transferKinds),stamp:z.string().optional()});
const domains:Record<TransferKind,PlanningDomain>={"work-settings":"plans","work-events":"plans",periods:"calendar",bell:"timetable",events:"calendar"};
type Input=z.infer<typeof inputSchema>;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function prepare(v:Input){
  if(v.source>=v.target)throw Error("대상보다 이전 학년도를 선택하세요.");
  const {db}=await session();
  const years=await db.from("academic_years").select("id,year").eq("workspace_id",v.workspaceId).in("year",[v.source,v.target]);
  if(years.error||years.data?.length!==2)throw Error("등록된 학년도만 선택할 수 있습니다.");
  const c=await getWorkspaceContext(v.workspaceId,String(v.target),"settings",true);
  if(c.role!=="admin"||!canPlan(c,domains[v.kind]))throw Error("학교 관리자와 해당 업무 편집 권한이 필요합니다.");
  const old=await getWorkspaceContext(v.workspaceId,String(v.source),"settings",true);
  if(!c.year||!old.year)throw Error("학년도를 확인하세요.");
  const source=old.annual?annualSchema.parse(old.annual.document):null;
  const target=c.annual?annualSchema.parse(c.annual.document):defaultAnnual(c.grades);
  const items:TransferItem[]=[];
  let note="기존 자료는 유지하며 가져온 자료는 저장본으로만 반영됩니다.";
  let apply:()=>Promise<void>=async()=>{};
  let fingerprint:unknown=[old.annual?.version,c.annual?.version,source,target];
  if(v.kind==="work-settings"||v.kind==="work-events"||v.kind==="periods"){
    if(source){
      // A new year's system defaults are not user-authored data. Existing saved rows are never replaced.
      const base=v.kind==="periods"&&!c.annual?{...target,timetable:[]}:target;
      const result=v.kind==="work-settings"?mergeWorkSettings(source,base):v.kind==="work-events"?transferWorkEvents(source,base,v.target-v.source,()=>crypto.randomUUID()):transferPeriods(source,base,c.grades);
      items.push(...result.items);
      apply=async()=>{const r=await saveAnnual({workspaceId:v.workspaceId,yearId:c.year!.id,version:c.annual?.version??0,document:result.result,workPlans:v.kind!=="periods"});if(!r.ok)throw Error(r.error);};
      if(v.kind==="work-events")note="일반 업무·협의사항만 같은 월·일로 추가합니다. 출장·운영 배정, 참석자 및 자료 링크는 이관하지 않습니다. 본문에 개인 정보가 없는지 확인하세요.";
      if(v.kind==="periods")note="이미 저장된 학년·요일별 운영 교시는 유지합니다. 저장본이 없는 새 학년도에만 기존 운영 교시를 한꺼번에 가져올 수 있습니다.";
    }
  }else if(v.kind==="bell"){
    const [a,b]=await Promise.all([db.rpc("read_timetable_document",{target:v.workspaceId,year_id:old.year.id}),db.rpc("read_timetable_document",{target:v.workspaceId,year_id:c.year.id})]);
    if(a.error||b.error)throw Error("시정표 자료를 조회하지 못했습니다.");
    const src=a.data as {version:number;document:unknown}|null,dst=b.data as {version:number;document:unknown}|null;
    const sd=timetableDocumentSchema.safeParse(src?.document),td=timetableDocumentSchema.safeParse(dst?.document);
    if(dst&&!td.success)throw Error("대상 시간표 형식을 확인하세요.");
    const bells=z.array(bellRowSchema).safeParse(sd.success?sd.data.timetableConfig?.bell:undefined);
    const exists=td.success&&Array.isArray(td.data.timetableConfig?.bell)&&td.data.timetableConfig.bell.length>0;
    fingerprint=[fingerprint,src,dst];
    if(bells.success&&bells.data.length){
      for(const row of bells.data)items.push({label:row.type==="lesson"?row.period+"교시":row.label||row.type,detail:row.start+"~"+row.end+(exists?" · 기존 시정표 유지":""),state:exists?"skip":"add"});
      const doc=td.success?td.data:newTimetableDocument(c);
      const config=doc.timetableConfig??{lessons:[],unavailable:[],periods:Object.fromEntries([1,2,3,4,5].map(d=>[String(d),Math.max(0,...bells.data.filter(r=>r.type==="lesson").map(r=>r.period??0))]))};
      apply=async()=>{const r=await saveTimetableDocument({workspaceId:v.workspaceId,yearId:c.year!.id,expectedVersion:dst?.version??0,document:{...doc,status:"draft",timetableConfig:{...config,bell:bells.data}}});if(!r.ok)throw Error(r.error);if(!r.data.ok)throw Error("대상 시간표가 변경되었습니다. 다시 미리보기 하세요.");};
    }
    note="기본 시정표가 없는 경우에만 추가합니다. 교원·학급별 시간표, 특별 시정표 및 적용 기간은 복사하지 않습니다.";
  }else{
    fingerprint=[fingerprint,old.events,c.events,old.classes,c.classes];
    const changes:CalendarChange[]=[];
    for(const e of old.events){
      const start=transferDate(e.start_date,v.target-v.source),end=transferDate(e.end_date,v.target-v.source);
      const mapped=(e.target_class_ids??[]).map(id=>{const cls=old.classes.find(x=>x.id===id);return cls?c.classes.find(x=>x.grade===cls.grade&&x.class_number===cls.class_number)?.id:undefined;});
      const reason=source?.allocations.some(a=>a.eventId===e.id)?"연결 운영 교시 있음 · 직접 편성 필요":mapped.some(x=>!x)||e.target_grades.some(g=>!c.grades.includes(g))?"대상 학급·학년 연결 확인":c.events.some(x=>x.title===e.title&&x.start_date===start&&x.end_date===end)||changes.some(x=>x.kind==="event"&&x.value?.title===e.title&&x.value.start_date===start&&x.value.end_date===end)?"이미 있음":"";
      items.push({label:e.title,detail:start+(end===start?"":"~"+end)+(reason?" · "+reason:""),state:reason?"skip":"add"});
      if(!reason)changes.push(calendarChangeSchema.parse({kind:"event",id:crypto.randomUUID(),version:0,value:{title:e.title,start_date:start,end_date:end,target_grades:e.target_grades,target_class_ids:mapped,department:e.department,description:e.description,event_type:e.event_type,activity_area:e.activity_area,resources:[]},beforeAllocations:[],allocations:[]}));
    }
    if(changes.length>366)throw Error("한 번에 366개 이하의 행사를 가져올 수 있습니다.");
    apply=async()=>{const r=await saveCalendarChanges({workspaceId:v.workspaceId,yearId:c.year!.id,changes,operation:"이전 학년도 이관"});if(!r.ok)throw Error(r.error);if(!r.data.ok)throw Error("행사 자료가 변경되었습니다. 다시 확인하세요.");};
    note="교시 배정이 없는 행사만 가져옵니다. 대상 학급은 학년·반 번호로 연결하며, 운영 교시가 연결된 행사나 연결할 수 없는 학급은 제외합니다. 내부 링크는 복사하지 않습니다.";
  }
  const preview:TransferPreview={kind:v.kind,source:v.source,target:v.target,items,stamp:digest([v.workspaceId,v.source,v.target,v.kind,fingerprint,items]),note};
  return {preview,apply};
}
export async function previewYearTransfer(input:unknown):Promise<Result<TransferPreview>>{
  try{return {ok:true,data:(await prepare(inputSchema.parse(input))).preview};}catch(e){return {ok:false,error:e instanceof Error&&/[가-힣]/.test(e.message)?e.message:"이관 자료를 확인하지 못했습니다."};}
}
export async function applyYearTransfer(input:unknown):Promise<Result<number>>{
  try{const v=inputSchema.parse(input),p=await prepare(v);if(!v.stamp||v.stamp!==p.preview.stamp)throw Error("원본 또는 대상 자료가 변경되었습니다. 다시 미리보기 하세요.");const count=p.preview.items.filter(i=>i.state==="add").length;if(!count)throw Error("추가할 자료가 없습니다.");await p.apply();return {ok:true,data:count};}catch(e){return {ok:false,error:e instanceof Error&&/[가-힣]/.test(e.message)?e.message:"자료 이관을 완료하지 못했습니다."};}
}
