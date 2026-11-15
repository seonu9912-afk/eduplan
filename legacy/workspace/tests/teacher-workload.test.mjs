import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BELL,EMPTY_TIMETABLE_CONFIG,solveTimetable} from '../lib/timetable-solver.js';
import {teacherQuality,teachingSegments,teacherWorkloadReport,teacherHoursPreflight} from '../lib/teacher-workload.js';
import {buildMipProblem} from '../lib/timetable-mip.js';
const basic={classes:[{id:'c1',label:'1-1'}],teachers:[{id:'t1',label:'교사A'}],subjects:[{id:'s',label:'국어'}],rooms:[],groups:[]};
const period={1:7,2:7,3:7,4:7,5:6};
const config={...EMPTY_TIMETABLE_CONFIG(),periods:period,lessons:[{id:'a',scope:'class',scopeId:'c1',subjectId:'s',teacherId:'t1',hours:5,block:1}]};
test('기본 교사 수업 부담 기준은 학교별 설정 가능',()=>{
 assert.deepEqual(teacherQuality(config),{maxDailyLessons:5,maxConsecutiveLessons:3,targetDailySpread:2});
 assert.equal(teacherQuality({...config,teacherQuality:{maxDailyLessons:4,maxConsecutiveLessons:2,targetDailySpread:1}}).maxDailyLessons,4);
});
test('점심시간은 연속 수업 경계를 만듦',()=>{
 assert.deepEqual(teachingSegments(config,1),[[1,2,3,4],[5,6,7]]);
});
test('하루 최대 시수·연속 수업·일별 편차를 교사별로 검증',()=>{
 const list=[1,2,3,4,5,6].map(period=>({teacherId:'t1',weekday:1,period}));
 list.push({teacherId:'t1',weekday:2,period:1});
 const r=teacherWorkloadReport(basic,list,config);
 assert.equal(r.hardViolations,2);
 assert.equal(r.flagged,1);
 assert.deepEqual(r.rows[0].counts,[6,1,0,0,0]);
 assert.equal(r.rows[0].maxRun,4);
 assert.equal(r.rows[0].spread,6);
});
test('주당 배정시수 자체가 하루 상한을 넘으면 사전 차단',()=>{
 const x={...config,lessons:[{...config.lessons[0],hours:26}]};
 assert.match(teacherHoursPreflight(basic,x)[0],/주당 26교시/);
});
test('대규모 최적화 모델에 교사 일별 상한과 연속 수업 및 편차 목표 포함',()=>{
 const model=buildMipProblem(basic,config);
 assert.equal(model.errors.length,0);
 assert.equal(model.quality.maxDailyLessons,5);
 assert.ok(model.lp.includes('daily'));
 assert.ok(model.lp.includes('streak'));
 assert.ok(model.lp.includes('fairness'));
 assert.ok(model.lp.includes('over0'));
});
test('소규모 시간표도 교사 부담 기준을 반영',()=>{
 const plan={...basic,weekly:[],timetableConfig:config};
 const result=solveTimetable(plan,{config,limitMs:2000,maxNodes:15000});
 assert.equal(result.ok,true,result.errors?.join('\n'));
 assert.equal(teacherWorkloadReport(plan,result.slots,config).hardViolations,0);
});
