import { describe, expect, it } from "vitest";
import { eventAllocations, eventDraft, eventChange, calendarDates, calendarChangeSchema } from "../../src/lib/academic-calendar";
import { defaultAnnual, calculateAcademic } from "../../src/lib/academic";
import { recoveryPreviewContext } from "../../src/app/recovery-preview/fixture";

const context = recoveryPreviewContext();
function fixture() {
  const plan = defaultAnnual([2]);
  const event = { ...context.events[0], start_date: "2027-03-04", end_date: "2027-03-05", target_grades: [2], target_class_ids: [] };
  return { plan, event };
}
describe("official calendar adapter", () => {
  it("uses real academic dates and rejects overflow, leap dates and reversed ranges", () => {
    expect(calendarDates(2027,"2028-02-28","2028-02-29")).toHaveLength(2);
    expect(calendarDates(2027,"2027-02-28","2027-03-01")).toEqual([]);
    expect(calendarDates(2026,"2027-02-29","2027-02-29")).toEqual([]);
    expect(calendarDates(2027,"2027-04-02","2027-04-01")).toEqual([]);
  });
  it("defaults unspecified event periods to subject and overrides recurring creative time without changing its source", () => {
    const { plan,event } = fixture();
    plan.recurring=[{id:"weekly",name:"진로",area:"진로",grade:2,semester:1,weekday:4,exclude:[],start:1,end:1}];
    const draft=eventDraft(event,plan);
    draft.slots["g:2"]={"2027-03-04":{2:"자율·자치"}};
    let id=0;
    plan.allocations=eventAllocations(draft,context,()=>`test-${++id}`);
    const result=calculateAcademic(2027,plan,[2],context.semesters);
    const day=result.details.find((d)=>d.date==="2027-03-04")!;
    expect(day.counts).toMatchObject({"교과":5,"자율·자치":1});
    expect(day.counts["진로"]).toBeUndefined();
    expect(plan.recurring[0].area).toBe("진로");
    expect(result.warnings.filter((w)=>w.includes(event.title))).toEqual([]);
    expect(new Set(plan.allocations.map((a)=>a.id)).size).toBe(plan.allocations.length);
  });
  it("uses full class exceptions once, without multiplying grade hours by class count", () => {
    const {plan,event}=fixture();
    const classes=[{id:"d466716f-4101-466e-b375-338ad633c146",grade:2,class_number:1},{id:"ad66c64d-aec4-44b0-b16d-67181593ca04",grade:2,class_number:2}];
    const draft=eventDraft(event,plan);
    draft.slots={"g:2":{"2027-03-04":{1:"진로",2:"진로"}},[`c:${classes[0].id}`]:{"2027-03-04":{1:"동아리"}}};
    let id=0;plan.allocations=eventAllocations(draft,{...context,classes:classes as typeof context.classes},()=>`s${++id}`);
    const result=calculateAcademic(2027,plan,[2],context.semesters,classes);
    const terms=result.classTotals.filter((t)=>t.semester===1);
    expect(terms.map((t)=>t.counts["진로"])).toEqual([0,2]);
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
