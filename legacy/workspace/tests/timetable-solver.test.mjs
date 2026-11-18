import test from 'node:test';
import assert from 'node:assert/strict';
import {checkScheduledSlots,solveTimetable,validateTimetableInput,extractDemands,buildTimetableTasks,timetableConfig} from '../lib/timetable-solver.js';
import {createAcademic,planForDate,plusDays} from '../lib/academic.js';
const base=()=>{const p=createAcademic(2027);p.classes=p.classes.slice(0,2);p.subjects=p.subjects.slice(0,3);p.teachers=[{id:'t1',label:'교사A'},{id:'t2',label:'교사B'}];p.weekly=[];p.rooms=['과학실'];return p;};
const lesson=(id,scopeId,subjectId,teacherId,hours,other={})=>({id,scope:'class',scopeId,subjectId,teacherId,hours,room:'',block:1,syncKey:'',fixedDay:0,fixedPeriod:0,...other});
test('automatic solver respects teacher unavailability and class/teacher/room collisions',()=>{
 const p=base();const [a,b]=p.classes;
 const cfg=timetableConfig(p);cfg.periods={1:4,2:4,3:4,4:4,5:4};
 cfg.lessons=[lesson('a',a.id,'korean','t1',3,{room:'과학실',fixedDay:1,fixedPeriod:2}),lesson('b',b.id,'math','t2',3,{room:'과학실'}),lesson('c',b.id,'korean','t1',3)];
 cfg.unavailable=[{teacherId:'t1',weekday:4,period:4},{teacherId:'t2',weekday:2,period:3}];
 const out=solveTimetable(p,{config:cfg});
 assert.equal(out.ok,true,JSON.stringify(out.errors));assert.equal(out.slots.length,9);
 assert.equal(checkScheduledSlots(p,out.slots,cfg).length,0);
 assert.ok(out.slots.some(x=>x.scopeId===a.id&&x.subjectId==='korean'&&x.weekday===1&&x.period===2));
 assert.ok(!out.slots.some(x=>x.teacherId==='t1'&&x.weekday===4&&x.period===4));
 assert.equal(p.weekly.length,0,'solver must not mutate the original plan');
});
test('consecutive double lessons are contiguous and remain intact',()=>{
 const p=base(),cfg=timetableConfig(p);cfg.periods={1:4,2:4,3:4,4:4,5:4};
 cfg.lessons=[lesson('a',p.classes[0].id,'korean','t1',4,{block:2,room:'과학실'})];
 const out=solveTimetable(p,{config:cfg});assert.equal(out.ok,true,JSON.stringify(out.errors));
 const grouped=new Map();for(const s of out.slots){const key=s.id.split('-').slice(0,-1).join('-');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(s);}
 assert.equal(grouped.size,2);for(const group of grouped.values()){assert.equal(group.length,2);assert.equal(group[0].weekday,group[1].weekday);assert.equal(Math.abs(group[0].period-group[1].period),1);}
});
test('synchronized common hours share the same weekday and period',()=>{
 const p=base(),cfg=timetableConfig(p);cfg.periods={1:4,2:4,3:4,4:4,5:4};
 cfg.lessons=[lesson('a',p.classes[0].id,'korean','t1',2,{syncKey:'공통시간',fixedDay:5,fixedPeriod:2}),lesson('b',p.classes[1].id,'math','t2',2,{syncKey:'공통시간',fixedDay:5,fixedPeriod:2})];
 const out=solveTimetable(p,{config:cfg});assert.equal(out.ok,true,JSON.stringify(out.errors));
 const a=out.slots.filter(x=>x.scopeId===p.classes[0].id).map(x=>`${x.weekday}-${x.period}`).sort();
 const b=out.slots.filter(x=>x.scopeId===p.classes[1].id).map(x=>`${x.weekday}-${x.period}`).sort();
 assert.deepEqual(a,b);assert.ok(a.includes('5-2'));
});
test('reject a schedule when all teacher capacity is blocked',()=>{
 const p=base(),cfg=timetableConfig(p);cfg.periods={1:1,2:1,3:1,4:1,5:1};
 cfg.lessons=[lesson('a',p.classes[0].id,'korean','t1',4)];
 cfg.unavailable=[1,2,3,4].map(weekday=>({teacherId:'t1',weekday,period:1}));
 const out=solveTimetable(p,{config:cfg});assert.equal(out.ok,false);assert.match(out.errors.join(' '),/수업 가능/);
});
test('reject overlapping synchronized sessions that occupy the same class',()=>{
 const p=base(),cfg=timetableConfig(p);cfg.periods={1:1,2:1,3:1,4:1,5:1};
 cfg.lessons=[lesson('a',p.classes[0].id,'korean','t1',1,{syncKey:'공통'}),lesson('b',p.classes[0].id,'math','t2',1,{syncKey:'공통'})];
 const out=solveTimetable(p,{config:cfg});assert.equal(out.ok,false);
});
test('reject over-capacity class and mismatched synced load',()=>{
 const p=base(),cfg=timetableConfig(p);cfg.periods={1:2,2:2,3:2,4:2,5:2};
 cfg.lessons=[lesson('a',p.classes[0].id,'korean','t1',10),lesson('b',p.classes[0].id,'math','t2',2)];
 assert.match(validateTimetableInput(p,cfg).errors.join(' '),/초과/);
 cfg.lessons=[lesson('a',p.classes[0].id,'korean','t1',3,{syncKey:'함께'}),lesson('b',p.classes[1].id,'math','t2',2,{syncKey:'함께'})];
 assert.match(validateTimetableInput(p,cfg).errors.join(' '),/다릅니다/);
});
test('import existing weekly plan as lessons without modifying the source',()=>{
 const p=createAcademic(2027),len=p.weekly.length;
 const out=extractDemands(p);
 assert.ok(out.length>0);assert.equal(out.reduce((n,x)=>n+x.hours,0),len);assert.equal(p.weekly.length,len);
});
test('academic date-based planner uses applied weekly results and date overrides',()=>{
 const p=base(),cfg=timetableConfig(p);cfg.lessons=[lesson('a',p.classes[0].id,'korean','t1',2)];
 const out=solveTimetable(p,{config:cfg});assert.ok(out.ok);
 p.weekly=out.slots;
 const day=out.slots[0].weekday;
 let date='2027-03-01';while(new Date(date+'T12:00:00Z').getUTCDay()!==day)date=plusDays(date,1);
 const daily=planForDate(p,date,[]);assert.ok(daily.find(s=>s.scopeId===p.classes[0].id&&s.subjectId==='korean'));
 p.dayRules=[{date,kind:'vacation',label:'방학',weekdayOverride:0}];
 assert.ok(!planForDate(p,date,[]).some(s=>s.scopeId===p.classes[0].id));
});

