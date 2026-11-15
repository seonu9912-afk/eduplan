/**
 * EduPlan 교수학습·평가계획 — 비차단형 정합성 검사 핵심 모듈
 *
 * 기존 UI/DB와 결합하지 않는 순수 함수이며, 교사가 작성/저장/제출하는 행동을 막지 않습니다.
 * 공식 성취기준 데이터는 입력받은 검증된 레지스트리만 사용합니다.
 */

export type ValidationStage = "draft" | "submit" | "review";
export type Severity = "warning" | "notice";
export type ValidationGroup = "score" | "annual" | "schedule" | "standard" | "cross-curricular";

export interface Finding {
  id: string;
  code: string;
  group: ValidationGroup;
  severity: Severity;
  title: string;
  message: string;
  /** 에디터의 특정 행/셀로 이동시키기 위한 안정적인 식별자 */
  target: { entity: "assessment" | "week" | "standard" | "cross-curricular" | "plan"; id: string };
  /** 사용자 판단을 위한 참고 값 — 제출 차단에 사용하지 않음 */
  expected?: string | number;
  actual?: string | number;
}

export interface ScoreLevel {
  score: number | null;
  description?: string;
}
export interface RubricCriterion {
  id: string;
  name: string;
  levels: ScoreLevel[];
}
export type AssessmentPeriod =
  | { kind: "months"; months: number[] }
  | { kind: "anytime" };
