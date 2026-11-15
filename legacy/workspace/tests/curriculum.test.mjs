import test from 'node:test';
import assert from 'node:assert/strict';
import {blankCurriculum,makeCohort,setTermHour,courseId,parseCurriculumSheet,mergeCurriculumImport,operationalPlan,sumCohort,staffingAnalysis,cohortCsv,operationalCsv} from '../lib/curriculum.js';
import {createAcademic} from '../lib/academic.js';
import {previewPeriodImpact} from '../lib/scenario.js';

function buildSampleRows(){
  const rows=Array.from({length:40},()=>Array(26).fill(null));
  rows[0][0]='2026학년도 신입생 3개년 교육과정 편성표';
  rows[5][0]='교과\n(군)';
  const subjects=[['국어','국어'],['사회','사회/역사/도덕'],['역사','사회/역사/도덕'],['도덕','사회/역사/도덕'],['수학','수학'],['과학','과학/기술·가정/정보'],['기술·가정','과학/기술·가정/정보'],['정보','과학/기술·가정/정보'],['체육','체육'],['음악','예술(음악·미술)'],['미술','예술(음악·미술)'],['영어','영어']];
  subjects.forEach(([name,group],i)=>{const row=rows[5+i];row[1]=group;row[2]=name;row[8]=48;row[10]=48;row[12]=32;row[18]=48;row[20]=48;row[22]=48;row[24]=48;});
  rows[18][1]='자유학기 교과 시수 합계';rows[18][12]=384;
  rows[19][0]='창의적 체험 활동';rows[19][1]='자율·자치활동';rows[19][8]=16;rows[19][12]=16;rows[19][10]=16;rows[19][18]=16;rows[19][20]=16;rows[19][22]=16;rows[19][24]=16;
  rows[20][0]='자유학기 활동';rows[20][1]='주제선택활동';rows[20][12]=192;
  rows[37][0]='3개년 시수 총계';[8,10,18,20,22,24].forEach(i=>rows[37][i]=600);
  return rows;
}
test('school workbook maps one cohort into three grades and sums free-term actual hours, not baseline twice',()=>{
  const parsed=parseCurriculumSheet(buildSampleRows(),'cohort',2026);
  const result=mergeCurriculumImport(null,parsed);
  assert(parsed.courses.length>=14);
  assert.equal(parsed.preview.totals[0].first,12*32+16+192);
  assert.equal(parsed.preview.totals[0].second,12*48+16);
  assert.equal(result.cohorts['2026'].baseTerms['1-1'][courseId('국어','subject','국어')],48);
  assert.equal(result.cohorts['2026'].terms['1-1'][courseId('국어','subject','국어')],32);
  assert.equal(sumCohort(result.cohorts['2026'],result.courses).terms['1-1'].byArea.free_topic,192);
});
test('operational year mixes admission cohorts and never guesses missing years',()=>{
  let state=blankCurriculum();
  const id=state.courses[0].id;
  state=setTermHour(state,2027,'1-1',id,48);
  let op=operationalPlan(state,2027);
  assert.equal(op.grades[0].cohortYear,2027);
  assert.equal(op.grades[0].semesters[0].totals.total,48);
  assert.equal(op.grades[1].cohortYear,2026);
  assert.equal(op.grades[1].ready,false);
  assert.equal(op.complete,false);
  state=setTermHour(state,2026,'2-1',id,52);
  state=setTermHour(state,2025,'3-1',id,54);
  op=operationalPlan(state,2027);
  assert.deepEqual(op.grades.map(g=>g.semesters[0].totals.total),[48,52,54]);
  assert.equal(op.complete,true);
});
test('annual import touches grade 1 of current and grades 2,3 of earlier cohorts',()=>{
  const parsed=parseCurriculumSheet(buildSampleRows(),'annual',2026);
  const state=mergeCurriculumImport(null,parsed);
  assert.deepEqual(Object.keys(state.cohorts).sort(),['2024','2025','2026']);
  assert.deepEqual(state.cohorts['2025'].completeGrades,[2]);
  assert.equal(operationalPlan(state,2026).complete,true);
});
test('teacher load is explicitly based on the selected semester, weeks and class count',()=>{
  let data=blankCurriculum();const id=data.courses[0].id;
  data=setTermHour(data,2026,'1-1',id,48);
  const result=staffingAnalysis(data,2026,{1:2,2:0,3:0});
  const korean=result.find(x=>x.group==='국어');
  assert.equal(korean.terms[0].weekly,6);
  assert.equal(korean.complete,false);
});
test('numeric inputs sanitize negatives and CSV values are not equations',()=>{
  const c=blankCurriculum();c.courses.push({id:'malicious',name:'=HYPERLINK("https://test.invalid")',area:'subject',group:'선택'});
  let x=setTermHour(c,2027,'1-1',c.courses[0].id,-30);
  assert.equal(x.cohorts['2027'].terms['1-1'][c.courses[0].id],0);
  assert.match(cohortCsv(x,2027),/\"'=HYPERLINK/);
  assert.match(operationalCsv(x,2027),/미편성/);
});
test('scenario impact changes only the affected grades and does not edit the base timetable',()=>{
  const p=createAcademic(2027),old=JSON.stringify(p.weekly);
  const r=previewPeriodImpact(p,{start:'2027-05-10',end:'2027-05-10',kind:'closed',label:'휴업'},'1');
  assert.equal(r.available,true);
  assert.equal(r.before,10);
  assert.equal(r.after,0);
  assert.equal(r.delta,-10);
  assert.equal(JSON.stringify(p.weekly),old);
  assert(r.subjectChanges.some(x=>x.delta<0));
});
test('unsupported workbook layout is rejected, not partially committed',()=>{
  assert.throws(()=>parseCurriculumSheet([['A']], 'annual',2026),/행/);
  const wrong=buildSampleRows();wrong[0][0]='random';
  assert.throws(()=>parseCurriculumSheet(wrong,'annual',2026),/편성표/);
});
