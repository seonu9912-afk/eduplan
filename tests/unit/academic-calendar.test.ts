import { describe, expect, it } from "vitest";
import { eventAllocations, eventDraft, eventChange, calendarDates, calendarChangeSchema, formatCalendarEventPeriod, sortCalendarEvents, eventVisiblePeriods, sharedEventArea, formatEventAssignedPeriods, formatEventAudience } from "../../src/lib/academic-calendar";
import { defaultAnnual, calculateAcademic } from "../../src/lib/academic";
import { recoveryPreviewContext } from "../../src/app/recovery-preview/fixture";

const context = recoveryPreviewContext();
function fixture() {
  const plan = defaultAnnual([2]);
  const event = { ...context.events[0], start_date: "2027-03-04", end_date: "2027-03-05", target_grades: [2], target_class_ids: [] };
  return { plan, event };
}
describe("official calendar adapter", () => {
  it("formats a single-period event without showing unnecessary grade labels", () => {
    const event = {id:"event-a",start_date:"2027-03-02",end_date:"2027-03-02"};
    const rows = [{eventId:"event-a",date:"2027-03-02",start:5,end:5}];
    expect(formatEventAssignedPeriods(event,rows)).toBe("5교시");
    expect(formatEventAssignedPeriods({...event,id:"missing"},rows)).toBe("");
    expect(formatEventAudience({target_grades:[3,1,2],target_class_ids:[]},[1,2,3],[])).toBe("");
    expect(formatEventAudience({target_grades:[2],target_class_ids:[]},[1,2,3],[])).toBe("2학년");
  });
  it("groups continuous event periods, keeps gaps and handles varying multi-day schedules", () => {
    const event = {id:"event-b",start_date:"2027-03-04",end_date:"2027-03-05"};
    const rows = [
      {eventId:"event-b",date:"2027-03-04",start:2,end:3},
      {eventId:"event-b",date:"2027-03-04",start:5,end:5},
      {eventId:"event-b",date:"2027-03-05",start:2,end:3},
      {eventId:"event-b",date:"2027-03-05",start:5,end:5},
      {eventId:"other",date:"2027-03-05",start:6,end:9}
    ];
    expect(formatEventAssignedPeriods(event,rows)).toBe("2~3·5교시");
    expect(formatEventAssignedPeriods(event,[...rows,{eventId:"event-b",date:"2027-03-05",start:6,end:6}])).toBe("날짜별 교시 상이");
  });
  it("shows only targeted class names for class-specific events", () => {
    const classes = [
      {id:"a",grade:1,class_number:1},{id:"b",grade:2,class_number:1}
    ];
    expect(formatEventAudience({target_grades:[1,2],target_class_ids:["b"]},[1,2],classes))
      .toBe("2학년 1반");
  });
  it("uses all target grades as default and distinguishes mixed areas without changing drafts", () => {
    expect(sharedEventArea([null, undefined, null])).toBeNull();
    expect(sharedEventArea(["동아리", "동아리", "동아리"])).toBe("동아리");
    expect(sharedEventArea(["동아리", "진로", "동아리"])).toBe("mixed");
    expect(sharedEventArea([undefined, "동아리"])).toBe("mixed");
  });
  it("requires the department on event saves but leaves unrelated day edits alone", () => {
    const { plan, event } = fixture();
    const emptyDepartment = { ...event, department: "   " };
    const draft = eventDraft(emptyDepartment, plan);
    expect(() => eventChange(draft, context, plan)).toThrow("담당 부서를 입력해 주세요.");
    expect(eventChange(eventDraft(event, plan), context, plan).kind).toBe("event");
  });
  it("limits the grid to configured periods, with an all-periods override and preserved exceptions", () => {
    expect(eventVisiblePeriods([{start:1,end:6},{start:1,end:5}], [])).toEqual([1,2,3,4,5,6]);
    expect(eventVisiblePeriods([{start:3,end:5}], [])).toEqual([3,4,5]);
    expect(eventVisiblePeriods([{start:1,end:6}], [9])).toEqual([1,2,3,4,5,6,7,8,9]);
    expect(eventVisiblePeriods([undefined], [])).toEqual([1,2,3,4,5,6]);
    expect(eventVisiblePeriods([{start:1,end:6}], [12])).toHaveLength(12);
  });
  it("saves only specifically assigned event periods, not the other eleven subject hours", () => {
    const {plan,event} = fixture();
    const draft = eventDraft(event,plan);
    draft.slots = {"g:2":{"2027-03-04":{3:"교과",4:"동아리",6:"자율"}}};
    let i=0;
    const allocations = eventAllocations(draft,context,()=>`id-${++i}`);
    expect(allocations.map(a=>[a.date,a.start,a.end,a.areas["2"]]))
      .toEqual([["2027-03-04",3,3,"교과"],["2027-03-04",4,4,"동아리"],["2027-03-04",6,6,"자율"]]);
    const restored = eventDraft(event,{...plan,allocations});
    expect(restored.slots["g:2"]["2027-03-04"]).toEqual({3:"교과",4:"동아리",6:"자율"});
  });
  it("preserves explicit legacy full-day assignments without expanding new sparse events", () => {
    const {plan,event}=fixture();
    plan.allocations=[{id:"legacy",eventId:event.id,date:event.start_date,title:event.title,department:"",start:1,end:12,areas:{"2":"교과"}}];
    const draft=eventDraft(event,plan);
    const updated=eventAllocations(draft,context,()=>crypto.randomUUID());
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({start:1,end:12,areas:{"2":"교과"}});
  });
  it("prints the requested Korean dates without duplicating a single-day date", () => {
    expect(formatCalendarEventPeriod("2027-03-02", "2027-03-02")).toBe("3월 2일(화)");
    expect(formatCalendarEventPeriod("2027-03-04", "2027-03-05")).toBe("3월 4일(목)~3월 5일(금)");
    expect(formatCalendarEventPeriod("2027-12-31", "2028-01-02")).toBe("12월 31일(금)~1월 2일(일)");
  });
  it("orders monthly events by date, with deterministic ordering on a shared date", () => {
    const source = [
      { id: "4", title: "입학식", start_date: "2027-03-02", end_date: "2027-03-02" },
      { id: "3", title: "동아리", start_date: "2027-03-04", end_date: "2027-03-05" },
      { id: "2", title: "안전교육", start_date: "2027-03-02", end_date: "2027-03-02" },
      { id: "1", title: "시업식", start_date: "2027-03-01", end_date: "2027-03-01" },
    ];
    const sorted = sortCalendarEvents(source);
    expect(sorted.map((e) => e.id)).toEqual(["1", "2", "4", "3"]);
    expect(source[0].id).toBe("4");
  });
  it("uses real academic dates and rejects overflow, leap dates and reversed ranges", () => {
    expect(calendarDates(2027,"2028-02-28","2028-02-29")).toHaveLength(2);
    expect(calendarDates(2027,"2027-02-28","2027-03-01")).toEqual([]);
    expect(calendarDates(2026,"2027-02-29","2027-02-29")).toEqual([]);
    expect(calendarDates(2027,"2027-04-02","2027-04-01")).toEqual([]);
  });
  it("keeps the original timetable on unassigned periods while overriding only explicit event hours", () => {
    const { plan,event } = fixture();
    plan.recurring=[{id:"weekly",name:"진로",area:"진로",grade:2,semester:1,weekday:4,exclude:[],start:1,end:1}];
    const draft=eventDraft(event,plan);
    draft.slots["g:2"]={"2027-03-04":{2:"자율·자치"}};
    let id=0;
    plan.allocations=eventAllocations(draft,context,()=>`test-${++id}`);
    const result=calculateAcademic(2027,plan,[2],context.semesters);
    const day=result.details.find((d)=>d.date==="2027-03-04")!;
    expect(day.counts).toMatchObject({"교과":4,"자율·자치":1,"진로":1});
    expect(day.counts["진로"]).toBe(1);
    expect(plan.recurring[0].area).toBe("진로");
    expect(result.warnings.filter((w)=>w.includes(event.title))).toEqual([]);
    expect(new Set(plan.allocations.map((a)=>a.id)).size).toBe(plan.allocations.length);
  });
  it("lets class-specific event hours override only matching common periods", () => {
    const {plan,event}=fixture();
    const classes=[{id:"d466716f-4101-466e-b375-338ad633c146",grade:2,class_number:1},{id:"ad66c64d-aec4-44b0-b16d-67181593ca04",grade:2,class_number:2}];
    const draft=eventDraft(event,plan);
    draft.slots={"g:2":{"2027-03-04":{1:"진로",2:"진로"}},[`c:${classes[0].id}`]:{"2027-03-04":{1:"동아리"}}};
    let id=0;plan.allocations=eventAllocations(draft,{...context,classes:classes as typeof context.classes},()=>`s${++id}`);
    const result=calculateAcademic(2027,plan,[2],context.semesters,classes);
    const terms=result.classTotals.filter((t)=>t.semester===1);
    expect(terms.map((t)=>t.counts["진로"])).toEqual([1,2]);
    expect(terms.map((t)=>t.conflicts)).toEqual([0,0]);
    expect(terms[0].hours).toBe(result.totals[0].hours);
  });
  it("preserves unrelated data and refuses ambiguous or orphaned old allocations", () => {
    const {plan,event}=fixture();
    plan.allocations=[{id:"a",eventId:event.id,date:event.start_date,title:event.title,department:"",start:1,end:2,areas:{2:"진로"}}];
    const before=structuredClone(plan);
    const draft=eventDraft(event,plan);
    const change=eventChange(draft,context,plan);
    expect(calendarChangeSchema.safeParse(change).success).toBe(true);
    expect(plan).toEqual(before);
    plan.allocations.push({...plan.allocations[0],id:"b",areas:{2:"동아리"}});
    expect(()=>eventDraft(event,plan)).toThrow("서로 다른 기존 배정");
    draft.slots["c:missing"]={"2027-03-04":{1:"진로"}};
    expect(()=>eventAllocations(draft,context,()=>"x")).toThrow("보관된 학급");
  });
  it("retains creative records beyond a reduced operating range but excludes them from totals", () => {
    const {plan,event}=fixture();
    const draft=eventDraft(event,plan);
    draft.slots["g:2"]={"2027-03-04":{6:"진로"}};
    plan.days["2027-03-04"]={type:"instructional",name:"",enabled:true,weekday:4,gradePeriods:{2:{start:1,end:4}}};
    let id=0;plan.allocations=eventAllocations(draft,context,()=>`s${++id}`);
    const result=calculateAcademic(2027,plan,[2],context.semesters);
    expect(result.details.find((d)=>d.date==="2027-03-04")!.counts).toEqual({"교과":4});
    expect(plan.allocations.some((a)=>a.start===6&&a.areas[2]==="진로")).toBe(true);
    expect(result.warnings.some((w)=>w.includes(event.title))).toBe(true);
  });
});