test('weekday starts at 3rd period and never schedules Monday 1st or 2nd',()=>{
 const p=base(),cfg=timetableConfig(p);
 cfg.periods={1:7,2:7,3:7,4:7,5:7};
 cfg.starts={1:3,2:1,3:1,4:1,5:1};
 cfg.lessons=[
   lesson('fixed',p.classes[0].id,'korean','t1',1,{fixedDay:1,fixedPeriod:3}),
   lesson('other',p.classes[0].id,'math','t2',8)
 ];
 const result=solveTimetable(p,{config:cfg,maxNodes:30000,limitMs:4000});
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(checkScheduledSlots(p,result.slots,cfg).length,0);
 assert.ok(result.slots.some(row=>row.weekday===1&&row.period===3));
 assert.ok(result.slots.every(row=>row.weekday!==1||row.period>=3&&row.period<=7));
 assert.match(checkScheduledSlots(p,[{...result.slots[0],weekday:1,period:2}],cfg).join(' '),/운영 교시 범위 밖/);
 const old=timetableConfig({timetableConfig:{periods:{1:7,2:7,3:7,4:7,5:7}}});
 assert.equal(old.starts[1],1);
});
test('weekly capacity counts inclusive start~end ranges',()=>{
 const p=base(),cfg=timetableConfig(p);
 cfg.starts={1:3,2:3,3:3,4:3,5:3};
 cfg.periods={1:7,2:7,3:7,4:7,5:7};
 cfg.lessons=[lesson('capacity',p.classes[0].id,'korean','t1',26)];
 const check=validateTimetableInput(p,cfg);
 assert.equal(check.available,25);
 assert.match(check.errors.join(' '),/초과/);
});
test('invalid operating ranges and fixed lessons outside them fail validation',()=>{
 const p=base(),cfg=timetableConfig(p);
 cfg.periods={1:7,2:7,3:7,4:7,5:7};
 cfg.starts={1:3,2:1,3:1,4:1,5:1};
 cfg.lessons=[lesson('fixed',p.classes[0].id,'korean','t1',1,{fixedDay:1,fixedPeriod:2})];
 assert.match(validateTimetableInput(p,cfg).errors.join(' '),/고정 교시.*범위/);
 cfg.lessons=[lesson('fixed',p.classes[0].id,'korean','t1',1)];
 cfg.starts[1]=8;
 assert.match(validateTimetableInput(p,cfg).errors.join(' '),/시작.*종료/);
});
