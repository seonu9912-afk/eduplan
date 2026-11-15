import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE_SCHOOL_ID,newExampleWorkspace,withDemoTeacherNames,installExampleWorkspace} from '../lib/example-workspace.js';

const getPlan=space=>space.academics['2027'];
test('synthetic teacher roster has 34 distinct readable names, stable IDs and intact lessons',()=>{
  const space=newExampleWorkspace();
  assert.equal(space.staffMembers.length,34);
  assert.equal(getPlan(space).teachers.length,34);
  assert.equal(new Set(space.staffMembers.map(p=>p.name)).size,34);
  assert(space.staffMembers.every(p=>!/교사\s+\d+$/.test(p.name)));
  assert.equal(getPlan(space).weekly.length,627);
  assert.equal(getPlan(space).timetableConfig.lessons.length,336);
  const ids=new Set(space.staffMembers.map(p=>p.id));
  assert(getPlan(space).teachers.every(t=>ids.has(t.id)&&t.label===space.staffMembers.find(s=>s.id===t.id).name));
  assert(getPlan(space).timetableConfig.lessons.every(row=>ids.has(row.teacherId)));
});

test('upgrades placeholder labels only, without overwriting edits or unrelated workspaces',()=>{
  const space=newExampleWorkspace();
  const untouched={...space,exampleMeta:{dataIsSample:false}};
  assert.strictEqual(withDemoTeacherNames(untouched),untouched);
  const original=structuredClone(space);
  original.staffMembers[0].name='국어교사 1';
  original.staffMembers[1].name='사용자가 바꾼 이름';
  original.academics['2027'].teachers[0].label='국어교사 1';
  original.academics['2027'].teachers[1].label='사용자가 바꾼 이름';
  const updated=withDemoTeacherNames(original);
  assert.equal(updated.staffMembers[0].name,space.staffMembers[0].name);
  assert.equal(updated.staffMembers[1].name,'사용자가 바꾼 이름');
  assert.equal(updated.academics['2027'].teachers[0].label,space.academics['2027'].teachers[0].label);
  assert.equal(updated.academics['2027'].teachers[1].label,'사용자가 바꾼 이름');
  assert.deepEqual(updated.academics['2027'].weekly,original.academics['2027'].weekly);
  assert.deepEqual(updated.academics['2027'].timetableConfig.lessons,original.academics['2027'].timetableConfig.lessons);
});

test('reopening existing demo preserves all other workspaces and migrates placeholder display names',()=>{
  const space=newExampleWorkspace();
  space.staffMembers[0].name='국어교사 1';
  space.academics['2027'].teachers[0].label='국어교사 1';
  const other={events:[],exampleMeta:{dataIsSample:false}};
  const db={schools:[{id:EXAMPLE_SCHOOL_ID,name:'가상 일반중학교'}, {id:'my-school',name:'우리학교'}],workspaces:{[EXAMPLE_SCHOOL_ID]:space,'my-school':other},exampleWorkspaceVersion:3};
  const result=installExampleWorkspace(db);
  assert.equal(result.exampleWorkspaceVersion,4);
  assert.strictEqual(result.workspaces['my-school'],other);
  assert.notEqual(result.workspaces[EXAMPLE_SCHOOL_ID].staffMembers[0].name,'국어교사 1');
  assert.strictEqual(installExampleWorkspace(result),result);
});
