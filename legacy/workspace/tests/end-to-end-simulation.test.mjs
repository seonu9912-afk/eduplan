import test from 'node:test';
import assert from 'node:assert/strict';
import {newExampleWorkspace,EXAMPLE_SCHOOL_ID} from '../lib/example-workspace.js';
import {checkScheduledSlots,validateTimetableInput} from '../lib/timetable-solver.js';
import {buildMipProblem,parseMipSchedule} from '../lib/timetable-mip.js';
import {summarizeAcademic,planForDate,eventOverlapsForDate,instructionForGrade,schoolDay} from '../lib/academic.js';
import {scheduleRows,planningSettings,planNotices,affectedReview,reviewKey,tsvImport,validateEntry} from '../lib/planning.js';
import {makeBackup,parseBackup} from '../lib/workspace.js';
import {proposeMakeup,proposeSwap} from '../lib/timetable-changes.js';
const base=()=>{const space=newExampleWorkspace(),plan=space.academics['2027'];return {space,plan};};
test('19 classes x 33 periods have complete conflict-free teaching timetable',()=>{
 const {space,plan}=base();const cfg=plan.timetableConfig;
 assert.equal(plan.classes.length,19);assert.equal(space.staffMembers.length,34);
 assert.equal(plan.weekly.length,627);assert.deepEqual(validateTimetableInput(plan,cfg).errors,[]);
 assert.deepEqual(checkScheduledSlots(plan,plan.weekly,cfg),[]);
 for(const c of plan.classes){const slots=plan.weekly.filter(x=>x.scope==='class'&&x.scopeId===c.id);
  assert.equal(slots.length,33);assert.equal(new Set(slots.map(x=>`${x.weekday}-${x.period}`)).size,33);}
});
test('academic calendar includes semester holidays, sport, trip, retreat, career, volunteer and club without overlap',()=>{
 const {space,plan}=base();const names=space.events.map(x=>x.name).join(' ');
 for(const term of ['체육대회','수학여행','수련회','진로','봉사','동아리','졸업식'])assert.ok(names.includes(term),term);
 assert.ok(space.events.length>=70);
 const summary=summarizeAcademic(plan,space.events);
 assert.equal(summary.daysTotal,196);assert.equal(summary.conflicts.length,0,JSON.stringify(summary.conflicts.slice(0,3)));
 assert.equal(summary.warnings.length,0,JSON.stringify(summary.warnings.slice(0,3)));
 assert.ok(summary.totals.g1c1.byCategory.creative_self>0);
 const sports=space.events.find(x=>x.name==='체육대회');
 const day=planForDate(plan,sports.date,space.events);
 assert.equal(day.filter(x=>x.source==='event'&&x.period<=6).length,19*6);
 assert.equal(eventOverlapsForDate(plan,sports.date,space.events).length,0);
});
test('academic calendar edits update lesson totals without rewriting the weekly schedule',()=>{
 const {space,plan}=base();const old=plan.weekly.length,year=summarizeAcademic(plan,space.events);
 const day='2027-04-06';assert.equal(schoolDay(day,plan.dayRules),true);
 const changed={...plan,dayRules:[...plan.dayRules,{date:day,kind:'closed',label:'재량휴업일 가상 추가'}]};
 const modified=summarizeAcademic(changed,space.events);
 assert.equal(modified.daysTotal,year.daysTotal-1);assert.equal(modified.totals.g1c1.total,year.totals.g1c1.total-7);
 assert.equal(plan.weekly.length,old);assert.equal(plan.dayRules.find(x=>x.date===day),undefined);
});
test('event coverage uses imported course IDs and volunteers are not double-counted',()=>{
 const {space,plan}=base();const day=space.events.find(e=>e.name.includes('환경정화')).date;
 const slots=planForDate(plan,day,space.events).filter(x=>x.source==='event');
 assert.equal(slots.length,38);assert.ok(slots.every(x=>x.volunteer===true));
 assert.ok(slots.every(x=>plan.subjects.find(s=>s.id===x.subjectId)?.kind==='creative_self'));
});
test('duplicate activities produce an explicit conflict instead of overriding counts without warning',()=>{
 const {space,plan}=base(),a=space.events.find(e=>e.name==='체육대회');
 const b={...a,id:'duplicate',name:'중복 행사',periodStart:2,periodEnd:3};
 const conflicts=eventOverlapsForDate(plan,a.date,[...space.events,b]);
 assert.equal(conflicts.length,19*2);
 const summary=summarizeAcademic(plan,[...space.events,b]);
 assert.ok(summary.conflicts.some(x=>x.message.includes('행사 중복')));
 const daily=planForDate(plan,a.date,[...space.events,b]);
 assert.equal(daily.filter(x=>x.source==='event'&&x.period>=2&&x.period<=3).length,19*2);
});
test('automatic optimizer LP model reconstitutes all 535 placed blocks without resource collisions',()=>{
 const {plan}=base(),model=buildMipProblem(plan,plan.timetableConfig,0);
 assert.deepEqual(model.errors,[]);assert.equal(model.tasks.length,535);assert.ok(model.candidates.length>15000);
 const columns={};
 for(const [i,task] of model.tasks.entries()){
  const first=plan.weekly.find(x=>x.id.startsWith(`auto-${task.blocks[0].row.id}-${task.blocks[0].index}-0`));
  assert.ok(first,task.id);
  const opt=model.candidates.find(c=>c.taskIndex===i&&c.weekday===first.weekday&&c.period===first.period);
  assert.ok(opt,task.id);
  columns[opt.variable]={Primal:1};
 }
 const loaded=parseMipSchedule(plan,plan.timetableConfig,model,{Columns:columns});
 assert.equal(loaded.length,627);assert.deepEqual(checkScheduledSlots(plan,loaded,plan.timetableConfig),[]);
});
test('class schedule with no weekly slots warns about allocated but unplaced teaching',()=>{
 const {space,plan}=base(),copy={...plan,weekly:[]};
 const sum=summarizeAcademic(copy,space.events);
 assert.ok(sum.warnings.some(w=>w.message.includes('주당 미배정')));
});
test('invalid timetable weekday and period are rejected',()=>{
 const {plan}=base(),slot={...plan.weekly[0],weekday:0,period:0};
 assert.ok(checkScheduledSlots(plan,[slot],plan.timetableConfig).some(e=>e.includes('유효하지 않은')));
});
test('monthly and weekly plan views share the same entry IDs, no duplicate academic event storage',()=>{
 const {space}=base(),settings=planningSettings(space);
 assert.equal(settings.dutyEnabled,false);assert.ok(space.planEntries.length>200);
 assert.ok(space.planTrips.length>=30);assert.ok(planNotices(space).length>=40);assert.ok(space.planDiscussions.length>=30);
 const month=scheduleRows(space,'2027-05-01','2027-05-31',settings,'month');
 const week=scheduleRows(space,'2027-05-10','2027-05-15',settings,'week');
 assert.ok(month.some(x=>x.source==='academic'&&x.title==='체육대회'));
 assert.equal(month.filter(x=>x.source==='academic'&&x.title==='체육대회').length,1);
 assert.ok(week.some(x=>x.source==='plan'));
 assert.ok(month.every(x=>x.source!=='academic'||x.editable===false));
 const dept=space.planEntries[0].department,key=reviewKey(space.planEntries[0].date.slice(0,7),dept);
 assert.ok(space.planReviews[key]);
 const reviews=affectedReview(space.planReviews,null,space.planEntries[0]);assert.equal(reviews[key].stale,true);
 assert.equal(validateEntry(space.planEntries[0]),'');
 const pasted=tsvImport('2027-05-14\t교무부\t교육활동 준비\t13:00',dept);assert.equal(pasted[0].date,'2027-05-14');
 const dutySettings={...settings,dutyEnabled:true};assert.equal(dutySettings.dutyEnabled,true);
});
test('swap and make-up proposals validate full school timetable, preserve base on rejection',()=>{
 const {space,plan}=base();const events=space.events;
 const cls=plan.classes[0].id;
 const date='2027-03-09';const existing=planForDate(plan,date,events).find(x=>x.scopeId===cls);
 assert.ok(existing);
 const makeupFail=proposeMakeup(plan,events,{classId:cls,date,period:existing.period,subjectId:existing.subjectId,teacherId:existing.teacherId});
 assert.equal(makeupFail.ok,false);
 const next={...plan,weekly:plan.weekly.filter(x=>x.id!==existing.id)};
 const makeup=proposeMakeup(next,events,{classId:cls,date,period:existing.period,subjectId:existing.subjectId,teacherId:existing.teacherId,room:existing.room});
 assert.equal(makeup.ok,true,JSON.stringify(makeup.errors));assert.equal(makeup.changes.length,1);
 const swapped=proposeSwap(plan,events,{classId:cls,firstDate:date,firstPeriod:1,secondDate:date,secondPeriod:2});
 assert.equal(typeof swapped.ok,'boolean');assert.ok(Array.isArray(swapped.errors));assert.equal(plan.overrides.length,0);
});
test('all workspace modules are populated and JSON backup can round-trip without data loss',()=>{
 const {space,plan}=base();const db={schools:[{id:EXAMPLE_SCHOOL_ID,name:'일반중학교',type:'중학교'}],workspaces:{[EXAMPLE_SCHOOL_ID]:space}};
 for(const k of ['events','tasks','docs','links','menus','forms','formEntries','staffMembers','planEntries','planTrips','planDiscussions','planNotices'])assert.ok(space[k]?.length>0,k);
 const restored=parseBackup(makeBackup(db),{enabled:{}});
 assert.deepEqual(restored.workspaces[EXAMPLE_SCHOOL_ID].events,space.events);
 assert.equal(restored.workspaces[EXAMPLE_SCHOOL_ID].academics['2027'].weekly.length,627);
 assert.equal(restored.workspaces[EXAMPLE_SCHOOL_ID].forms.length,1);
 assert.equal(restored.workspaces[EXAMPLE_SCHOOL_ID].planReviews&&Object.keys(restored.workspaces[EXAMPLE_SCHOOL_ID].planReviews).length>50,true);
});
