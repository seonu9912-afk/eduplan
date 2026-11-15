import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademic, academicEnd, rangeDates, schoolDay, planForDate, summarizeAcademic, categoryOf} from '../lib/academic.js';

test('2027 academic year includes leap-day 2028-02-29',()=>{
  assert.equal(academicEnd(2027),'2028-02-29');
  assert.equal(rangeDates('2027-03-01','2027-03-03').length,3);
});
test('school calendar can be edited without a timetable',()=>{
  const p=createAcademic(2027);p.weekly=[];
  assert.equal(schoolDay('2027-03-01',p.dayRules),true); // 공휴일 자동 불러오기 전에는 기본 평일로 계산
  p.dayRules.push({date:'2027-03-01',kind:'holiday',label:'삼일절'});
  const before=summarizeAcademic(p).daysTotal;
  p.dayRules.push({date:'2027-03-02',kind:'vacation',label:'휴업'});
  assert.equal(summarizeAcademic(p).daysTotal,before-1);
});
test('day-only override does not mutate the recurring timetable',()=>{
  const p=createAcademic(2027);
  const before=p.weekly.find(s=>s.scopeId==='g1c1'&&s.weekday===2&&s.period===1).subjectId;
  p.overrides.push({id:'override',date:'2027-03-02',scope:'class',scopeId:'g1c1',period:1,action:'replace',subjectId:'creative-self'});
  assert.equal(planForDate(p,'2027-03-02').find(s=>s.scopeId==='g1c1'&&s.period===1).subjectId,'creative-self');
  assert.equal(p.weekly.find(s=>s.scopeId==='g1c1'&&s.weekday===2&&s.period===1).subjectId,before);
  assert.equal(planForDate(p,'2027-03-09').find(s=>s.scopeId==='g1c1'&&s.period===1).subjectId,before);
});
test('weekday swap selects alternate weekday base timetable',()=>{
  const p=createAcademic(2027);
  p.dayRules.push({date:'2027-03-03',kind:'instruction',label:'월요일 시간표',weekdayOverride:1});
  assert.equal(planForDate(p,'2027-03-03').find(s=>s.scopeId==='g1c1'&&s.period===1).subjectId,'korean');
});
test('sports hours are within club category, not double-counted',()=>{
  const p=createAcademic(2027);const sum=summarizeAcademic(p);const stat=sum.totals.g1c1;
  assert.equal(categoryOf('sports'),'creative_club');
  assert.equal(stat.total,Object.values(stat.byCategory).reduce((a,b)=>a+b,0));
  assert((stat.bySubject.sports||0)>0);
});
test('mixed class groups count once per member class and reveal conflicts',()=>{
  const p=createAcademic(2027);
  p.groups.push({id:'sport-a',label:'스포츠 A반',classIds:['g1c1','g1c2']});
  p.weekly.push({id:'sport-slot',scope:'group',scopeId:'sport-a',weekday:5,period:6,subjectId:'sports',teacherId:'',room:''});
  const sum=summarizeAcademic(p);
  assert.equal(sum.totals.g1c1.bySubject.sports,sum.totals.g1c2.bySubject.sports);
  assert(sum.totals.g1c1.bySubject.sports>0);
  assert(!sum.conflicts.some(x=>x.message.includes('6교시')));
  p.weekly.push({id:'duplicate',scope:'class',scopeId:'g1c1',weekday:5,period:6,subjectId:'korean',teacherId:'',room:''});
  assert(summarizeAcademic(p).conflicts.some(x=>x.message.includes('1학년 1반 6교시 중복')));
});
