import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTeachingPlan, validationSummary } from '../lib/teaching-validation.ts';
const rub = (scores) => scores.map((x,i)=>({id:`r${i}`,name:`요소${i}`,levels:[{score:x},{score:10}]}));
const baseline = () => ({
  planId:'grade1-sem2',stage:'submit',
  schoolPolicy:{expectedTotalWeight:100,minimumScore:{mode:'range',min:40,max:60},periodMode:'every-month'},
  annual:[{id:'a',name:'단어의 짜임과 새말',weightPercent:50,period:{kind:'months',months:[9,10]}},{id:'b',name:'한 학기 한 권 읽기',weightPercent:50,period:{kind:'anytime'}}],
  assessments:[{id:'a',name:'단어의 짜임과 새말',weightPercent:50,maxPoints:100,period:{kind:'months',months:[9,10]},rubric:rub([25,25,25,25])},{id:'b',name:'한 학기 한 권 읽기',weightPercent:50,maxPoints:100,period:{kind:'anytime'},rubric:rub([25,25,25,25])}],
  weeks:[{id:'w1',grade:1,subjectId:'korean',month:9,assessmentLinks:[{areaId:'a'}]},{id:'w2',grade:1,subjectId:'korean',month:10,assessmentLinks:[{areaId:'a'}]},{id:'w3',grade:1,subjectId:'korean',month:11,assessmentLinks:[{areaId:'b'}]}],
});
test('정상 평가 최고/최하점과 반영비율',()=>{const r=validateTeachingPlan(baseline());assert.equal(r.filter(f=>f.group==='score').length,0);assert.deepEqual(validationSummary(r),{warnings:0,notices:0,canSave:true,canSubmit:true});});
test('최고점 95 / 최하점 30 경고·비차단',()=>{const x=baseline();x.assessments[0].rubric=rub([25,25,25,20]);x.assessments[0].rubric.forEach(c=>c.levels[1].score=7.5);const r=validateTeachingPlan(x);assert(r.some(f=>f.code==='RUBRIC_MAX_DIFFERENT'&&f.actual===95));assert(r.some(f=>f.code==='RUBRIC_MIN_OUTSIDE_POLICY'&&f.actual===30));assert.equal(validationSummary(r).canSubmit,true);});
test('9~10월 계획은 정책에 따라 매월 반영 확인',()=>{const x=baseline();x.weeks=x.weeks.filter(w=>w.id!=='w2');let r=validateTeachingPlan(x);assert(r.some(f=>f.code==='ASSESSMENT_MONTH_MISSING'));x.schoolPolicy.periodMode='within-window';r=validateTeachingPlan(x);assert(!r.some(f=>f.code==='ASSESSMENT_MONTH_MISSING'));});
test('연간 계획과 학기 평가 내용 불일치',()=>{const x=baseline();x.assessments[0].weightPercent=40;const r=validateTeachingPlan(x);assert(r.some(f=>f.code==='AREA_WEIGHT_DIFFERENT'));assert(r.some(f=>f.code==='WEIGHT_TOTAL_DIFFERENT'));});
test('공식 원문 코드가 일치하는지 검증하되 공식 데이터가 없을 때 생성하지 않음',()=>{const x=baseline();x.assessments[0].standards=[{code:'[9국04-02]',curriculumVersion:'2022',subject:'국어',description:'틀린 문장'}];x.officialStandards=[{code:'[9국04-02]',curriculumVersion:'2022',subject:'국어',description:'공식 문장'}];assert(validateTeachingPlan(x).some(f=>f.code==='STANDARD_DESCRIPTION_DIFFERENT'));delete x.officialStandards;assert(validateTeachingPlan(x).some(f=>f.code==='STANDARD_NOT_VERIFIABLE'));});
test('동일 수업의 학급별 복제는 학년 시수에 한 번만 반영',()=>{const x=baseline();x.weeks.push({id:'c1',grade:1,classId:'1-1',subjectId:'korean',month:9,assessmentLinks:[],crossCurricular:[{topicId:'민주시민',sharedLessonId:'shared-1',hours:2}]});x.weeks.push({id:'c2',grade:1,classId:'1-2',subjectId:'korean',month:9,assessmentLinks:[],crossCurricular:[{topicId:'민주시민',sharedLessonId:'shared-1',hours:2}]});x.crossCurricularRequirements=[{topicId:'민주시민',grade:1,targetHours:3,allocations:[{subjectId:'korean',hours:3}]}];const r=validateTeachingPlan(x);assert.equal(r.find(f=>f.code==='CROSS_CURRICULAR_SHORTAGE').actual,2);});
test('미완성 루브릭은 작성 중 억제, 제출 시 안내',()=>{const x=baseline();x.assessments[0].rubric=[];x.stage='draft';assert(!validateTeachingPlan(x).some(f=>f.code==='RUBRIC_INCOMPLETE'));x.stage='submit';assert(validateTeachingPlan(x).some(f=>f.code==='RUBRIC_INCOMPLETE'));});
