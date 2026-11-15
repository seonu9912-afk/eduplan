import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAcademic,planForDate} from '../lib/academic.js';
import {v12Day,v12Days,v12TermForDate,v12EligibleRecurringDates,v12RecurringDates,v12ActualHours,v12RecurringHours,v12Audit,v12AnnualSummary,v12ImpactPreview} from '../lib/v12-calendar-bridge.js';
import {buildV12ExportSheets} from '../lib/v12-calendar-exports.js';
import {createAcademicXlsx} from '../lib/v12-xlsx.js';
const y=2027;
function plan(){return {...createAcademic(y),weekly:[],dayRules:[],v12Recurring:[]};}
const getSample=()=>{const db=JSON.parse(fs.readFileSync(new URL('../data/general-middle-2027-full.json',import.meta.url),'utf8'));return Object.values(db.workspaces)[0];};
test('v12 day mapping correctly handles weekend, discretionary, holiday, vacation and swapped weekday',()=>{
 const p=plan();p.dayRules=[{date:'2027-03-06',kind:'instruction',source:'manual',weekdayOverride:1,label:'토요일 수업'},
  {date:'2027-03-08',kind:'closed',label:'재량휴업일'},
  {date:'2027-03-09',kind:'holiday',label:'공휴일'},
  {date:'2027-07-26',kind:'vacation',label:'여름방학'}];
 assert.equal(v12Day(p,'2027-03-07').유형,'weekend');
 assert.equal(v12Day(p,'2027-03-06').유형,'swap');
 assert.equal(v12Day(p,'2027-03-06').적용요일,'월');
 assert.equal(v12Day(p,'2027-03-08').유형,'discretionary');
 assert.equal(v12Day(p,'2027-03-09').유형,'holiday');
 assert.equal(v12Day(p,'2027-07-26').유형,'vacation');
});
test('v12 academic year includes March through February, including leap day when present',()=>{
 let d=v12Days(plan());assert.equal(d[0].날짜,'2027-03-01');assert.equal(d.at(-1).날짜,'2028-02-29');assert.equal(d.length,366);
});
test('v12 summer vacation controls second semester boundary, no compulsory user target',()=>{
 const p=plan();p.dayRules=[{date:'2027-08-10',kind:'vacation',label:'여름방학'},{date:'2027-08-11',kind:'vacation',label:'여름방학'}];
 assert.equal(v12TermForDate(p,'2027-08-11'),1);assert.equal(v12TermForDate(p,'2027-08-12'),2);
 assert.equal(v12AnnualSummary(p).total>0,true);
});
test('recurring hours exclude dates and keep totals separate from actual hours',()=>{
 const p=plan();p.weekly=[{id:'monday',scope:'class',scopeId:'g1c1',weekday:1,period:1,subjectId:'korean'}];
 p.dayRules=[{date:'2027-03-08',kind:'closed',label:'재량휴업일'}];
 p.v12Recurring=[{활동ID:'rec1',학년:1,학기:1,요일:'월',시작교시:1,종료교시:2,영역:'자율',활동명:'자치',제외일목록:'2027-03-15',사용:true}];
 const recurring=v12RecurringHours(p)['1-1'];
 assert.ok(recurring.total>0);assert.equal(recurring.total%2,0);
 assert.equal(recurring.areas.자율,recurring.total);
 assert.notEqual(v12ActualHours(p,[])['1-1'].창체,recurring.total);
 const all=v12Days(p).filter(d=>d.학기===1&&(d.유형==='instructional'||d.유형==='swap')&&(d.적용요일||d.요일)==='월');
 assert.equal(recurring.total,(all.length-1)*2);
});
test('mixed grade areas change only the targeted grade class slots',()=>{
 const p=plan();p.classes=[{id:'a',grade:1},{id:'b',grade:2},{id:'c',grade:3}];
 p.subjects=[{id:'base',kind:'subject'},{id:'club',kind:'creative_club'},{id:'career',kind:'creative_career'}];
 p.weekly=p.classes.map(c=>({id:c.id,scope:'class',scopeId:c.id,weekday:2,period:1,subjectId:'base'}));
 const e={id:'event',date:'2027-03-02',name:'학년별 행사',affectsTimetable:true,periodStart:1,periodEnd:1,grades:[1,2,3],gradeAreas:{1:'동아리',2:'진로',3:'교과'}};
 const got=Object.fromEntries(planForDate(p,e.date,[e]).map(s=>[s.scopeId,s.subjectId]));
 assert.deepEqual(got,{c:'base',a:'club',b:'career'});
 const actual=v12ActualHours(p,[e]);assert.equal(actual['1-1'].동아리,1);assert.equal(actual['1-2'].진로,1);assert.equal(actual['1-3'].교과>0,true);
});
test('audit catches overlapping events per grade and time',()=>{
 const p=plan(),events=[1,2].map(i=>({id:`e${i}`,date:'2027-03-02',name:`행사${i}`,affectsTimetable:true,periodStart:1,periodEnd:2,gradeAreas:{1:'자율',2:'없음',3:'없음'}}));
 assert.ok(v12Audit(p,events).some(x=>x.severity==='error'&&x.text.includes('중복')));
});
test('batch preview never mutates source plan',()=>{
 const p=plan(),before=JSON.stringify(p);
 const x=v12ImpactPreview(p,'2027-08-02','2027-08-06','vacation');
 assert.equal(x.before,5);assert.equal(x.after,0);assert.deepEqual(x.dates.length,5);assert.equal(JSON.stringify(p),before);
});
test('19-class demo existing timetable and event values stay unchanged after v12 reporting',()=>{
 const space=getSample(),p=space.academics['2027'];const baseline=JSON.stringify(space);
 const sheets=buildV12ExportSheets(p,space.events,'가상중학교','weeklyHours');
 assert.equal(p.classes.length,19);assert.equal(p.weekly.length,627);
 assert.equal(sheets.length,2);assert.ok(sheets.every(s=>s.rows.length>2));
 assert.equal(JSON.stringify(space),baseline);
});
test('4 v12 workbook output types construct an Office Open XML ZIP Blob',async()=>{
 const s=getSample();for(const type of ['events','weeklyHours','creative','calendar']){
  const sheets=buildV12ExportSheets(s.academics['2027'],s.events,'가상중학교',type);
  assert.equal(sheets.length,{events:1,weeklyHours:2,creative:6,calendar:12}[type]);
  const blob=createAcademicXlsx(sheets);const ab=await blob.arrayBuffer(),data=new Uint8Array(ab);
  assert.ok(blob.size>1000);assert.equal(data[0],80);assert.equal(data[1],75);
 }
});

