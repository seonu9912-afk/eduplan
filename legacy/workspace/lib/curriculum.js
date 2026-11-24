// EduPlan curriculum engine v0.8 — pure functions, no browser or UI dependencies.
// A cohort is identified by admission year. An operational year is assembled from
// grade 1 of that year's cohort, grade 2 of last year's, and grade 3 of two years ago.
export const CURRICULUM_VERSION = 1;
export const TERM_KEYS = ['1-1','1-2','2-1','2-2','3-1','3-2'];
export const TERM_LABELS = Object.fromEntries(TERM_KEYS.map((x)=>[x,`${x[0]}학년 ${x[2]}학기`]));
export const COURSE_AREAS = [
  {id:'subject',label:'교과',tone:'blue'},
  {id:'creative_self',label:'창체 · 자율·자치',tone:'teal'},
  {id:'creative_club',label:'창체 · 동아리',tone:'teal'},
  {id:'creative_career',label:'창체 · 진로',tone:'teal'},
  {id:'creative_volunteer',label:'봉사활동 (기존 교육과정)',tone:'slate'},
  {id:'free_topic',label:'자유학기 · 주제선택',tone:'purple'},
  {id:'free_career',label:'자유학기 · 진로탐색',tone:'purple'},
  {id:'free_other',label:'자유학기 · 기타',tone:'purple'},
];
export const COURSE_AREA_LABELS = Object.fromEntries(COURSE_AREAS.map(a=>[a.id,a.label]));
export const CURRICULUM_GROUPS = ['국어','사회/역사/도덕','수학','과학/기술·가정/정보','체육','예술(음악·미술)','영어','선택','기타'];
const DEFAULT_COURSES = [
  ['국어','국어'],['사회','사회/역사/도덕'],['역사','사회/역사/도덕'],['도덕','사회/역사/도덕'],
  ['수학','수학'],['과학','과학/기술·가정/정보'],['기술·가정','과학/기술·가정/정보'],['정보','과학/기술·가정/정보'],
  ['체육','체육'],['음악','예술(음악·미술)'],['미술','예술(음악·미술)'],['영어','영어'],
];
const hash = text=>{
  let h=2166136261;
  for(const c of text){h=Math.imul(h^c.codePointAt(0),16777619)>>>0;}
  return h.toString(36);
};
export const courseId = (name,area='subject',group='')=>`course-${hash(`${area}\u0000${group.replace(/\s+/g,'')}\u0000${String(name).trim()}`)}`;
export function blankCurriculum(){return {version:CURRICULUM_VERSION,courses:DEFAULT_COURSES.map(([name,group])=>({id:courseId(name,'subject',group),name,group,area:'subject'})),cohorts:{},standards:{},staffing:{}};}
export const normalizeCurriculum = value=>{
  const fresh=blankCurriculum();
  if(!value||typeof value!=='object'||Array.isArray(value))return fresh;
  return {...fresh,...value,courses:Array.isArray(value.courses)?value.courses:fresh.courses,cohorts:value.cohorts&&typeof value.cohorts==='object'&&!Array.isArray(value.cohorts)?value.cohorts:{},standards:value.standards||{},staffing:value.staffing||{}};
};
export const makeCohort = (year)=>({year:Number(year),source:'새 편성안',terms:{},baseTerms:{},completeGrades:[],targets:{},weeks:16,notes:'',updatedAt:null});
export const hoursNumber = value=>Number.isFinite(Number(value))?Math.max(0,Math.round(Number(value))):0;
export const termHours = (cohort,key,id)=>hoursNumber(cohort?.terms?.[key]?.[id]);
export const sumTerm = (cohort,key,courses)=>{
  const byArea={},byGroup={};let total=0;
  for(const course of courses){const hours=termHours(cohort,key,course.id);total+=hours;byArea[course.area]=(byArea[course.area]||0)+hours;if(course.area==='subject')byGroup[course.group]=(byGroup[course.group]||0)+hours;}
  return {total,byArea,byGroup};
};
export const sumCohort = (cohort,courses)=>{
  const terms=Object.fromEntries(TERM_KEYS.map(key=>[key,sumTerm(cohort,key,courses)]));
  const total=TERM_KEYS.reduce((s,key)=>s+terms[key].total,0);
  const byArea={},byGroup={};
  for(const key of TERM_KEYS){for(const [a,v] of Object.entries(terms[key].byArea))byArea[a]=(byArea[a]||0)+v;for(const [g,v] of Object.entries(terms[key].byGroup))byGroup[g]=(byGroup[g]||0)+v;}
  return {terms,total,byArea,byGroup};
};
export function operationalPlan(state,year){
  const data=normalizeCurriculum(state),gradeNumbers=Array.isArray(data.grades)&&data.grades.length?data.grades:[1,2,3],grades=gradeNumbers.map(grade=>{
    const cohortYear=Number(year)-grade+1,cohort=data.cohorts[String(cohortYear)],termA=`${grade}-1`,termB=`${grade}-2`;
    const ready=!!cohort?.completeGrades?.includes(grade);
    return {grade,cohortYear,cohort,ready,semesters:[1,2].map(term=>({term,key:`${grade}-${term}`,target:cohort?.targets?.[`${grade}-${term}`]??null,totals:sumTerm(cohort,`${grade}-${term}`,data.courses)}))};
  });
  return {year:Number(year),grades,complete:grades.every(g=>g.ready),total:grades.reduce((s,g)=>s+g.semesters.reduce((v,t)=>v+t.totals.total,0),0)};
}
export function staffingAnalysis(state,year,classCounts={1:1,2:1,3:1}){
  const data=normalizeCurriculum(state),view=operationalPlan(data,year);
  const groups=[...new Set(data.courses.filter(x=>x.area==='subject').map(x=>x.group))];
  return groups.map(group=>{
    const terms=[1,2].map(term=>{
      const detail=view.grades.map(g=>{
        const h=g.semesters[term-1].totals.byGroup[group]||0;
        return {grade:g.grade,hours:h,classes:Math.max(0,Number(classCounts[g.grade])||0),weeks:Math.max(1,Number(g.cohort?.weeks)||16),ready:g.ready};
      });
      return {term,weekly:detail.reduce((s,d)=>s+d.hours/d.weeks*d.classes,0),detail,complete:detail.every(d=>d.ready)};
    });
    const staff=data.staffing?.[String(year)]?.[group];
    const teachers=Math.max(0,Number(staff?.teachers)||0),maxWeekly=Math.max(0,Number(staff?.maxWeekly)||0);
    return {group,terms,requiredWeekly:Math.max(...terms.map(t=>t.weekly)),complete:terms.every(t=>t.complete),teachers,maxWeekly,capacity:teachers*maxWeekly,gap:teachers&&maxWeekly?Math.max(...terms.map(t=>t.weekly))-teachers*maxWeekly:null};
  });
}
const text=v=>String(v??'').replace(/\s+/g,' ').trim();
const number=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v):Number.isFinite(Number(v))&&text(v)!==''?Math.round(Number(v)):0;
const filled=(v)=>v!==null&&v!==undefined&&text(v)!=='';
function normalizeGroup(value){
  return text(value).replace(/\s*\/\s*/g,'/').replace('예술 (','예술(').replace('예술\n','예술');
}
function rowCourse(row,section,group){
  const name=text(row[2])||text(row[1]);
  if(!name||/시수\s*합계|3개년\s*시수\s*총계|학기당\s*(수업\s*시수|과목\s*수)/.test(name)||name.includes('20%'))return null;
  if(/학교자율시간 교과/.test(name))return null; // subset, not an extra course
  if(section==='free'){
    return {name,area:name.includes('주제선택')?'free_topic':name.includes('진로탐색')?'free_career':'free_other',group:'자유학기 활동'};
  }
  if(section==='creative'){
    let area='creative_club';
    if(/자율|자치/.test(name))area='creative_self';
    else if(/진로/.test(name))area='creative_career';
    else if(/봉사/.test(name))area='creative_volunteer';
    return {name,area,group:'창의적 체험활동'};
  }
  return {name,area:'subject',group:group||'기타'};
}
/**
 * Parse the two shared-style school workbooks locally in the browser. The uploader
 * chooses the operating/admission year; no file bytes are sent to a server.
 * Only supported first-sheet layout is accepted. Unrecognized layouts throw.
 */
