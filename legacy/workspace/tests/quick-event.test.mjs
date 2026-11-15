import {test} from 'node:test';
import assert from 'node:assert/strict';
import {QUICK_GRADES,gradesToChoice,choiceToGrades,academicMonthDate,monthIndexOf,moveAcademicMonth,moveCalendarDate,initialQuickEvent,changeQuickDate,quickEnterAction} from '../lib/quick-event.js';
import {validateEventRow,normalizeEventRow,monthGrid} from '../lib/calendar.js';
import {createAcademic,planForDate} from '../lib/academic.js';

test('academic months travel March through next February and stop at boundaries',()=>{
  assert.deepEqual(academicMonthDate(2026,0),{year:2026,month:3,key:'2026-03'});
  assert.deepEqual(academicMonthDate(2026,11),{year:2027,month:2,key:'2027-02'});
  assert.equal(monthIndexOf(2026,'2027-01-31'),10);
  assert.equal(moveAcademicMonth(2026,'2026-12-31',1),'2027-01-31');
  assert.equal(moveAcademicMonth(2026,'2027-01-31',1),'2027-02-28');
  assert.equal(moveAcademicMonth(2026,'2026-03-01',-1),null);
  assert.equal(moveAcademicMonth(2026,'2027-02-28',1),null);
});

test('arrow navigation crosses month and school-year boundaries correctly',()=>{
  assert.equal(moveCalendarDate(2026,'2026-04-30',1),'2026-05-01');
  assert.equal(moveCalendarDate(2026,'2027-02-28',1),null);
  assert.equal(moveCalendarDate(2026,'2026-03-01',-1),null);
  assert.equal(moveCalendarDate(2027,'2028-02-28',1),'2028-02-29');
  assert.equal(monthGrid(2028,2).days,29);
});

test('all grade choices round-trip and keep undefined/all semantics',()=>{
  for(const g of QUICK_GRADES)assert.deepEqual(choiceToGrades(gradesToChoice(g.grades)),g.grades);
  assert.deepEqual(choiceToGrades('all'),[]);
  assert.deepEqual(choiceToGrades('1,2'),[1,2]);
  assert.deepEqual(choiceToGrades('1,3'),[1,3]);
  assert.deepEqual(choiceToGrades('2,3'),[2,3]);
});

test('calendar selection resets event identity and name but preserves row defaults',()=>{
  const old={...initialQuickEvent(2026,'2026-05-12'),id:'old',name:'체육대회',department:'체육부',curriculumArea:'creative_self'};
  const next=changeQuickDate(old,'2026-05-21');
  assert.deepEqual([next.id,next.name,next.date,next.department,next.curriculumArea],['','','2026-05-21','체육부','creative_self']);
});

test('one-line event row validates all timetable fields, volunteer separately',()=>{
  const plan=createAcademic(2026);
  const event={...initialQuickEvent(2026,'2026-05-14'),name:'현장체험학습',periodStart:3,periodEnd:5,curriculumArea:'creative_self',grades:[1,2],volunteer:true,department:'교육과정부'};
  assert.equal(validateEventRow(2026,event,plan.subjects),null);
  const normalized=normalizeEventRow(event,'quick-1');
  assert.equal(normalized.affectsTimetable,true);
  assert.deepEqual(normalized.grades,[1,2]);
  assert.equal(normalized.volunteer,true);
  assert.equal(normalized.department,'교육과정부');
  const slots=planForDate({...plan,dayRules:[]},'2026-05-14',[normalized]);
  assert.equal(slots.some(x=>x.source==='event'&&x.period===3&&x.scopeId==='g1c1'),true);
  assert.equal(slots.some(x=>x.source==='event'&&x.scopeId==='g3c1'),false);
  assert.equal(validateEventRow(2026,{...event,periodStart:5,periodEnd:3},plan.subjects)!==null,true);
});

test('without a time classification, events remain visible but do not overwrite timetable',()=>{
  const plan=createAcademic(2026);
  const raw={...initialQuickEvent(2026,'2026-05-14'),name:'행사 예정',curriculumArea:'none',grades:[],volunteer:false};
  const next=normalizeEventRow(raw,'quick-2');
  assert.equal(next.affectsTimetable,false);
  assert.equal(planForDate(plan,'2026-05-14',[next]).some(x=>x.source==='event'),false);
});

test('Enter traverses the form in order and saves only from its final field',()=>{
  const regular=['date','name','grades','start','end','area','service','dept'];
  for(let i=0;i<regular.length-1;i++)assert.deepEqual(quickEnterAction(i,regular.length),{type:'focus',index:i+1});
  assert.deepEqual(quickEnterAction(regular.length-1,regular.length),{type:'save'});
  const subject=['date','name','grades','start','end','area','service','subject','dept'];
  assert.deepEqual(quickEnterAction(6,subject.length),{type:'focus',index:7});
  assert.deepEqual(quickEnterAction(7,subject.length),{type:'focus',index:8});
  assert.deepEqual(quickEnterAction(8,subject.length),{type:'save'});
});

test('Ctrl/Cmd Enter saves mid-form and Shift Enter traverses backwards',()=>{
  assert.deepEqual(quickEnterAction(1,8,{ctrlKey:true}),{type:'save'});
  assert.deepEqual(quickEnterAction(0,8,{metaKey:true}),{type:'save'});
  assert.deepEqual(quickEnterAction(4,8,{shiftKey:true}),{type:'focus',index:3});
  assert.deepEqual(quickEnterAction(0,8,{shiftKey:true}),{type:'focus',index:0});
  assert.deepEqual(quickEnterAction(-1,8),{type:'ignore'});
});
