import {expect,it} from "vitest";
import {eventConnectionIssues,timetableConnectionIssues} from "../../src/lib/operation-audit";
import {operationsPreviewContext} from "../../src/app/recovery-preview/operations-fixture";
import {newTimetableDocument} from "../../src/lib/timetable-bridge";
import {defaultAnnual} from "../../src/lib/academic";
import type {Context} from "../../src/lib/models";
it("detects missing timetable references and does not flag valid frozen teacher IDs",()=>{
 const c=operationsPreviewContext(),doc=newTimetableDocument(c);
 doc.weekly=[{id:"a",scope:"class",scopeId:c.classes[0].id,weekday:1,period:1,subjectId:c.subjects[0].id,teacherId:"former",room:""}];
 doc.teachers.push({id:"former",label:"이전 교사"});
 expect(timetableConnectionIssues(c,doc,undefined)).toContain("교원 연결: 이전 교사");
 expect(timetableConnectionIssues(c,doc,undefined,true)).not.toContain("교원 연결: 이전 교사");
 doc.weekly[0].scopeId="absent";
 expect(timetableConnectionIssues(c,doc,undefined,true)).toContain("학급 연결: absent");
});
it("flags orphan event allocations without modifying data",()=>{
 const c=operationsPreviewContext(),plan=defaultAnnual(c.grades);
 plan.allocations=[{id:"a",eventId:"missing",date:"2027-03-02",title:"행사",department:"교무부",areas:{"1":"교과"},start:1,end:1}];
 c.annual={...c.annual,document:plan} as Context["annual"];
 expect(eventConnectionIssues(c)).toContain("2027-03-02 · 행사 · 연결 행사 없음");
});
