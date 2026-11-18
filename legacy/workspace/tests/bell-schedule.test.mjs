import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BELL,DEFAULT_DAY_PERIODS,dayPeriodRange} from '../lib/timetable-solver.js';
import {clockMinutes,minutesClock,clockParts,changeClockPart,inferBellSettings,generateBellSchedule,selectOperatingBellRows,compareBellDay,timeDifferenceLabel} from '../lib/bell-schedule.js';

const clone=()=>structuredClone(DEFAULT_BELL);
test('original 45 minute lessons and 60 minute lunch roundtrip unchanged',()=>{
  const rows=clone();
  const inputs=inferBellSettings(rows);
  assert.deepEqual(inputs,{firstLessonStart:'09:00',lessonMinutes:45,breakMinutes:10,lunchMinutes:60});
  const generated=generateBellSchedule(rows,inputs);
  assert.equal(generated.ok,true,generated.errors?.join(' / '));
  assert.deepEqual(generated.rows,rows);
  assert.notStrictEqual(generated.rows,rows);
  assert.equal(generated.rows.at(-1).end,'16:05');
});
test('changing lesson, break and lunch durations recalculates every subsequent bell',()=>{
  const before=clone();
  const changed=generateBellSchedule(before,{
    firstLessonStart:'09:00',lessonMinutes:40,breakMinutes:5,lunchMinutes:50,
  });
  assert.equal(changed.ok,true,changed.errors?.join(' / '));
  assert.equal(changed.rows.find(x=>x.id==='p2').start,'09:45');
  assert.equal(changed.rows.find(x=>x.id==='p4').end,'11:55');
  assert.equal(changed.rows.find(x=>x.id==='lunch').end,'12:45');
  assert.equal(changed.rows.at(-1).end,'14:55');
  assert.equal(before.at(-1).end,'16:05','calculator must not alter saved timetable');
});
test('weekday 3~7 selection keeps only its lessons and lunch, with calculated day end',()=>{
  const rows=clone(),range={start:3,end:7};
  const selected=selectOperatingBellRows(rows,range.start,range.end);
  assert.equal(selected.ok,true);
  assert.deepEqual(selected.rows.filter(x=>x.type==='lesson').map(x=>x.period),[3,4,5,6,7]);
  assert.ok(selected.rows.some(x=>x.type==='lunch'));
  const compare=compareBellDay(rows,range.start,range.end,{
    firstLessonStart:'10:50',lessonMinutes:40,breakMinutes:5,lunchMinutes:50,
  });
  assert.equal(compare.ok,true,compare.errors?.join(' / '));
  assert.equal(compare.oldEnd,'16:05');
  assert.equal(compare.newEnd,'15:15');
  assert.equal(compare.delta,-50);
  assert.equal(timeDifferenceLabel(compare.delta),'50분 앞당겨짐');
  assert.equal(timeDifferenceLabel(30),'30분 늦어짐');
});
test('invalid duration and midnight overflow fail without modifying input rows',()=>{
  const input=clone();
  assert.equal(generateBellSchedule(input,{firstLessonStart:'',lessonMinutes:45,breakMinutes:10,lunchMinutes:60}).ok,false);
  assert.equal(generateBellSchedule(input,{firstLessonStart:'09:00',lessonMinutes:0,breakMinutes:10,lunchMinutes:60}).ok,false);
  assert.equal(generateBellSchedule(input,{firstLessonStart:'22:00',lessonMinutes:45,breakMinutes:10,lunchMinutes:60}).ok,false);
  assert.equal(clockMinutes('25:00'),null);
  assert.equal(minutesClock(1440),null);
  assert.equal(input.at(-1).end,'16:05');
});
test('legacy weekday config remains valid and returns useful error for missing bell rows',()=>{
  const cfg={periods:{...DEFAULT_DAY_PERIODS}};
  assert.deepEqual(dayPeriodRange(cfg,3),{start:1,end:7});
  assert.equal(selectOperatingBellRows(clone(),8,10).ok,false);
  assert.equal(compareBellDay(clone(),8,10,{firstLessonStart:'09:00',lessonMinutes:40,breakMinutes:10,lunchMinutes:60}).ok,false);
});
test('hour/minute picker always produces a valid minute-precision time',()=>{
  assert.deepEqual(clockParts('09:00'),{hour:'09',minute:'00'});
  assert.equal(changeClockPart('09:00','hour','13'),'13:00');
  assert.equal(changeClockPart('13:00','minute','35'),'13:35');
  assert.equal(changeClockPart('13:35','minute','00'),'13:00');
  assert.equal(clockMinutes(changeClockPart('09:00','hour','07')),420);
  assert.equal(clockMinutes('09:00:00'),540,'legacy seconds-based native value is supported');
  assert.equal(clockMinutes('9:05'),545,'single-digit hours are supported');
  assert.equal(changeClockPart('invalid','hour','08'),'08:00');
  assert.equal(changeClockPart('08:25','minute','99'),'08:25');
});
test('auto generation accepts a time reconstructed by both hour/minute dropdowns',()=>{
  const rows=clone();
  const start=changeClockPart(changeClockPart('09:00','hour','09'),'minute','30');
  const generated=generateBellSchedule(rows,{
    firstLessonStart:start,lessonMinutes:40,breakMinutes:5,lunchMinutes:50,
  });
  assert.equal(generated.ok,true,generated.errors?.join(' / '));
  assert.equal(generated.rows.find(row=>row.id==='p1').start,'09:30');
  assert.equal(generated.rows.find(row=>row.id==='p2').start,'10:15');
  assert.equal(rows.find(row=>row.id==='p1').start,'09:00');
});
