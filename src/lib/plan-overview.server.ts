import "server-only";
import {createClient} from "./supabase/server";
import {getWorkspaceContext} from "./data";
import {readAllRows} from "./pagination";
import {annualSchema} from "./academic";
import {previewPlanPublication} from "./plan-publication-preview";
import {cohortFor} from "./domain";
import {teachingDocumentSchema} from "./teaching";
import type {Context} from "./models";
import type {CompletionData,PlanningDomain} from "./planning-completion";
import type {CurriculumPublication,TeachingPublication} from "./school-publications";
import {versionState,aggregatePlanUnits,latestTimestamp,type PlanOverviewRow,type PlanSection,type PlanUnit} from "./plan-overview";

export async function loadPlanOverview(c:Context):Promise<PlanOverviewRow[]|undefined>{
  if(c.role!=="admin"||!c.year)return undefined;
  const db=await createClient(),w=c.workspace.id,y=c.year.id,year=c.year.year;
  const [draftContext,permissions,curriculumDocs,curriculumPublications,timetableDraft,timetablePub,teachingDraft,teachingPub]=await Promise.all([
    getWorkspaceContext(w,String(year),"settings",true).catch(()=>null),
    db.rpc("planning_completion_data",{target:w,year_id:y}),
    readAllRows((from,to)=>db.from("curriculum_design_documents").select("plan_id,version,updated_at").eq("workspace_id",w).order("plan_id").range(from,to)),
    db.rpc("school_curriculum_publications",{target:w}),
    db.rpc("read_timetable_document",{target:w,year_id:y}),
    db.from("timetable_publications").select("source_version,published_at").eq("workspace_id",w).eq("academic_year_id",y).order("published_at",{ascending:false}).limit(1),
    readAllRows((from,to)=>db.from("teaching_courses").select("id,version,updated_at,semester,teaching_plans(document)").eq("workspace_id",w).eq("academic_year_id",y).eq("visibility","workspace").eq("archived",false).order("id").range(from,to)),
    db.rpc("school_teaching_publications",{target:w,year_id:y}),
  ]);
  const grants=permissions.error?undefined:(permissions.data as unknown as CompletionData|null)?.permissions;
  const owners=(domain:PlanningDomain)=>grants?c.members.filter(m=>grants.some(p=>p.user_id===m.user_id&&p.domain===domain&&p.can_edit)).map(m=>m.display_name):[];
  const make=(section:PlanSection,domain:PlanningDomain,unit:Omit<PlanOverviewRow,"section"|"owners">):PlanOverviewRow=>({section,owners:owners(domain),...unit});
  const unknown=(section:PlanSection,domain:PlanningDomain)=>make(section,domain,{state:"unknown",detail:"자료 조회 또는 비교 불가"});
  const rows:PlanOverviewRow[]=[];
  for(const domain of ["calendar","plans"] as const){
    if(!draftContext){rows.push(unknown(domain,domain));continue;}
    const releases=(draftContext.schoolPublications??[]).filter(p=>p.domain===domain).sort((a,b)=>b.source_version-a.source_version||b.published_at.localeCompare(a.published_at));
    const latest=releases[0],draft=draftContext.annual,parsed=annualSchema.safeParse(draft?.document);
    if(!draft){rows.push(make(domain,domain,{state:latest?"unknown":"empty",detail:latest?"작성본 확인 필요":"저장본 없음",publishedAt:latest?.published_at}));continue;}
    if(!parsed.success){rows.push(unknown(domain,domain));continue;}
    if(!latest){rows.push(make(domain,domain,{state:"draft",detail:"저장본 있음 · 공개 이력 없음",updatedAt:draft.updated_at}));continue;}
    const compare=previewPlanPublication({...draftContext,schoolPublications:[latest]},parsed.data,domain,draft.version,latest.starts_on);
    const state=compare.kind!=="comparison"?"unknown":compare.rows.length?"changed":"published";
    rows.push(make(domain,domain,{state,detail:compare.kind!=="comparison"?"공개본 비교 불가":compare.rows.length?`공개본과 다른 항목 ${compare.rows.length}건`:"최근 공개본과 변경 항목 없음",updatedAt:draft.updated_at,publishedAt:latest.published_at,effectiveDate:latest.starts_on}));
  }
  if(!draftContext||curriculumDocs.error||curriculumPublications.error||!Array.isArray(curriculumPublications.data))rows.push(unknown("curriculum","curriculum"));
  else{
    const publications=curriculumPublications.data as unknown as CurriculumPublication[];
    const units:PlanUnit[]=c.grades.map(grade=>{
      const cohort=cohortFor(year,grade),p=draftContext.plans.find(p=>p.cohort_year===cohort);
      const doc=curriculumDocs.data?.find(d=>d.plan_id===p?.id),pub=publications.filter(p=>p.cohort_year===cohort).sort((a,b)=>b.version-a.version)[0];
      return {state:versionState(doc?.version,pub?.version),updatedAt:doc?.updated_at,publishedAt:pub?.confirmed_at};
    });
    rows.push(make("curriculum","curriculum",{state:aggregatePlanUnits(units),detail:`${units.filter(u=>u.state==="published").length}/${units.length}개 입학년도 최신 공개`,updatedAt:latestTimestamp(units.map(u=>u.updatedAt)),publishedAt:latestTimestamp(units.map(u=>u.publishedAt))}));
  }
  if(timetableDraft.error||timetablePub.error)rows.push(unknown("timetable","timetable"));
  else{
    const d=timetableDraft.data as {version?:number;updated_at?:string}|null,p=timetablePub.data?.[0];
    rows.push(make("timetable","timetable",{state:versionState(d?.version,p?.source_version),detail:d?.version!==undefined?`저장 v${d.version} · 공개 ${p?"v"+p.source_version:"없음"}`:"저장본 없음",updatedAt:d?.updated_at,publishedAt:p?.published_at}));
  }
  if(teachingDraft.error||teachingPub.error||!Array.isArray(teachingPub.data))rows.push(unknown("teaching","assessment"));
  else{
    const pubs=teachingPub.data as unknown as TeachingPublication[];
    const units:PlanUnit[]=(teachingDraft.data??[]).map(course=>{
      const pub=pubs.find(p=>p.course_id===course.id);
      const d=teachingDocumentSchema.safeParse(course.teaching_plans[0]?.document);
      let state=versionState(course.version,pub?.version);
      if(!d.success)state="unknown";
      else if(state==="published"&&(d.data.lesson_status!=="확정"||!d.data.evaluations.every(e=>e.status==="확정")))state="partial";
      return {state,updatedAt:course.updated_at,publishedAt:pub?.published_at};
    });
    rows.push(make("teaching","assessment",{state:aggregatePlanUnits(units),detail:units.length?`등록된 학교 공유 과정 ${units.length}개 중 ${units.filter(u=>u.state==="published").length}개 최신 공개`:"등록된 학교 공유 과정 없음",updatedAt:latestTimestamp(units.map(u=>u.updatedAt)),publishedAt:latestTimestamp(units.map(u=>u.publishedAt))}));
  }
  const order:PlanSection[]=["curriculum","calendar","plans","timetable","teaching"];
  return rows.sort((a,b)=>order.indexOf(a.section)-order.indexOf(b.section));
}
