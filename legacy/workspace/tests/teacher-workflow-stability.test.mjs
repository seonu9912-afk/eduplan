import test from 'node:test';
import assert from 'node:assert/strict';
import {newExampleWorkspace,EXAMPLE_SCHOOL_ID} from '../lib/example-workspace.js';
import {scheduleRows,planningSettings} from '../lib/planning.js';
import {academicYearOfDate,preferredDateForWorkspace,countPastedRows,bulkHasIncompleteRows} from '../lib/navigation-state.js';
import {makeBackup,parseBackup} from '../lib/workspace.js';

test('workspaces open the right academic context and keep today for ordinary schools',()=>{
 assert.equal(academicYearOfDate('2028-01-07'),2027);
 assert.equal(academicYearOfDate('2027-09-01'),2027);
 assert.equal(academicYearOfDate('2026-11-12'),2026);
 assert.equal(academicYearOfDate('2027-13-01'),null);
 assert.equal(preferredDateForWorkspace(EXAMPLE_SCHOOL_ID,EXAMPLE_SCHOOL_ID,'2026-11-12'),'2027-03-08');
 assert.equal(preferredDateForWorkspace('my-school',EXAMPLE_SCHOOL_ID,'2026-11-12'),'2026-11-12');
});

test('an overnight field trip is shown once per date in both monthly and weekly office plans, without changing the academic source',()=>{
 const space=newExampleWorkspace(),data={id:'test-3day-trip',name:'수학여행',date:'2027-06-16',endDate:'2027-06-18',grades:[2],department:'2학년부'};
 const updated={...space,events:[...space.events,data]};
 const original=JSON.stringify(data);
 const month=scheduleRows(updated,'2027-06-01','2027-06-30',planningSettings(updated),'month');
 const rows=month.filter(x=>x.refId===data.id);
 assert.deepEqual(rows.map(x=>x.date),['2027-06-16','2027-06-17','2027-06-18']);
 assert.ok(rows.every(x=>x.editable===false));
 assert.ok(rows.every(x=>x.target==='2학년'));
 assert.deepEqual(scheduleRows(updated,'2027-06-17','2027-06-18',planningSettings(updated),'week').filter(x=>x.refId===data.id).map(x=>x.date),['2027-06-17','2027-06-18']);
 assert.equal(JSON.stringify(data),original);
});

test('a school trip crossing month and February boundary is visible each actual day',()=>{
 const trip={id:'cross-month',date:'2028-01-31',endDate:'2028-02-02',name:'연속 체험학습',department:'연구부'};
 const space={events:[trip]};
 assert.deepEqual(scheduleRows(space,'2028-02-01','2028-02-29',planningSettings(space),'month').map(x=>x.date),['2028-02-01','2028-02-02']);
 assert.deepEqual(scheduleRows(space,'2028-01-30','2028-01-31',planningSettings(space),'week').map(x=>x.date),['2028-01-31']);
});

test('bulk input disallows a blank title when the teacher has filled other fields, and detects 300-row truncation risk',()=>{
 assert.equal(bulkHasIncompleteRows([{date:'2027-03-02',department:'교무부',title:'',place:'시청'}]),0);
 assert.equal(bulkHasIncompleteRows([{date:'2027-03-02',department:'교무부',title:''}]),-1);
 assert.equal(countPastedRows(Array.from({length:301},(_,i)=>`2027-03-02\t교무부\t행사 ${i}`).join('\n')),301);
 assert.equal(countPastedRows('한 줄\n\n두 줄\r\n'),2);
});

test('19-class demonstration survives changes in office plan indexes and backup roundtrip',()=>{
 const ws=newExampleWorkspace(),db={schools:[{id:EXAMPLE_SCHOOL_ID,name:'가상 일반중학교',type:'중학교'}],workspaces:{[EXAMPLE_SCHOOL_ID]:ws}};
 const before=ws.academics['2027'].weekly.length;
 const clone=parseBackup(makeBackup(db),{enabled:{}}).workspaces[EXAMPLE_SCHOOL_ID];
 assert.equal(before,627);
 assert.equal(clone.academics['2027'].weekly.length,before);
 assert.equal(scheduleRows(clone,'2027-05-01','2027-05-31',planningSettings(clone),'month').some(x=>x.title==='체육대회'),true);
 assert.equal(clone.planEntries.length,ws.planEntries.length);
});
