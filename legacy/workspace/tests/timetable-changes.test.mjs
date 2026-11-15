import test from 'node:test';import assert from 'node:assert/strict';
import {createAcademic} from '../lib/academic.js';
import {proposeSwap,proposeMakeup} from '../lib/timetable-changes.js';
const model=()=>{const p=createAcademic(2027);p.weekly=[];p.classes=p.classes.slice(0,2);p.teachers=[{id:'t1',label:'A'},{id:'t2',label:'B'}];p.weekly=[{id:'a',scope:'class',scopeId:p.classes[0].id,weekday:1,period:1,subjectId:'korean',teacherId:'t1',room:''},{id:'b',scope:'class',scopeId:p.classes[0].id,weekday:2,period:2,subjectId:'math',teacherId:'t2',room:''}];return p;};
test('swap two lessons on different dates while preserving the recurring template',()=>{
 const p=model(),before=JSON.stringify(p.weekly);
 const x=proposeSwap(p,[],{classId:p.classes[0].id,firstDate:'2027-03-01',firstPeriod:1,secondDate:'2027-03-02',secondPeriod:2});
 assert.equal(x.ok,true,JSON.stringify(x.errors));assert.equal(x.changes.length,2);assert.equal(JSON.stringify(p.weekly),before);
 assert.equal(x.changes[0].subjectId,'math');assert.equal(x.changes[1].subjectId,'korean');
});
test('swap blocked by another teacher lesson in target period',()=>{
 const p=model();p.weekly.push({id:'third',scope:'class',scopeId:p.classes[1].id,weekday:1,period:1,subjectId:'social',teacherId:'t2',room:''});
 const x=proposeSwap(p,[],{classId:p.classes[0].id,firstDate:'2027-03-01',firstPeriod:1,secondDate:'2027-03-02',secondPeriod:2});
 assert.equal(x.ok,false);assert.match(x.errors.join(','),/교사/);
});
test('makeup only allowed in a free class period and on an instructional date',()=>{
 const p=model();
 const ok=proposeMakeup(p,[],{classId:p.classes[0].id,date:'2027-03-01',period:3,subjectId:'korean',teacherId:'t1'});
 assert.equal(ok.ok,true,JSON.stringify(ok.errors));
 const occupied=proposeMakeup(p,[],{classId:p.classes[0].id,date:'2027-03-01',period:1,subjectId:'korean',teacherId:'t1'});
 assert.equal(occupied.ok,false);
 p.dayRules=[{date:'2027-03-01',kind:'vacation',label:'방학'}];
 assert.equal(proposeMakeup(p,[],{classId:p.classes[0].id,date:'2027-03-01',period:3,subjectId:'korean'}).ok,false);
});
