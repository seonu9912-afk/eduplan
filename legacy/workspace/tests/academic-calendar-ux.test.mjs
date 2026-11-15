import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyPublicHolidays} from '../lib/calendar.js';
import {createAcademic} from '../lib/academic.js';

const port=readFileSync(new URL('../components/CalendarV12Port.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');

// UI contracts: annual is the sole initial view; calendar and event editing share the second tab.
test('Annual academic calendar is the opening tab; monthly calendar belongs to events',()=>{
  assert.match(port,/const \[tab,setTab\]=useState\('annual'\)/);
  assert.match(port,/const TABS=\[\['annual','연간 학사력'\],\['events','행사 편성'\]/);
  assert.doesNotMatch(port,/\['month','월간 학사력'\]/);
  assert.doesNotMatch(port,/\['recurring','수업·창체'\]/);
  assert.match(port,/\{tab==='events'&&<>\s*<section className="v12-events-calendar"/);
  assert.match(port,/renderCalendar\(month\)/);
});

test('Annual date editing opens accessible right drawer instead of inline editor',()=>{
  assert.match(port,/v12-drawer-root/);
  assert.match(port,/role="dialog" aria-modal="true"/);
  assert.match(port,/ref=\{drawerRef\}/);
  assert.match(port,/e\.key==='Escape'/);
  assert.match(port,/lastFocused\?\.focus\?\.\(\)/);
  assert.match(port,/v12-disclosure.*수업일수·방학일수 확인/);
});

test('Sample banner hides only on academic calendar and public holidays auto-load when missing',()=>{
  assert.match(page,/nav!=='calendar'&&schoolId===EXAMPLE_SCHOOL_ID/);
  assert.match(port,/if\(plan\.holidaysLastChecked\|\|autoHolidayAttempts\.current\.has\(year\)\)return/);
  assert.match(port,/applyPublicHolidays\(existing,holidays\)/);
  assert.match(port,/공휴일 다시 조회/);
  assert.match(port,/수동으로 지정한 학사일은 보존/);
});

test('Official holidays do not override manual dates, and imports are idempotent',()=>{
  const p=createAcademic(2027);
  p.dayRules=[{date:'2027-03-01',kind:'instruction',label:'대체수업',source:'manual'},{date:'2027-07-26',kind:'vacation',label:'여름방학',source:'manual'}];
  const holidays=[{date:'2027-03-01',name:'삼일절',holiday:true},{date:'2027-05-05',name:'어린이날',holiday:true},{date:'2027-07-26',name:'대체공휴일',holiday:true}];
  const once=applyPublicHolidays(p,holidays);const twice=applyPublicHolidays(once,holidays);
  assert.equal(once.dayRules.find(x=>x.date==='2027-03-01')?.kind,'instruction');
  assert.equal(once.dayRules.find(x=>x.date==='2027-07-26')?.kind,'vacation');
  assert.equal(once.dayRules.find(x=>x.date==='2027-05-05')?.kind,'holiday');
  assert.deepEqual(once.dayRules,twice.dayRules);
});
