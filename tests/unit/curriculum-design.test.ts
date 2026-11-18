import { describe, expect, it } from "vitest";
import { recoveryPreviewContext } from "../../src/app/recovery-preview/fixture";
import {
  initializeDesign, evaluateCell, withWeeklyHours, withFinalHours, withWeeks,
  getCell, nationalGroupTotals, matchGroup, validateDocument, curriculumVersion,
} from "../../src/lib/curriculum-design";

describe("curriculum 3-year/operating shared source calculation",()=>{
  const context=recoveryPreviewContext();
  const plan=context.plans[0]??{
    id:"65b86866-942d-4f78-bf10-f7a6d975be11",
    cohort_year:2027,version:1,workspace_id:context.workspace.id,unit:"hours",
    source:"",school_id:null,updated_at:"",
  };
  it("initializes every term independently without overwriting existing historical totals",()=>{
    const doc=initializeDesign(context,plan);
    expect(doc.cohortYear).toBe(plan.cohort_year);
    expect(doc.cells).toHaveLength(context.subjects.length*context.grades.length*2);
    expect(doc.weeks[String(plan.cohort_year)].count).toBe(16);
    expect(doc.weeks[String(plan.cohort_year+2)].status).toBe("provisional");
    const original=context.hours.filter((row)=>row.plan_id===plan.id);
    for(const item of original){
      const cell=getCell(doc,item.subject_id,item.grade,item.semester);
      expect(cell).not.toBeNull();
      expect(evaluateCell(doc,cell!).total).toBe(item.hours);
    }
  });
  it("recalculates weekly 3 as 48 or 51 when weeks changes from 16 to 17",()=>{
    const id=context.subjects[0].id;
    const doc=withWeeklyHours(initializeDesign(context,plan),id,1,1,3);
    expect(evaluateCell(doc,getCell(doc,id,1,1)!).total).toBe(48);
    const next=withWeeks(doc,plan.cohort_year,{count:17,status:"confirmed"});
    expect(evaluateCell(next,getCell(next,id,1,1)!).total).toBe(51);
    expect(getCell(next,id,1,2)!.weekly).toBe(getCell(doc,id,1,2)!.weekly);
  });
  it("direct final-total edit creates adjustment and preserves it when weekly changes",()=>{
    const id=context.subjects[0].id;
    const doc=withWeeklyHours(initializeDesign(context,plan),id,1,1,3);
    const adjusted=withFinalHours(doc,id,1,1,50);
    expect(getCell(adjusted,id,1,1)?.weekly).toBe(3);
    expect(getCell(adjusted,id,1,1)?.manual).toBe(2);
    const edited=withWeeklyHours(adjusted,id,1,1,4);
    expect(getCell(edited,id,1,1)?.manual).toBe(2);
    expect(evaluateCell(edited,getCell(edited,id,1,1)!).total).toBe(66);
  });
  it("does not allow an invalid non-integer total to silently round",()=>{
    const id=context.subjects[0].id;
    const doc=withWeeklyHours(initializeDesign(context,plan),id,1,1,1.3);
    const cell=getCell(doc,id,1,1)!;
    expect(evaluateCell(doc,cell).total).toBeCloseTo(20.8);
    expect(evaluateCell(doc,cell).valid).toBe(false);
    expect(validateDocument(context,doc).length).toBeGreaterThan(0);
  });
  it("preserves existing adjustment categories across edits and two view projections",()=>{
    const id=context.subjects[0].id;
    const start=withWeeklyHours(initializeDesign(context,plan),id,1,1,3);
    const changed={...start,cells:start.cells.map((cell)=>
      cell.subjectId===id&&cell.grade===1&&cell.semester===1
        ? {...cell,adjustments:[{id:"free-semester",kind:"자유학기제 시수 조정",hours:-16}]}
        : cell)};
    expect(evaluateCell(changed,getCell(changed,id,1,1)!).total).toBe(32);
    const updated=withWeeklyHours(changed,id,1,1,4);
    expect(evaluateCell(updated,getCell(updated,id,1,1)!).total).toBe(48);
    expect(getCell(updated,id,1,1)!.adjustments[0].hours).toBe(-16);
  });
  it("uses the 2015 and 2022 national middle-school reference tables for their cohorts",()=>{
    expect(curriculumVersion(2024).verified).toBe(true);
    expect(curriculumVersion(2025).verified).toBe(true);
    expect(matchGroup("사회/역사/도덕")).toBe("사회");
    expect(matchGroup("동아리 활동")).toBe("창체");
    expect(matchGroup("학교자율시간")).toBeNull();
    const totals=nationalGroupTotals(context,initializeDesign(context,plan));
    expect(totals.find((x)=>x.key==="국어")?.hours).toBe(442);
    expect(totals.find((x)=>x.key==="창체")?.hours).toBe(306);
  });
});
