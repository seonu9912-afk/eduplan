import { expect, it } from "vitest";
import { classifyEventLesson } from "../../src/lib/event-lesson-impact";
import type { DatedLesson } from "../../src/lib/school-operations";
const lesson: DatedLesson = { id:"lesson", date:"2027-03-02",period:2,subjectId:"kor",subject:"국어",teacherId:"teacher",classIds:["class"],classes:"2-1",room:"",start:"10:00",end:"10:45",changed:false,blockedBy:[],relatedEventIds:["event-a","allocation-a"],blockedByEventIds:[] };
it("only attributes an impact to exact linked event identities",()=>{
  expect(classifyEventLesson(lesson,"event-b")).toBeNull();
  expect(classifyEventLesson(lesson,"event-a")?.status).toBe("normal");
  expect(classifyEventLesson({...lesson,blockedBy:["수업 취소·교환 또는 보결 변경"]},"event-a")?.status).toBe("check");
  expect(classifyEventLesson({...lesson,blockedBy:["체험학습"],blockedByEventIds:["event-a","allocation-a"]},"event-a")?.status).toBe("affected");
});
