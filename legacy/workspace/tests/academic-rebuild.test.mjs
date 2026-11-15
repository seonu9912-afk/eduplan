import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile} from 'node:fs/promises';
import {capacity,change,commit,dateGrid,evaluate,holidayChanges,need,periodPreview,project,readItem,status,term2} from '../lib/academic-rebuild.js';
import {exportSheets} from '../lib/academic-rebuild-export.js';
import {createAcademicXlsx} from '../lib/v12-xlsx.js';

const day='2027-03-05';
const actor={actor:'테스트',canEdit:true,at:'2027-03-03T00:00:00Z'};
const plan=()=>({classes:[{id:'a',grade:1,label:'1반'},{id:'b',grade:1,label:'2반'}],dayRules:[{date:'2027-03-01',kind:'holiday',source:'kasi'},{date:day,kind:'instruction',weekdayOverride:1,source:'manual'}],timetableConfig:{periods:{1:7,2:7,3:7,4:7,5:6}}});
const model=()=>project({academics:{2027:plan()}},2027);
const event=(id,value,classes={})=>({id,date:day,name:id,grades:[1],rebuild:{classIds:[],grades:{1:{[day]:{1:value}}},classes}});
const first=m=>evaluate(m).grades[0].classes[0].sums.annual;

test('31-day grid preserves February boundaries and leap day',()=>{
 const {rows}=dateGrid(2027);
 assert.equal(rows.length,31);assert.ok(rows.every(x=>x.length===12));
 assert.equal(rows[0][0],'2027-03-01');assert.equal(rows[28][11],'2028-02-29');
 assert.equal(dateGrid(2028).rows[28][11],null);
});
test('operating hours prioritize grade and date exception over swapped weekday',()=>{
 const m=model();assert.equal(capacity(m,day,1),7);
 m.plan.timetableConfig.gradePeriods={1:{1:5}};assert.equal(capacity(m,day,1),5);
 m.dayHours[day]={1:4};assert.equal(capacity(m,day,1),4);
 assert.equal(capacity(m,'2027-03-01',1),0);
});
test('subject total needs configuration but no timetable',()=>{
 assert.equal(first(model()).missing,0);assert.ok(first(model()).subject>1200);
 const m=project({},2027);assert.ok(first(m).missing>200);assert.equal(need(first(m),{subject:100}),null);
});
test('semester starts at first operating day after summer break',()=>{
 const m=model();m.plan.dayRules.push({date:'2027-08-20',kind:'vacation',label:'여름방학'},{date:'2027-08-23',kind:'closed'});
 assert.equal(term2(m),'2027-08-24');
});
test('range changes protect manual and official dates individually',()=>{
 const m=model();const changes=periodPreview(m,'2027-03-01',day,'vacation','방학',[day]);
 assert.equal(changes.length,5);assert.equal(changes[0].blocked,true);assert.equal(changes[4].blocked,false);
});
test('event periods replace base creative period while retaining weekly data',()=>{
 const m=model();m.plan.weekly=[{scope:'class',scopeId:'a',weekday:1,period:1,subjectId:'club'}];m.plan.subjects=[{id:'club',kind:'creative_club'}];
 const normal=first(m).creative;
 m.events=[event('수련회','creative_career',{a:{[day]:{1:'subject'}}})];
 const [a,b]=evaluate(m).grades[0].classes;
 assert.equal(a.sums.annual.creative,normal-1);assert.equal(b.sums.annual.byArea.creative_career,1);
 assert.deepEqual(m.plan.weekly,[{scope:'class',scopeId:'a',weekday:1,period:1,subjectId:'club'}]);
});
test('matching overlapping slots count once and conflicting slots are unresolved',()=>{
 const m=model();m.events=[event('a','creative_club'),event('b','creative_club')];
 assert.equal(first(m).creative,1);
 m.events[1]=event('b','creative_career');
 assert.equal(first(m).conflicts,1);assert.equal(need(first(m),{subject:100}),null);
});
test('capacity changes keep out-of-range records and exclude them from class hours',()=>{
 const m=model();m.dayHours[day]={1:0};m.events=[event('a','creative_club')];
 assert.equal(first(m).creative,0);
 assert.equal(m.events[0].rebuild.grades[1][day][1],'creative_club');
 assert.ok(evaluate(m).warnings.some(w=>w.type==='운영 교시 범위 밖 편성'));
});
test('conflicting and unauthorized saves fail without applying unrelated edits in the batch',()=>{
 const m=model(),a=change(m,'event:a',event('a','creative_club')),b=change(m,'event:b',event('b','creative_career'));
 assert.equal(commit(m,[a],{...actor,canEdit:false}).ok,false);
 const current=commit(m,[a],actor).model, stale=commit(current,[a,b],actor);
 assert.equal(stale.ok,false);assert.equal(stale.conflicts[0].saved.id,'a');assert.equal(current.events.length,1);
 assert.equal(commit(current,[b],actor).model.events.length,2);
});
test('history restoration keeps snapshot and logs a new revision',()=>{
 const m=model(),edit=change(m,'event:a',event('a','creative_club'));
 const c=commit(m,[edit],{...actor,confirmation:true}).model;
 assert.equal(status(c),'확정');
 const restored=commit(c,[change(c,'event:a',c.history[0].before)],{...actor,operation:'복원'}).model;
 assert.equal(restored.history.at(-1).operation,'복원');assert.equal(status(restored),'재확인 필요');
 assert.equal(restored.events.length,0);assert.equal(restored.snapshot.data.events.length,1);
});
test('holiday refresh preserves manual overrides, honors academic-year boundaries',()=>{
 const m=model(),rows=[{date:day,name:'공휴일'},{date:'2028-02-29',name:'테스트 공휴일'},{date:'2028-03-01',name:'다음 학년도'}];
 const n=commit(m,holidayChanges(m,rows,actor.at),actor).model;
 assert.equal(readItem(n,'day:'+day).rule.kind,'instruction');
 assert.equal(readItem(n,'day:2028-02-29').rule.kind,'holiday');
 assert.equal(readItem(n,'day:2028-03-01').rule,null);
});
test('existing 19-class fixture projects with class and event IDs intact',async()=>{
 const db=JSON.parse(await readFile(new URL('../data/general-middle-2027-full.json',import.meta.url)));
 const original=Object.values(db.workspaces)[0],copy=structuredClone(original);
 const m=project(original,2027);const r=evaluate(m);
 assert.equal(m.plan.classes.length,19);
 assert.equal(m.events.length,original.events.length);
 assert.equal(r.grades.flatMap(g=>g.classes).length,19);
 assert.ok(r.grades.some(g=>g.targets.annual?.subject>0));
 assert.deepEqual(original,copy);
});
test('three-sheet export includes one event row, details and A4 page break',async()=>{
 const m=model();m.events=[event('행사 A','creative_club')];
 const sheets=exportSheets(m,{paper:'A4'});
 assert.deepEqual(sheets.map(x=>x.name),['연간 학사력','행사 목록','시수 확보 현황']);
 assert.equal(sheets[0].rows.length,33);assert.equal(sheets[0].rows[1].length,13);
 assert.equal(sheets[1].rows.length,3);assert.match(sheets[1].rows[2][5],/1교시 동아리/);
 const raw=Buffer.from(await createAcademicXlsx(sheets).arrayBuffer());
 assert.ok(raw.includes('<colBreaks count="1"'));assert.ok(raw.includes('<autoFilter ref="A2:G3"'));
 if(process.env.ACADEMIC_EXPORT_TEST_PATH)await writeFile(process.env.ACADEMIC_EXPORT_TEST_PATH,raw);
});