test('recurring exclusion selector offers eligible dates and excludes saved selections without modifying source',()=>{
 const p=plan();const row={학년:1,학기:1,요일:'월',시작교시:1,종료교시:1,영역:'자율',제외일목록:'2027-03-15'};
 p.dayRules=[{date:'2027-03-08',kind:'closed',label:'재량휴업일'}];
 const before=JSON.stringify(p);const options=v12EligibleRecurringDates(p,row);
 assert.ok(options.includes('2027-03-15'));
 assert.ok(!options.includes('2027-03-08'));
 assert.ok(!v12RecurringDates(p,row).includes('2027-03-15'));
 assert.equal(v12RecurringDates(p,row).length,options.length-1);
 assert.equal(JSON.stringify(p),before);
});
test('weekly workbook faithfully outputs 32-column two-row headers, merged groups and totals',()=>{
 const space=getSample(),p=space.academics['2027'],s=buildV12ExportSheets(p,space.events,'가상중학교','weeklyHours')[0];
 assert.equal(s.rows[2].length,32);assert.equal(s.rows[3].length,32);
 assert.equal(s.rows.at(-1).length,32);
 assert.equal(s.headerStartRow,3);assert.equal(s.headerRows,4);
 assert.equal(s.freezeCols,2);assert.equal(s.merges.length,9);
 assert.equal(s.rows.at(-1)[0],'합계');
});
test('creative workbook includes individual recurring eligible dates, skips exclusions and adds area totals',()=>{
 const p=plan();const row={활동ID:'rec1',학년:1,학기:1,요일:'월',시작교시:1,종료교시:2,영역:'자율',활동명:'자치회',담당부서:'학생부',제외일목록:'2027-03-15',사용:true,창체표포함:true};
 p.v12Recurring=[row];
 const sheet=buildV12ExportSheets(p,[],'학교','creative')[0];
 assert.equal(sheet.rows[2].length,10);
 assert.equal(sheet.rows.at(-1)[6],v12RecurringHours(p)['1-1'].total);
 assert.ok(!sheet.rows.some(r=>r[0]==='3/15'));
 assert.ok(sheet.rows.some(r=>r[0]==='3/22'));
});
test('calendar workbook has fixed six-week grid and three-row heading like legacy',()=>{
 const s=buildV12ExportSheets(plan(),[],'학교','calendar');
 assert.equal(s.length,12);
 assert.ok(s.every(x=>x.rows.length===9&&x.rows[2].length===7));
 assert.ok(s.every(x=>x.merges[0].to[1]===7));
});
