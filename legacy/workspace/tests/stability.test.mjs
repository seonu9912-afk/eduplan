import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademic,getTerm2Start,planForDate,summarizeAcademic,rangeDates} from '../lib/academic.js';
import {ymd,tallyCalendar,validateEventRow} from '../lib/calendar.js';
import {planDateChange,previewDateChange} from '../lib/impact.js';

test('invalid calendar dates and event dates are rejected',()=>{
  assert.equal(ymd('2027-04-31'),false);
  assert.equal(ymd('2028-02-29'),true);
  assert.equal(ymd('2027-02-29'),false);
  assert.match(validateEventRow(2027,{name:'잘못된 날짜',date:'2027-04-31'},[]),/날짜/);
});
test('an autumn vacation does not shift the calculated summer second semester start',()=>{
  const p=createAcademic(2027);
  for(const date of rangeDates('2027-07-26','2027-08-13'))p.dayRules.push({date,kind:'vacation',label:'여름방학'});
  p.dayRules.push({date:'2027-09-22',kind:'vacation',label:'추석 연휴'});
  assert.equal(getTerm2Start(p),'2027-08-16');
});
test('a grade-specific holiday changes both day count and dated timetable without changing other grades',()=>{
  const p=createAcademic(2027),date='2027-05-10';
  const before=planForDate(p,date);
  const originalWeekly=JSON.stringify(p.weekly);
  p.gradeRules=[{date,grade:1,kind:'closed',label:'1학년만 휴업'}];
  const after=planForDate(p,date);
  assert.equal(after.some(s=>s.scope==='class'&&s.scopeId==='g1c1'),false);
  assert.equal(after.some(s=>s.scope==='class'&&s.scopeId==='g2c1'),true);
  assert.equal(tallyCalendar(p).byGrade[1].total,tallyCalendar({...p,gradeRules:[]}).byGrade[1].total-1);
  assert.equal(summarizeAcademic(p).totals.g1c1.total,summarizeAcademic({...p,gradeRules:[]}).totals.g1c1.total-5);
  assert.equal(JSON.stringify(p.weekly),originalWeekly);
  assert.ok(before.length>after.length);
});
test('preview and final batch application use one reducer and agree exactly',()=>{
  const p=createAcademic(2027);
  const s={start:'2027-05-10',end:'2027-05-14',kind:'closed',label:'휴업'};
  const prev=previewDateChange(p,s,'all');
  const applied=planDateChange(p,s,'all');
  assert.deepEqual(prev.plan,applied.plan);
  assert.equal(prev.commonDelta,-5);
  assert.equal(prev.changed.length,3);
  assert.equal(tallyCalendar(applied.plan).total,prev.after.total);
});
test('grade-specific scenario does not incorrectly reduce school-wide days',()=>{
  const p=createAcademic(2027);
  const prev=previewDateChange(p,{start:'2027-05-10',end:'2027-05-10',kind:'closed',label:''},'2');
  assert.equal(prev.commonDelta,0);
  assert.deepEqual(prev.changed.map(g=>g.grade),[2]);
});
test('scenario rejects invalid boundaries without changing input',()=>{
  const p=createAcademic(2027),snapshot=JSON.stringify(p);
  assert.ok(planDateChange(p,{start:'2027-04-31',end:'2027-05-05',kind:'closed'}).error);
  assert.ok(previewDateChange(p,{start:'2027-03-01',end:'2028-02-28',kind:'vacation'}).error);
  assert.equal(JSON.stringify(p),snapshot);
});

test('grade weekday override changes that grade only',()=>{
  const p=createAcademic(2027),date='2027-05-10'; // Monday
  p.dayRules.push({date,kind:'instruction',weekdayOverride:3,label:'수요일 운영'});
  p.gradeRules=[{date,grade:1,kind:'instruction',weekdayOverride:0,label:'1학년 정상 운영'}];
  const slots=planForDate(p,date);
  const monday1=slots.filter(s=>s.scopeId==='g1c1').map(s=>s.subjectId);
  const wednesday2=slots.filter(s=>s.scopeId==='g2c1').map(s=>s.subjectId);
  assert.equal(monday1[0],'korean');
  assert.equal(wednesday2[0],'english');
  assert.equal(slots.filter(s=>s.scopeId==='g3c1').length,5);
});
