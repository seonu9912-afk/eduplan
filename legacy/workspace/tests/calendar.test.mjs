import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademic,academicStart,academicEnd} from '../lib/academic.js';
import {tallyCalendar,isInstructionDate,monthGrid,applyPublicHolidays,dateEvents,reportCsv} from '../lib/calendar.js';

test('year and leap-year boundary are correct',()=>{assert.equal(academicStart(2027),'2027-03-01');assert.equal(academicEnd(2027),'2028-02-29');});
test('holiday import covers next February and does not overwrite explicit manual choice',()=>{
  const p={...createAcademic(2027),dayRules:[{date:'2027-05-05',kind:'instruction',label:'특별 운영',source:'manual'}]};
  const merged=applyPublicHolidays(p,[{date:'2027-05-05',name:'어린이날',holiday:true},{date:'2028-02-29',name:'가상 특일',holiday:true}]);
  assert.equal(merged.dayRules.find(x=>x.date==='2027-05-05').kind,'instruction');
  assert.equal(merged.dayRules.find(x=>x.date==='2028-02-29').kind,'holiday');
  assert.equal(merged.status,'draft');
  assert.equal(p.dayRules.length,1);
});
test('school-day count is independent from timetable and grade exceptions are separate',()=>{
  const p={...createAcademic(2027),weekly:[],gradeRules:[{date:'2027-03-02',grade:1,kind:'closed',label:'1학년 휴업'}]};
  assert.equal(isInstructionDate(p,'2027-03-02'),true);
  assert.equal(isInstructionDate(p,'2027-03-02',1),false);
  assert.equal(isInstructionDate(p,'2027-03-02',2),true);
  const s=tallyCalendar(p,[]);
  assert.equal(s.byGrade[1].total,s.total-1);
  assert.equal(s.byGrade[2].total,s.total);
});
test('month grid begins on correct weekday and includes date 31',()=>{
  const g=monthGrid(2027,3);
  assert.equal(g.cells[0],null);
  assert.equal(g.cells[1],'2027-03-01');
  assert.equal(g.cells.includes('2027-03-31'),true);
});
test('events detect holiday collision, multi-day events cover each date',()=>{
  const p={...createAcademic(2027),dayRules:[{date:'2027-03-05',kind:'closed',label:'재량휴업'}]};
  const ev=[{date:'2027-03-04',endDate:'2027-03-05',name:'현장체험학습'}];
  assert.equal(dateEvents(ev,'2027-03-05').length,1);
  const s=tallyCalendar(p,ev);
  assert.ok(s.issues.some(x=>x.title.includes('현장체험학습')),'Multi-day events warn on closed dates');
});
test('CSV exports full year with grades and event names',()=>{
  const p=createAcademic(2027);
  const out=reportCsv(p,[{date:'2027-03-02',name:'시업식'}]);
  assert.ok(out.startsWith('\ufeff'));
  assert.ok(out.includes('2028-02-29'));
  assert.ok(out.includes('시업식'));
});
