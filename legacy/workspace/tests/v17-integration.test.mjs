import test from 'node:test';
import assert from 'node:assert/strict';
import {newExampleWorkspace} from '../lib/example-workspace.js';
import {auditWorkspace} from '../lib/integrated-audit.js';
import {previewEventImpact} from '../lib/event-impact.js';
import {lessonsToTsv,parseLessonTsv,mergeLessonRows} from '../lib/lesson-table.js';

const fixture=()=>newExampleWorkspace();
test('19학급 통합 실증 자료에서는 수업 배정과 실제 시간표의 627교시가 모두 일치한다',()=>{
  const view=auditWorkspace(fixture(),2027);
  assert.equal(view.sections.timetable.placed,627);
  assert.equal(view.sections.timetable.requested,627);
  assert.equal(view.sections.timetable.missing,0);
  assert.equal(view.sections.timetable.extra,0);
  assert.equal(view.summary.errors,0);
});
test('주간 시간표를 지우면 미배정 시수를 경고한다',()=>{
  const s=fixture();s.academics['2027'].weekly=[];
  const result=auditWorkspace(s,2027);
  assert.equal(result.sections.timetable.missing,627);
  assert(result.issues.some(x=>x.route==='timetable'&&x.level==='error'));
});
test('수업 배정표 336행 엑셀형 왕복에서 교사·학급·연속수업 정보가 보존된다',()=>{
  const s=fixture(),p=s.academics['2027'];const rows=p.timetableConfig.lessons;
  const tsv=lessonsToTsv(p,rows);const parsed=parseLessonTsv(tsv,p,rows);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows.length,rows.length);
  for(const [i,d] of rows.entries())assert.deepEqual(parsed.rows[i],d);
});
test('수업 배정표를 일부만 수정하면 수정한 ID만 교체되고 나머지는 유지된다',()=>{
  const p=fixture().academics['2027'],rows=p.timetableConfig.lessons;
  const copy=lessonsToTsv(p,[rows[0]]).replace(String(rows[0].hours),String(Number(rows[0].hours)+1));
  const changed=parseLessonTsv(copy,p,rows);
  assert.equal(changed.errors.length,0);
  const merged=mergeLessonRows(rows,changed.rows,'update');
  assert.equal(merged.length,rows.length);
  assert.equal(merged.find(x=>x.id===rows[0].id).hours,Number(rows[0].hours)+1);
});
test('잘못된 교사 이름 및 고정요일은 일괄입력에서 거절하고 아무 행도 반영하지 않는다',()=>{
  const p=fixture().academics['2027'];
  const text=lessonsToTsv(p,[p.timetableConfig.lessons[0]]);
  assert(parseLessonTsv(text.replace(/\t\d+\t/,'\t77\t'),p).errors.length>0);
  const values=text.split('\n');const cols=values[1].split('\t');cols[3]='존재하지 않는 교사';cols[8]='일';values[1]=cols.join('\t');
  const parsed=parseLessonTsv(values.join('\n'),p);
  assert.equal(parsed.rows.length,0);
  assert(parsed.errors.some(x=>x.includes('교사')));
  assert(parsed.errors.some(x=>x.includes('고정요일')));
});
test('학사행사 수정 전후 변경 영향은 현재 날짜 시간표를 변경하지 않고 비교한다',()=>{
  const s=fixture(),p=s.academics['2027'];
  const before=JSON.stringify(p.weekly);
  const event=s.events.find(e=>e.name==='체육대회');
  const result=previewEventImpact(p,s.events,{...event,date:'2027-05-21'});
  assert.equal(result.available,true);
  assert(result.dates>=2);
  assert(result.overlapCount>0);
  assert(result.changes.length>0);
  assert.equal(JSON.stringify(p.weekly),before);
});
test('학사일정이 없는 학교는 통합점검에서 준비 중으로 안내한다',()=>{
  const s=fixture();delete s.academics['2027'];
  const data=auditWorkspace(s,2027);
  assert(data.issues.some(x=>x.area==='calendar'&&x.level==='warning'));
});
