import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../components/CalendarPlanner.jsx',import.meta.url),'utf8');
const v12=readFileSync(new URL('../components/CalendarV12Port.jsx',import.meta.url),'utf8');

test('사이드바 학사일정 메뉴에서 v12 정식 화면을 바로 렌더링한다',()=>{
  assert.match(page,/\{ id: 'calendar', label: '학사일정'/);
  assert.match(page,/import CalendarV12Port from '\.\.\/components\/CalendarV12Port';/);
  assert.match(page,/\{nav==='calendar' && <CalendarV12Port\b/);
  assert.doesNotMatch(page,/<CalendarPlanner\b/);
});

test('구 학사일정 화면을 없애고 호환 경로도 정식 화면으로 연결한다',()=>{
  assert.match(legacy,/export \{ default \} from '\.\/CalendarV12Port';/);
  assert.doesNotMatch(legacy,/cal-tabs|const TABS=|tab==='ported'/);
  assert.match(v12,/const \[tab,setTab\]=useState\('annual'\)/);
  assert.doesNotMatch(v12,/원본 v12 이식 검증/);
});

test('날짜 편집 화면에 작성중 변경 보호 콜백을 전달한다',()=>{
  assert.match(v12,/onDirtyChange=\{setDayDirty\}/);
  assert.doesNotMatch(v12,/<DayEditor[^>]*onReset=\{resetDay\} onClose=/);
});
