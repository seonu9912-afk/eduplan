import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademic} from '../lib/academic.js';
import {summarizeEventHours} from '../lib/creative.js';
import {applyPublicHolidays} from '../lib/calendar.js';
test('creative activity aggregation tracks semester periods and volunteer without double counting',()=>{
  let plan=createAcademic(2026);
  plan.dayRules=[{date:'2026-07-20',kind:'vacation',label:'여름방학',source:'manual'},{date:'2026-08-17',kind:'instruction',label:'개학',source:'manual'}];
  const events=[{name:'지역 봉사',date:'2026-03-10',grades:[1],periodStart:5,periodEnd:7,curriculumArea:'creative_club',volunteer:true,affectsTimetable:true},{name:'진로',date:'2026-03-11',grades:[],periodStart:1,periodEnd:2,curriculumArea:'creative_career',volunteer:false,affectsTimetable:true}];
  const v=summarizeEventHours(plan,events);
  assert.equal(Object.values(v.counters[1]).reduce((s,r)=>s+r.creative_club,0),3);
  assert.equal(Object.values(v.counters[1]).reduce((s,r)=>s+r.volunteer,0),3);
  assert.equal(Object.values(v.counters[1]).reduce((s,r)=>s+r.creative_career,0),2);
  assert.equal(Object.values(v.counters[2]).reduce((s,r)=>s+r.creative_club,0),0);
  assert.equal(Object.values(v.counters[2]).reduce((s,r)=>s+r.creative_career,0),2);
});
test('holidays are excluded and not automatically counted as creative sessions',()=>{
  const p=applyPublicHolidays(createAcademic(2026),[{date:'2026-05-05',name:'어린이날',holiday:true}]);
  const v=summarizeEventHours(p,[{name:'동아리',date:'2026-05-05',periodStart:1,periodEnd:3,curriculumArea:'creative_club',affectsTimetable:true,grades:[]}]);
  assert.equal(v.counters[1].undetermined.creative_club,0);
  assert.equal(v.excluded.length,3);
});
