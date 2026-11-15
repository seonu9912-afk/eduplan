import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademic,getTerm2Start,planForDate,summarizeAcademic,rangeDates} from '../lib/academic.js';
import {tallyCalendar,validateEventRow,normalizeEventRow,reportCsv} from '../lib/calendar.js';

function setSummer(plan,start,end){plan.dayRules.push(...rangeDates(start,end).map(date=>({date,kind:'vacation',label:'여름방학',source:'manual'})));return plan;}

test('second semester is unknown until summer vacation is set, then derived without manual field',()=>{
  const p=createAcademic(2027);
  assert.equal(getTerm2Start(p),null);
  assert.equal(tallyCalendar(p).term2Start,null);
  setSummer(p,'2027-07-26','2027-08-13');
  assert.equal(getTerm2Start(p),'2027-08-16');
  p.dayRules.push({date:'2027-08-16',kind:'holiday',label:'대체공휴일'});
  assert.equal(getTerm2Start(p),'2027-08-17');
  const t=tallyCalendar(p);
  assert.equal(t.first+t.second,t.total);
  assert.equal(t.byGrade[1].first+t.byGrade[1].second,t.byGrade[1].total);
});

test('school day count above goal is permitted and does not trigger too-many-days warning',()=>{
  const p=createAcademic(2027);
  const t=tallyCalendar(p);
  assert.ok(t.total>220);
  assert.ok(!t.issues.some(x=>x.title.includes('다시 확인')));
  assert.ok(!t.issues.some(x=>x.level==='error'));
});

test('bulk event schema validates subject and grade and normalizes volunteer detail',()=>{
  const p=createAcademic(2027);
  const src={date:'2027-05-07',name:'  봉사 캠페인 ',periodStart:5,periodEnd:6,curriculumArea:'creative_club',volunteer:true,grades:[1],department:'교무부'};
  assert.equal(validateEventRow(2027,src,p.subjects),null);
  assert.equal(validateEventRow(2027,{...src,periodEnd:4},p.subjects), '1~12교시 범위에서 운영 교시를 지정하세요.');
  assert.equal(validateEventRow(2027,{...src,curriculumArea:'subject',subjectId:''},p.subjects),'교과 행사에는 해당 과목을 선택해야 합니다.');
  const row=normalizeEventRow(src,'my-event');
  assert.equal(row.affectsTimetable,true);
  assert.equal(row.name,'봉사 캠페인');
  assert.equal(row.volunteer,true);
  assert.equal(row.curriculumArea,'creative_club');
});

test('event replaces specific dated class periods without changing recurring plan',()=>{
  const p=createAcademic(2027);const date='2027-05-07';
  const before=planForDate(p,date);
  const event=normalizeEventRow({date,name:'동아리 행사',periodStart:5,periodEnd:6,curriculumArea:'creative_club',grades:[1],volunteer:true},'evt-1');
  const after=planForDate(p,date,[event]);
  assert.equal(after.find(s=>s.scopeId==='g1c1'&&s.period===5).source,'event');
  assert.equal(after.find(s=>s.scopeId==='g1c1'&&s.period===6).source,'event');
  assert.equal(after.find(s=>s.scopeId==='g2c1'&&s.period===5).source,'base');
  assert.deepEqual(before,planForDate(p,date));
  const totals=summarizeAcademic(p,[event]).totals;
  assert.equal(totals.g1c1.total, summarizeAcademic(p).totals.g1c1.total+1);
  assert.ok(totals.g1c1.byCategory.creative_club>summarizeAcademic(p).totals.g1c1.byCategory.creative_club);
  assert.ok(reportCsv(p,[event]).includes('봉사 포함'));
});

test('overlapping event slots are flagged for review',()=>{
  const p=createAcademic(2027);
  const a=normalizeEventRow({date:'2027-05-07',name:'행사 A',periodStart:5,periodEnd:6,curriculumArea:'creative_self',grades:[1]},'evtA');
  const b=normalizeEventRow({date:'2027-05-07',name:'행사 B',periodStart:6,periodEnd:7,curriculumArea:'creative_club',grades:[1]},'evtB');
  assert.ok(tallyCalendar(p,[a,b]).issues.some(x=>x.title.includes('행사 중복')));
});

test('single-day school event does not accidentally cover every subsequent day',async()=>{
  const {dateEvents}=await import('../lib/calendar.js');
  const p=createAcademic(2027);
  const event=normalizeEventRow({date:'2027-05-07',name:'당일 행사',periodStart:2,periodEnd:3,curriculumArea:'creative_self',grades:[]},'only-day');
  assert.equal(dateEvents([event],'2027-05-07').length,1);
  assert.equal(dateEvents([event],'2027-05-08').length,0);
  assert.equal(planForDate(p,'2027-05-10',[event]).some(x=>x.source==='event'),false);
});
