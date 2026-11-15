import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE_SCHOOL_ID,newExampleWorkspace,installExampleWorkspace} from '../lib/example-workspace.js';
import {operationalPlan} from '../lib/curriculum.js';
import {validateTimetableInput} from '../lib/timetable-solver.js';
test('real-school example is no longer included in default seed',()=>{
 assert.equal(EXAMPLE_SCHOOL_ID,'general-middle-2027-full');
 const db={schools:[{id:'songjeong-2026-example',name:'이전 예시'},{id:'owner',name:'사용자 작업공간'}],workspaces:{'songjeong-2026-example':{events:[{id:1}]},owner:{events:[{id:2}]}}};
 const next=installExampleWorkspace(db);
 assert.ok(!next.schools.some(s=>s.id==='songjeong-2026-example'));
 assert.ok(next.schools.some(s=>s.id==='general-middle-2027-full'));
 assert.deepEqual(next.workspaces.owner,db.workspaces.owner);
 assert.deepEqual(next.workspaces['songjeong-2026-example'],db.workspaces['songjeong-2026-example'],'orphan data preserved to recover user edits');
 assert.equal(installExampleWorkspace(next),next);
});
test('full synthetic 19-class middle-school timetable and quotas are loaded',()=>{
 const space=newExampleWorkspace(),p=space.academics['2027'];
 assert.equal(p.classes.length,19);assert.equal(space.staffMembers.length,34);
 assert.equal(Object.values(space.staffQuotas).reduce((a,b)=>a+b,0),34);
 assert.equal(p.timetableConfig.lessons.reduce((n,d)=>n+d.hours,0),627);
 assert.deepEqual(validateTimetableInput(p,p.timetableConfig).errors,[]);
 assert.equal(space.exampleMeta.dataIsSample,true);assert.equal(space.enabled.calendar,true);
});
test('generic 2027 curriculum is complete for three cohorts',()=>{
 const space=newExampleWorkspace(),operation=operationalPlan(space.curricula,2027);
 assert.equal(operation.complete,true);assert.equal(operation.total,3366);
 assert.deepEqual(operation.grades.flatMap(g=>g.semesters.map(t=>t.totals.total)),Array(6).fill(561));
});
test('mutating generic demo does not change next new instance',()=>{
 const a=newExampleWorkspace();a.events.pop();a.staffMembers[0].name='변경';
 const b=newExampleWorkspace();assert.notEqual(a.events.length,b.events.length);
 assert.notEqual(b.staffMembers[0].name,'변경');
});
