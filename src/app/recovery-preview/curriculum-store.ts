import type { CurriculumDesignActions } from "../../components/features/curriculum-enhanced";
import type { CurriculumCatalogActions } from "../../components/features/curriculum-simple-v5";
import type { SchoolType } from "../../lib/domain";
import type { Context } from "../../lib/models";
import { middleCurriculumCatalog } from "../../lib/middle-curriculum";
import { initializeCohortSelection, validateDocument, type CurriculumDocument } from "../../lib/curriculum-design";
import { curriculumPreviewContext, type PreviewSaved } from "./curriculum-fixture";

type Catalog = Pick<Context,"groups"|"subjects"|"plans"> & { version:number };
type BrowserStorage = Pick<Storage,"getItem"|"setItem">;

/** The same three-step UI, backed entirely by synthetic browser data. */
export function createCurriculumPreviewStore(school:SchoolType,storage:BrowserStorage){
  const base=curriculumPreviewContext(school);
  base.hours=[];
  const key="eduplan-curriculum-catalog-v1:"+school;
  let catalog:Catalog={groups:[],subjects:[],plans:[],version:0};
  let snapshot=base;
  let lastRaw:string|null|undefined;
  const listeners=new Set<()=>void>();
  function refresh(){
    const raw=storage.getItem(key);
    if(raw===lastRaw)return;
    catalog=raw?JSON.parse(raw):{groups:[],subjects:[],plans:[],version:0};
    lastRaw=raw;
    snapshot={...base,groups:[...base.groups,...catalog.groups],
      subjects:[...base.subjects,...catalog.subjects],plans:[...base.plans,...catalog.plans]};
    listeners.forEach(listener=>listener());
  }
  function write(next:Catalog){
    storage.setItem(key,JSON.stringify({...next,version:catalog.version+1}));
    refresh();
  }
  const scope={workspace_id:base.workspace.id,school_id:null};
  function addGroupRow(name:string){
    const existing=snapshot.groups.find(group=>group.name===name);
    if(existing)return existing;
    const group={...scope,id:crypto.randomUUID(),name};
    write({...catalog,groups:[...catalog.groups,group]});return group;
  }
  function addSubjectRow(groupId:string,name:string){
    if(snapshot.subjects.some(subject=>subject.group_id===groupId&&subject.name===name))return false;
    write({...catalog,subjects:[...catalog.subjects,{...scope,id:crypto.randomUUID(),group_id:groupId,name}]});
    return true;
  }
  function read(planId:string){
    refresh();
    const plan=snapshot.plans.find(plan=>plan.id===planId);
    if(!plan)throw Error("실습 편성표를 찾지 못했습니다.");
    const documentKey="eduplan-curriculum-rehearsal-v1:"+school+(plan.cohort_year===2027?"":":"+plan.cohort_year);
    const raw=storage.getItem(documentKey);
    const context={...snapshot,plans:[plan]};
    const previous:PreviewSaved|null=raw?JSON.parse(raw):null;
    const saved={document:initializeCohortSelection(context,plan,previous?.document),
      planVersion:previous?.planVersion??1,documentVersion:previous?.documentVersion??0};
    return {documentKey,context,saved};
  }
  const actions:CurriculumDesignActions={
    load:async input=>({ok:true,data:{...read((input as {planId:string}).planId).saved,lock:null,snapshots:[]}}),
    claim:async()=>({ok:true,data:{acquired:true}}),
    save:async input=>{
      const v=input as {planId:string;document:CurriculumDocument;expectedPlanVersion:number;expectedDocVersion:number};
      await new Promise(resolve=>setTimeout(resolve,250));
      const {saved:old,context,documentKey}=read(v.planId);
      if(v.expectedPlanVersion!==old.planVersion||v.expectedDocVersion!==old.documentVersion)
        return {ok:false,error:"다른 창에서 실습 편성표가 변경되었습니다. 최신 저장본을 확인해 주세요."};
      const errors=validateDocument(context,v.document);
      if(errors.length)return {ok:false,error:errors[0]};
      const saved={document:v.document,planVersion:old.planVersion+1,documentVersion:old.documentVersion+1};
      storage.setItem(documentKey,JSON.stringify(saved));
      return {ok:true,data:{ok:true,planVersion:saved.planVersion,documentVersion:saved.documentVersion}};
    },
    confirm:async()=>({ok:false,error:"실습에서는 학교 확정본을 만들지 않습니다. 표와 Excel 출력까지 확인할 수 있습니다."}),
  };
  const catalogActions:CurriculumCatalogActions={
    addGroup:async(_workspace,name)=>{
      refresh();if(!name.trim()||name.trim().length>60)return {ok:false,error:"교과군 이름은 1~60자로 입력하세요."};
      addGroupRow(name.trim());return {ok:true,data:undefined};
    },
    addSubject:async input=>{
      refresh();const v=input as {group_id:string;name:string};
      if(!snapshot.groups.some(group=>group.id===v.group_id)||!v.name.trim()||v.name.trim().length>60)
        return {ok:false,error:"교과군과 과목명을 확인하세요."};
      addSubjectRow(v.group_id,v.name.trim());return {ok:true,data:undefined};
    },
    createPlan:async(_workspace,cohortYear)=>{
      refresh();if(!Number.isInteger(cohortYear)||cohortYear<2000||cohortYear>2100)return {ok:false,error:"입학년도를 확인하세요."};
      const existing=snapshot.plans.find(plan=>plan.cohort_year===cohortYear);
      if(existing)return {ok:true,data:existing.id};
      const plan={...base.plans[0],id:crypto.randomUUID(),cohort_year:cohortYear};
      write({...catalog,plans:[...catalog.plans,plan]});return {ok:true,data:plan.id};
    },
    importDefaults:async input=>{
      refresh();const v=input as {revision:"2015"|"2022"};
      const source=middleCurriculumCatalog(v.revision);
      let addedGroups=0,addedSubjects=0;
      for(const item of [...source.groups,source.creative]){
        if(!snapshot.groups.some(group=>group.name===item.name))addedGroups++;
        const group=addGroupRow(item.name);
        for(const name of item.subjects)if(addSubjectRow(group.id,name))addedSubjects++;
      }
      return {ok:true,data:{addedGroups,addedSubjects}};
    },
  };
  return {actions,catalogActions,getSnapshot:()=>lastRaw===undefined?null:snapshot,getServerSnapshot:()=>null,
    subscribe:(listener:()=>void)=>{listeners.add(listener);refresh();return()=>{listeners.delete(listener);};},refresh};
}