export interface AssessmentArea {
  id: string;
  name: string;
  weightPercent: number | null;
  maxPoints: number;
  period: AssessmentPeriod;
  rubric: RubricCriterion[];
  standards?: StandardLink[];
}
export interface AnnualAssessment {
  id: string;
  name: string;
  weightPercent: number | null;
  period: AssessmentPeriod;
}
export interface StandardLink {
  code: string;
  /** 성취기준 원문이 자유 입력되어 있을 때만 검증. 값이 없으면 누락 검사로 넘김. */
  description?: string;
  /** 예: '2015', '2022' */
  curriculumVersion: string;
  subject: string;
}
export interface StandardRecord {
  code: string;
  description: string;
  curriculumVersion: string;
  subject: string;
}
export interface LessonAssessmentLink {
  areaId: string;
}
export interface CrossCurricularOccurrence {
  topicId: string;
  /** 동일 활동의 복수 학급 행을 식별하는 공유 수업 ID */
  sharedLessonId: string;
  /** 학년 전체에 인정되는 계획 시수 */
  hours: number;
}
export interface TeachingWeek {
  id: string;
  grade: number;
  subjectId: string;
  month: number;
  assessmentLinks: LessonAssessmentLink[];
  crossCurricular?: CrossCurricularOccurrence[];
  /** 다수 학급의 동일 수업은 공유 ID로 집계하며 반 ID는 집계에 사용하지 않음 */
  classId?: string;
}
export interface MinimumPolicy {
  mode: "exact" | "range" | "none";
  value?: number;
  min?: number;
  max?: number;
}
export interface SchoolPolicy {
  expectedTotalWeight?: number | null;
  minimumScore: MinimumPolicy;
  /** 다개월 계획에 대한 기본 검증법; 'manual'은 자동 시기 검증 생략 */
  periodMode: "within-window" | "every-month" | "manual";
}
export interface CrossCurricularRequirement {
  topicId: string;
  grade: number;
  targetHours: number;
  /** 교과별 배정 시수 — 계획 부족 여부에 대한 검토가 필요한 경우 */
  allocations?: Array<{ subjectId: string; hours: number }>;
}
export interface PlanValidationInput {
  planId: string;
  stage: ValidationStage;
  schoolPolicy: SchoolPolicy;
  annual: AnnualAssessment[];
  assessments: AssessmentArea[];
  weeks: TeachingWeek[];
  officialStandards?: StandardRecord[];
  crossCurricularRequirements?: CrossCurricularRequirement[];
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.000001;
const months = (p: AssessmentPeriod): number[] => p.kind === "months" ? [...new Set(p.months)].sort((a,b) => a-b) : [];
const periodString = (p: AssessmentPeriod): string => p.kind === "anytime" ? "수시" : months(p).join(", ") + "월";
const norm = (s: string): string => s.replace(/\s+/g," ").trim();

function rubricRange(area: AssessmentArea): {max: number; min: number; incomplete: boolean; outOfOrder: boolean} {
  let max = 0, min = 0, incomplete = area.rubric.length === 0, outOfOrder = false;
  for (const r of area.rubric) {
    const values = r.levels.map(l => l.score);
    if (!r.name.trim() || !values.length || values.some(v => v === null || !Number.isFinite(v!))) { incomplete = true; continue; }
    const actual = values as number[];
    max += Math.max(...actual); min += Math.min(...actual);
    if (actual.some((v, i) => i > 0 && v > actual[i-1])) outOfOrder = true;
  }
  return { max, min, incomplete, outOfOrder };
}

/** 작성 중에는 미완성 경고를 억제하고, 제출/검토 단계에서 누락 사항을 재검토합니다. */
export function validateTeachingPlan(input: PlanValidationInput): Finding[] {
  const findings: Finding[] = [];
  const done = input.stage !== "draft";
  const add = (f: Finding) => findings.push(f);
  const areaIds = new Set(input.assessments.map(a=>a.id));

  // 연간 계획과 학기별 평가영역은 동일 ID를 참조하는 것이 정상.
  for (const annual of input.annual) {
    const area = input.assessments.find(a => a.id === annual.id);
    if (!area) {
      if (done) add({ id:`annual-missing:${annual.id}`, code:"ANNUAL_AREA_MISSING",group:"annual",severity:"warning",title:"학기 계획에 없는 평가영역",message:`연간 평가계획의 ‘${annual.name}’ 영역이 학기별 평가 세부계획에 없습니다.`,target:{entity:"assessment",id:annual.id} });
      continue;
    }
    if (norm(area.name)!==norm(annual.name)) add({ id:`annual-name:${area.id}`,code:"AREA_NAME_DIFFERENT",group:"annual",severity:"warning",title:"평가영역명 불일치",message:`연간 계획 ‘${annual.name}’과 학기 계획 ‘${area.name}’이 다릅니다.`,target:{entity:"assessment",id:area.id} });
    if (area.weightPercent !== null && annual.weightPercent !== null && !near(area.weightPercent,annual.weightPercent)) add({id:`annual-weight:${area.id}`,code:"AREA_WEIGHT_DIFFERENT",group:"annual",severity:"warning",title:"반영비율 불일치",message:`‘${area.name}’의 연간 ${annual.weightPercent}% / 학기 ${area.weightPercent}%를 확인해 주세요.`,expected:annual.weightPercent,actual:area.weightPercent,target:{entity:"assessment",id:area.id}});
    if (periodString(area.period)!==periodString(annual.period)) add({id:`annual-period:${area.id}`,code:"AREA_PERIOD_DIFFERENT",group:"annual",severity:"warning",title:"평가시기 불일치",message:`‘${area.name}’의 연간 ${periodString(annual.period)} / 학기 ${periodString(area.period)}를 확인해 주세요.`,target:{entity:"assessment",id:area.id}});
  }
  for (const area of input.assessments) {
    if (!input.annual.some(a => a.id === area.id)) add({id:`area-unlisted:${area.id}`,code:"AREA_NOT_IN_ANNUAL",group:"annual",severity:"warning",title:"연간 계획에 없는 평가영역",message:`‘${area.name}’은 학기별 계획에 있지만 연간 평가계획에는 없습니다.`,target:{entity:"assessment",id:area.id}});
    const range = rubricRange(area);
    if (range.incomplete) {
      if (done) add({id:`rubric-incomplete:${area.id}`,code:"RUBRIC_INCOMPLETE",group:"score",severity:"notice",title:"채점기준 미완성",message:`‘${area.name}’의 평가요소·수준·배점을 확인해 주세요.`,target:{entity:"assessment",id:area.id}});
    } else {
      if (!near(range.max,area.maxPoints)) add({id:`rubric-maximum:${area.id}`,code:"RUBRIC_MAX_DIFFERENT",group:"score",severity:"warning",title:"최고점 합계 확인",message:`‘${area.name}’ 최고점 합계가 ${range.max}점으로 설정된 만점 ${area.maxPoints}점과 다릅니다.`,expected:area.maxPoints,actual:range.max,target:{entity:"assessment",id:area.id}});
      const minp=input.schoolPolicy.minimumScore;
      const invalid = minp.mode==="exact" ? minp.value!==undefined&&!near(range.min,minp.value)
        : minp.mode==="range" ? (minp.min!==undefined&&range.min<minp.min)||(minp.max!==undefined&&range.min>minp.max)
        : false;
      if (invalid) add({id:`rubric-minimum:${area.id}`,code:"RUBRIC_MIN_OUTSIDE_POLICY",group:"score",severity:"warning",title:"최하점 기준 확인",message:`‘${area.name}’ 최하점 합계 ${range.min}점이 학교 설정 기준과 다릅니다.`,actual:range.min,target:{entity:"assessment",id:area.id}});
      if (range.outOfOrder) add({id:`rubric-order:${area.id}`,code:"RUBRIC_SCORE_ORDER",group:"score",severity:"notice",title:"배점 단계 순서 확인",message:`‘${area.name}’의 배점이 높은 수준에서 낮은 수준으로 정렬되어 있는지 확인해 주세요.`,target:{entity:"assessment",id:area.id}});
    }
  }
  const weight=input.assessments.map(a=>a.weightPercent);
  const expected=input.schoolPolicy.expectedTotalWeight;
  if (expected!==null&&expected!==undefined && weight.every(x=>x!==null) && !near(weight.reduce<number>((s,v)=>s+(v??0),0),expected)) {
    const actual=weight.reduce<number>((s,v)=>s+(v??0),0);
    add({id:`weight-total:${input.planId}`,code:"WEIGHT_TOTAL_DIFFERENT",group:"score",severity:"warning",title:"반영비율 합계 확인",message:`학기 평가영역의 반영비율 합계 ${actual}%가 학교 기준 ${expected}%와 다릅니다.`,expected,actual,target:{entity:"plan",id:input.planId}});
  }

  // '★수행평가 연계'를 실제 시험 실시라고 단정하지 않는 정합성 경고.
  for (const area of input.assessments) {
    const foundMonths=[...new Set(input.weeks.filter(w=>w.assessmentLinks.some(l=>l.areaId===area.id)).map(w=>w.month))].sort((a,b)=>a-b);
    if (!foundMonths.length) {
      if(done && input.schoolPolicy.periodMode!=="manual") add({id:`link-absent:${area.id}`,code:"ASSESSMENT_LINK_ABSENT",group:"schedule",severity:"notice",title:"교수학습계획 연계 확인",message:`‘${area.name}’과 연결된 주차가 없습니다. 평가 실시 여부가 아닌 연계 표시를 확인합니다.`,target:{entity:"assessment",id:area.id}});
      continue;
    }
    if(area.period.kind!=="months"||input.schoolPolicy.periodMode==="manual") continue;
    const requested=months(area.period);
    const outside=foundMonths.filter(m=>!requested.includes(m));
    if(outside.length) add({id:`link-outside:${area.id}`,code:"ASSESSMENT_LINK_OUTSIDE_PERIOD",group:"schedule",severity:"warning",title:"평가시기 외 연계 확인",message:`‘${area.name}’ 예정 ${periodString(area.period)} / 실제 연계 ${foundMonths.join(", ")}월입니다. 예정 기간 밖의 연계가 있는지 확인해 주세요.`,target:{entity:"assessment",id:area.id}});
    if(input.schoolPolicy.periodMode==="every-month") {
      const missing=requested.filter(m=>!foundMonths.includes(m));
      if(missing.length) add({id:`link-month-missing:${area.id}`,code:"ASSESSMENT_MONTH_MISSING",group:"schedule",severity:"notice",title:"월별 수행평가 연계 확인",message:`‘${area.name}’ 평가 예정 ${periodString(area.period)} 중 ${missing.join(", ")}월의 교수학습계획 연계 표시가 없습니다.`,target:{entity:"assessment",id:area.id}});
    }
  }

  const official = new Map((input.officialStandards??[]).map(s=>[`${s.curriculumVersion}::${s.subject}::${s.code}`,s]));
  for(const area of input.assessments) for(const [i,l] of (area.standards??[]).entries()) {
    const found=official.get(`${l.curriculumVersion}::${l.subject}::${l.code}`);
    if (!found) {
      if(done) add({id:`standard-unverified:${area.id}:${i}`,code:"STANDARD_NOT_VERIFIABLE",group:"standard",severity:"notice",title:"성취기준 원문 검증 불가",message:`‘${l.code}’의 공식 원문 데이터가 등록되어 있지 않습니다. 임의로 원문을 생성하지 않습니다.`,target:{entity:"standard",id:`${area.id}:${i}`}});
    } else if(l.description && norm(l.description)!==norm(found.description)) {
      add({id:`standard-mismatch:${area.id}:${i}`,code:"STANDARD_DESCRIPTION_DIFFERENT",group:"standard",severity:"warning",title:"성취기준 코드·원문 확인",message:`‘${l.code}’ 입력 진술이 등록된 ${l.curriculumVersion} 개정 교육과정 원문과 다릅니다.`,target:{entity:"standard",id:`${area.id}:${i}`}});
    }
  }
  for(const week of input.weeks) for(const link of week.assessmentLinks) {
    if(!areaIds.has(link.areaId)) add({id:`week-unknown-area:${week.id}:${link.areaId}`,code:"LESSON_REFERENCES_UNKNOWN_AREA",group:"annual",severity:"warning",title:"알 수 없는 평가영역 연결",message:`교수학습계획 주차가 학기별 평가영역에 없는 ID와 연결되어 있습니다.`,target:{entity:"week",id:week.id}});
  }

  // 학급별로 복제된 동일 계획 수업의 시수는 sharedLessonId로 한 번만 인정.
  const unique = new Map<string,{grade:number;subjectId:string;topicId:string;hours:number}>();
  for(const week of input.weeks) for(const occ of week.crossCurricular??[]) {
    const key=`${week.grade}::${week.subjectId}::${occ.topicId}::${occ.sharedLessonId}`;
    const prior=unique.get(key);
    if(!prior) unique.set(key,{grade:week.grade,subjectId:week.subjectId,topicId:occ.topicId,hours:occ.hours});
    else if(!near(prior.hours,occ.hours)) add({id:`cross-curricular-conflict:${key}`,code:"CROSS_CURRICULAR_DUPLICATE_CONFLICT",group:"cross-curricular",severity:"notice",title:"학급 간 시수 차이 확인",message:`동일 수업(${occ.sharedLessonId})의 범교과 시수가 학급별 계획에서 다르게 입력되어 있습니다.`,target:{entity:"cross-curricular",id:key}});
  }
  for(const req of input.crossCurricularRequirements??[]) {
    const rows=[...unique.values()].filter(v=>v.grade===req.grade && v.topicId===req.topicId);
    const actual=rows.reduce((sum,r)=>sum+r.hours,0);
    if(actual<req.targetHours) add({id:`cross-curricular-shortage:${req.grade}:${req.topicId}`,code:"CROSS_CURRICULAR_SHORTAGE",group:"cross-curricular",severity:"notice",title:"범교과 학습 시수 확인",message:`${req.grade}학년 ‘${req.topicId}’ 계획 확보 ${actual}차시 / 목표 ${req.targetHours}차시입니다.`,expected:req.targetHours,actual,target:{entity:"cross-curricular",id:`${req.grade}:${req.topicId}`}});
    for(const alloc of req.allocations??[]) {
      const portion=rows.filter(r=>r.subjectId===alloc.subjectId).reduce((sum,r)=>sum+r.hours,0);
      if(portion<alloc.hours) add({id:`cross-curricular-allocation:${req.grade}:${req.topicId}:${alloc.subjectId}`,code:"CROSS_CURRICULAR_ALLOCATION_SHORTAGE",group:"cross-curricular",severity:"notice",title:"교과별 배정 시수 확인",message:`${req.grade}학년 ${alloc.subjectId} 교과에 배정한 ‘${req.topicId}’ ${alloc.hours}차시 중 ${portion}차시가 반영되었습니다.`,expected:alloc.hours,actual:portion,target:{entity:"cross-curricular",id:`${req.grade}:${req.topicId}:${alloc.subjectId}`}});
    }
  }
  // 각 경고는 고유 ID를 유지한다. 검토 결과(수정 요청/예외 사유)는 별도 테이블에서 버전별 저장 권장.
  return findings;
}

/** 항상 비차단형: 검토 결과를 반환해도 저장·제출 가능 여부를 false로 바꾸지 않습니다. */
export function validationSummary(findings: Finding[]) {
  return { warnings: findings.filter(f=>f.severity==="warning").length,
           notices: findings.filter(f=>f.severity==="notice").length,
           canSave: true, canSubmit: true } as const;
}
