import test from 'node:test';
import assert from 'node:assert/strict';
import {newExampleWorkspace} from '../lib/example-workspace.js';
import {buildTeacherHoursGrid,matrixKey,applyTeacherHoursEdits} from '../lib/teacher-hours-grid.js';
import {validateTimetableInput,timetableConfig} from '../lib/timetable-solver.js';

const setup=()=>{const s=newExampleWorkspace(),p=s.academics['2027'];return {s,p,lessons:p.timetableConfig.lessons};};

test('19-class matrix mirrors all 627 hours, preserving teacher and subject identities',()=>{
  const {s,p,lessons}=setup();const m=buildTeacherHoursGrid(p,lessons,s.staffMembers);
  assert.equal(p.teachers.length,34);assert.equal(m.classes.length,19);assert.equal(m.hidden,0);
  assert.equal(m.rows.length,90);
  assert.deepEqual([...new Set(m.classes.map(c=>c.grade))],[1,2,3]);
  assert(m.classes.every(c=>m.totalsByClass[c.id]===33));
  assert.equal(m.rows.reduce((n,r)=>n+m.classes.reduce((k,c)=>k+(m.cellOf(r,c)?.hours||0),0),0),627);
});

test('complex split lab cells show totals but cannot be flattened by grid editing',()=>{
  const {p,lessons,s}=setup();const m=buildTeacherHoursGrid(p,lessons,s.staffMembers);
  const row=m.rows.find(r=>r.teacherId==='staff-과학-1');const klass=p.classes.find(c=>c.id==='g1c1');
  assert(row);const entry=m.cellOf(row,klass);assert.equal(entry.records.length,2);
  assert.equal(entry.hours,4);
  const value=applyTeacherHoursEdits(p,lessons,{[matrixKey(row.teacherId,row.subjectId,klass.id)]:'3'});
  assert.equal(value.ok,false);assert.strictEqual(value.lessons,lessons);
  assert.deepEqual(lessons.filter(l=>l.teacherId===row.teacherId&&l.scopeId===klass.id&&l.subjectId===row.subjectId),entry.records);
});

test('single-row updates keep row id and all advanced constraints',()=>{
  const {p,lessons}=setup(),entry=lessons.find(l=>l.scope==='class'&&l.hours===4&&l.block===1&&!l.room&&!l.syncKey);
  assert(entry);const key=matrixKey(entry.teacherId,entry.subjectId,entry.scopeId);
  const result=applyTeacherHoursEdits(p,lessons,{[key]:'3'});
  assert.equal(result.ok,true);assert.equal(result.changes.length,1);
  assert.equal(result.lessons.find(l=>l.id===entry.id).hours,3);
  assert.equal(lessons.find(l=>l.id===entry.id).hours,4);
  assert.equal(result.lessons.length,lessons.length);
  assert.equal(result.lessons.find(l=>l.id===entry.id).subjectId,entry.subjectId);
});

test('blank and zero remove only simple lessons; new matrix cells create matching demand',()=>{
  const {p,lessons}=setup(),entry=lessons.find(l=>l.scope==='class'&&l.hours===4&&l.block===1&&!l.room&&!l.syncKey);
  const key=matrixKey(entry.teacherId,entry.subjectId,entry.scopeId);
  const removed=applyTeacherHoursEdits(p,lessons,{[key]:''});
  assert.equal(removed.ok,true);assert(!removed.lessons.some(l=>l.id===entry.id));
  const added=applyTeacherHoursEdits(p,removed.lessons,{[key]:'4'});
  assert.equal(added.ok,true);assert.equal(added.lessons.length,lessons.length);
  assert.equal(added.lessons.find(l=>l.scopeId===entry.scopeId&&l.teacherId===entry.teacherId&&l.subjectId===entry.subjectId)?.hours,4);
});

test('empty matrix cannot erase specially configured lessons',()=>{
  const {p,lessons}=setup();const entry=lessons.find(l=>l.room&&l.block>1);
  assert(entry);const result=applyTeacherHoursEdits(p,lessons,{[matrixKey(entry.teacherId,entry.subjectId,entry.scopeId)]:'0'});
  assert.equal(result.ok,false);assert.strictEqual(result.lessons,lessons);
});

test('mixed invalid and valid batch is atomic',()=>{
  const {p,lessons}=setup();const entry=lessons.find(l=>l.block===1&&!l.room);
  const key=matrixKey(entry.teacherId,entry.subjectId,entry.scopeId);
  const err=applyTeacherHoursEdits(p,lessons,{[key]:'9',[matrixKey('unknown','none','g1c1')]:'5'});
  assert.equal(err.ok,false);assert.strictEqual(err.lessons,lessons);assert.equal(err.changes.length,0);
});

test('grid data with no changes keeps exact lesson array and timetable plan',()=>{
  const {p,lessons}=setup();const result=applyTeacherHoursEdits(p,lessons,{});
  assert.equal(result.ok,true);assert.equal(result.changes.length,0);
  assert.deepEqual(result.lessons,lessons);
  assert.equal(validateTimetableInput(p,timetableConfig(p)).errors.length,0);
});
