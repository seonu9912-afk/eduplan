import test from 'node:test';
import assert from 'node:assert/strict';
import {ledgerMove,ledgerDates,ledgerKind,ledgerRecord,parseLedgerDate,parseLedgerPaste,applyLedgerPaste,splitSpreadsheetPaste} from '../lib/ledger.js';
import {createAcademic} from '../lib/academic.js';
import {tallyCalendar,applyPublicHolidays} from '../lib/calendar.js';

test('annual ledger covers March to following February and leap year',()=>{
  assert.equal(ledgerDates(2026).length,365);
  assert.equal(ledgerDates(2027).length,366);
  assert.equal(ledgerDates(2027)[0],'2027-03-01');
  assert.equal(ledgerDates(2027).at(-1),'2028-02-29');
});
test('excel serial date accepted and impossible date rejected',()=>{
  assert.equal(parseLedgerDate('46084',2026),'2026-03-03');
  assert.equal(parseLedgerDate('2026. 3. 3.',2026),'2026-03-03');
  assert.equal(parseLedgerDate('2/27',2026),'2027-02-27');
  assert.equal(parseLedgerDate('2026-04-31',2026),null);
});
test('annual ledger navigation respects edges and columns',()=>{
  const dates=ledgerDates(2026);
  assert.deepEqual(ledgerMove(dates,dates[0],0,'ArrowUp'),{date:dates[0],col:0});
  assert.deepEqual(ledgerMove(dates,dates[0],0,'ArrowDown'),{date:dates[1],col:0});
  assert.deepEqual(ledgerMove(dates,dates[0],2,'ArrowRight'),{date:dates[0],col:3});
  assert.deepEqual(ledgerMove(dates,dates[0],0,'ArrowLeft'),{date:dates[0],col:0});
  assert.deepEqual(ledgerMove(dates,dates[0],5,'PageDown'),{date:dates[30],col:5});
});
test('Excel B:H columns import day classification and long content',()=>{
  const text='월\t날짜\t요일\t학사구분\t학사일정\t주요행사일정\t비고\n3월\t2026. 3. 3.\t화\t수업일\t시업식, 입학식\t4교시: 입학식(자율1)\t월1\n\t2026-03-04\t수\t수업일\t\t5교시: 진로\t';
  const r=parseLedgerPaste(text,2026);
  assert.equal(r.errors.length,0);
  assert.equal(r.rows.length,2);
  assert.equal(r.rows[0].date,'2026-03-03');
  assert.equal(r.rows[0].activities,'4교시: 입학식(자율1)');
  const plan=applyLedgerPaste(createAcademic(2026),r.rows);
  assert.equal(plan.dayNotes['2026-03-03'].memo,'월1');
  assert.equal(ledgerRecord(plan,[],'2026-03-03').schedule,'시업식, 입학식');
});
test('quoted Excel multiline activity does not split one date into two',()=>{
  const input='3월\t2026-03-04\t수\t수업일\t\t"1교시: 자율\n2교시: 진로"\t\n\t2026-03-05\t목\t수업일\t\t활동\t';
  assert.equal(splitSpreadsheetPaste(input).length,2);
  const parsed=parseLedgerPaste(input,2026);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.rows.length,2);
  assert.match(parsed.rows[0].activities,/자율\n2교시/);
});
test('unrecognized dates and duplicate rows are rejected before writing',()=>{
  const input='3월\t2026-03-03\t화\t수업일\t가\t\t\n\t2026-03-03\t화\t수업일\t나\t\t\n\t2026-04-31\t월\t수업일\t다\t\t';
  const parsed=parseLedgerPaste(input,2026);
  assert.equal(parsed.rows.length,1);
  assert.equal(parsed.errors.length,2);
});
test('imported public holiday stays non-instructional and official applies to others',()=>{
  const base=createAcademic(2026);
  const imported=applyLedgerPaste(base,[{date:'2026-03-02',kind:'holiday',schedule:'대체공휴일',activities:'',memo:''}]);
  const official=applyPublicHolidays(imported,[{date:'2026-03-02',name:'대체공휴일',holiday:true},{date:'2026-05-05',name:'어린이날',holiday:true}]);
  assert.equal(ledgerKind(official,'2026-03-02'),'공휴일');
  assert.equal(official.dayRules.find(x=>x.date==='2026-03-02').source,'import');
  assert.equal(official.dayRules.find(x=>x.date==='2026-05-05').source,'kasi');
  assert.ok(tallyCalendar(official).total<tallyCalendar(base).total);
});
test('ledger annotations never change timetable by themselves',()=>{
  const initial=createAcademic(2026);
  const copy=applyLedgerPaste(initial,[{date:'2026-03-05',kind:null,schedule:'창체',activities:'6교시 자율',memo:''}]);
  assert.deepEqual(copy.weekly,initial.weekly);
  assert.equal(copy.dayNotes['2026-03-05'].activities,'6교시 자율');
});