export function parseCurriculumSheet(rows,kind,year){
  if(!Array.isArray(rows)||rows.length<25||!Array.isArray(rows[0]))throw Error('교육과정 편성표의 행을 읽을 수 없습니다.');
  const title=text(rows[0][0]);
  if(!title.includes('교육과정')||!rows.some(r=>text(r?.[0]).includes('3개년 시수 총계')))throw Error('지원하는 3개년 교육과정 편성표인지 확인해 주세요.');
  if(!['cohort','annual'].includes(kind))throw Error('가져오기 유형이 올바르지 않습니다.');
  if(!Number.isInteger(Number(year))||Number(year)<2000||Number(year)>2100)throw Error('학년도 설정을 확인해 주세요.');
  const courses=[],records=[],standards={};
  let section='subject',group='';
  const hasFreeGrade1=rows.some(r=>text(r?.[1]).includes('자유학기 교과 시수 합계') && filled(r?.[12]));
  for(const row of rows.slice(5)){
    if(!row)continue;
    const first=text(row[0]);
    if(first.includes('창의적')&&first.includes('체험')){section='creative';group='창의적 체험활동';}
    else if(first.includes('자유')&&first.includes('학기')&&first.includes('활동')){section='free';group='자유학기 활동';}
    const lower=text(row[1]);
    if(section==='subject'&&lower&&!/합계/.test(lower)&&filled(row[2]))group=normalizeGroup(lower);
    const course=rowCourse(row,section,group);
    if(!course)continue;
    if(/시수.*합계|총계/.test(course.name))continue;
    const id=courseId(course.name,course.area,course.group);
    if(courses.some(c=>c.id===id))continue;
    const item={id,...course,autonomous:course.area==='subject'&&/생활 속 노작 활동/.test(course.name)};
    courses.push(item);
    const hours={
      '1-1':number(hasFreeGrade1?row[12]:row[8]),'1-2':number(row[10]),
      '2-1':number(row[18]),'2-2':number(row[20]),'3-1':number(row[22]),'3-2':number(row[24]),
    };
    const base1=number(row[8]);
    records.push({id,hours,base1});
    if(course.area==='subject'&&filled(row[3])&&!standards[course.group])standards[course.group]=number(row[3]);
  }
  if(courses.length<10||!courses.some(c=>c.name==='국어'))throw Error('과목 정보를 충분히 읽지 못했습니다. 원본 편성표 형식을 확인해 주세요.');
  const targets={};
  const targetRow=rows.find(r=>text(r?.[0]).includes('3개년 시수 총계'));
  if(targetRow){for(const [k,col] of Object.entries({'1-1':8,'1-2':10,'2-1':18,'2-2':20,'3-1':22,'3-2':24}))if(filled(targetRow[col]))targets[k]=number(targetRow[col]);}
  const builds=[];
  for(const grade of kind==='cohort'?[1,2,3]:[1,2,3]){
    const cohortYear=kind==='cohort'?Number(year):Number(year)-grade+1;
    const values={},base={};
    for(const term of [1,2]){
      const key=`${grade}-${term}`;
      values[key]=Object.fromEntries(records.filter(r=>r.hours[key]>0).map(r=>[r.id,r.hours[key]]));
      if(grade===1&&term===1&&hasFreeGrade1)base[key]=Object.fromEntries(records.filter(r=>r.base1>0).map(r=>[r.id,r.base1]));
    }
    builds.push({cohortYear,grade,terms:values,baseTerms:base,targets:Object.fromEntries([1,2].map(t=>{const k=`${grade}-${t}`;return [k,targets[k]??null];}).filter(x=>x[1]!==null))});
  }
  return {kind,year:Number(year),title,courses,standards,builds,preview:{courseCount:courses.length,totals:builds.map(b=>({grade:b.grade,cohortYear:b.cohortYear,first:Object.values(b.terms[`${b.grade}-1`]).reduce((a,b)=>a+b,0),second:Object.values(b.terms[`${b.grade}-2`]).reduce((a,b)=>a+b,0)}))}};
}
export function mergeCurriculumImport(previous,result){
  const state=normalizeCurriculum(previous);
  const courseMap=new Map(state.courses.map(c=>[c.id,c]));
  for(const course of result.courses)courseMap.set(course.id,course);
  const cohorts={...state.cohorts};
  for(const b of result.builds){
    const prior=cohorts[String(b.cohortYear)]||makeCohort(b.cohortYear);
    cohorts[String(b.cohortYear)]={...prior,source:result.title,terms:{...prior.terms,...b.terms},baseTerms:{...prior.baseTerms,...b.baseTerms},targets:{...prior.targets,...b.targets},completeGrades:[...new Set([...(prior.completeGrades||[]),b.grade])].sort(),updatedAt:new Date().toISOString()};
  }
  return {...state,courses:[...courseMap.values()],cohorts,standards:{...state.standards,...result.standards}};
}
export const setTermHour=(previous,cohortYear,key,id,value)=>{
  const state=normalizeCurriculum(previous),cohorts={...state.cohorts};
  const cohort=cohorts[String(cohortYear)]||makeCohort(cohortYear);
  cohorts[String(cohortYear)]={...cohort,terms:{...cohort.terms,[key]:{...(cohort.terms?.[key]||{}),[id]:hoursNumber(value)}},completeGrades:[...new Set([...(cohort.completeGrades||[]),Number(key[0])])].sort(),updatedAt:new Date().toISOString()};
  return {...state,cohorts};
};
export const addCohort=(previous,year,sourceYear=null)=>{
  const state=normalizeCurriculum(previous);if(state.cohorts[String(year)])throw Error('이미 존재하는 입학 연도입니다.');
  const from=state.cohorts[String(sourceYear)]||null;
  const cohort=from?{...structuredClone(from),year:Number(year),source:`${sourceYear}년 입학생 계획 복제`,updatedAt:new Date().toISOString()}:makeCohort(year);
  return {...state,cohorts:{...state.cohorts,[String(year)]:cohort}};
};
const safeCsv=v=>`"${(/^[\s]*[=+@-]/.test(String(v??''))?"'":"")+String(v??'').replaceAll('"','""')}\"`;
const csv=rows=>'\ufeff'+rows.map(r=>r.map(safeCsv).join(',')).join('\r\n');
export const cohortCsv=(state,year)=>{
  const data=normalizeCurriculum(state),c=data.cohorts[String(year)];if(!c)throw Error('해당 입학 연도 편성안이 없습니다.');
  return csv([['과목/활동','영역','교과군',...TERM_KEYS.map(k=>TERM_LABELS[k]),'3개년 합계'],...data.courses.map(x=>[x.name,COURSE_AREA_LABELS[x.area],x.group,...TERM_KEYS.map(k=>termHours(c,k,x.id)),TERM_KEYS.reduce((a,k)=>a+termHours(c,k,x.id),0)])]);
};
export const operationalCsv=(state,year)=>{
  const data=normalizeCurriculum(state),o=operationalPlan(data,year);
  return csv([['과목/활동','영역','교과군',...TERM_KEYS.map(k=>`${year}학년도 ${TERM_LABELS[k]}`)],...data.courses.map(x=>[x.name,COURSE_AREA_LABELS[x.area],x.group,...o.grades.flatMap(g=>g.semesters.map(s=>g.ready?termHours(g.cohort,s.key,x.id):'미편성'))])]);
};
