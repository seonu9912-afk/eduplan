import {describe,expect,it} from "vitest";
import {recoveryPreviewContext} from "../../src/app/recovery-preview/fixture";
import {
  curriculumVersion,initializeDesign,withWeeklyHours,
} from "../../src/lib/curriculum-design";
import {
  basisForCohort,EDUPLAN_CURRICULUM_VERSION,reviewCohort,
  reviewOperatingYear,simulateWeeklyAllocation,
} from "../../src/lib/curriculum-workbench";

describe("EduPlan curriculum workbench v3 shared cohort engine",()=>{
  const source=recoveryPreviewContext();
  const context={...source,groups:source.groups.map(group=>
    group.name==="교과"?{...group,name:"국어"}:group)};
  const plan=context.plans.find(plan=>plan.cohort_year===2027)!;
  const doc=initializeDesign(context,plan);
  const subject=context.subjects[0];
  it("uses official baseline values for both 2015 and 2022 without mixing their cohorts",()=>{
    expect(EDUPLAN_CURRICULUM_VERSION).toBe("3.0");
    expect(basisForCohort(2024).version).toBe("2015");
    expect(basisForCohort(2025).version).toBe("2022");
    expect(basisForCohort(2024).groupRules.find(x=>x.key==="국어")?.hours).toBe(442);
    expect(basisForCohort(2025).minimum).toBe(3366);
    expect(curriculumVersion(2024).verified).toBe(true);
  });
  it("retains original data and shows baseline deltas instead of rewriting national standards",()=>{
    const start=reviewCohort(context,doc);
    expect(start.basis.version).toBe("2022");
    expect(start.groups.find(x=>x.key==="국어")?.standard).toBe(442);
    const nextDoc=withWeeklyHours(doc,subject.id,1,1,3);
    const result=reviewCohort(context,nextDoc);
    expect(result.groups.find(x=>x.key==="국어")?.standard).toBe(442);
    expect(result.total).not.toBe(start.total);
    expect(result.total-start.total).toBeCloseTo(
      simulateWeeklyAllocation(context,doc,subject.id,1,1,3).delta);
    expect(reviewCohort(context,doc).total).toBe(start.total);
  });
  it("scenario previews semester/group/year deltas without applying edits",()=>{
    const preview=simulateWeeklyAllocation(context,doc,subject.id,1,1,3);
    expect(preview.after-preview.before).toBeCloseTo(preview.delta);
    expect(preview.afterTerm-preview.beforeTerm).toBeCloseTo(preview.delta);
    expect((preview.afterGroup?.planned??0) - (preview.beforeGroup?.planned??0)).toBeCloseTo(preview.delta);
    expect(simulateWeeklyAllocation(context,doc,subject.id,1,1,3).after).toBe(preview.after);
    expect(()=>simulateWeeklyAllocation(context,doc,subject.id,1,1,-1)).toThrow();
  });
  it("operating year composition uses each cohort's current grade, never a 3-year sum",()=>{
    const docs=Object.fromEntries(context.plans.map(plan=>
      [plan.id,initializeDesign(context,plan)]));
    const review=reviewOperatingYear(context,2027,docs);
    expect(review.missingCohorts).toEqual([]);
    expect(review.grades.map(row=>row.cohort)).toEqual([2027,2026,2025]);
    expect(review.grades.map(row=>row.basis)).toEqual(["2022","2022","2022"]);
    expect(review.total).toBe(review.semesterTotals[0]+review.semesterTotals[1]);
    const gradeOne=review.grades[0];
    expect(gradeOne.first).toBe(575);
    expect(gradeOne.second).toBe(575);
    expect(review.warnings.some(x=>x.includes("서로 다른 입학생"))).toBe(true);
  });
  it("reports missing cohort documents rather than inventing operating values",()=>{
    const review=reviewOperatingYear(context,2026,{});
    expect(review.missingCohorts).toEqual([2026,2025,2024]);
    expect(review.grades[2].basis).toBe("2015");
    expect(review.total).toBe(0);
  });
  it("warns that concurrently offered choice courses are not student-level hours",()=>{
    const choiceGroup={...context.groups[0],id:"group-choice",name:"선택"};
    const a={...subject,id:"subject-a",group_id:choiceGroup.id,name:"목공"};
    const b={...subject,id:"subject-b",group_id:choiceGroup.id,name:"요리"};
    const c={...context,groups:[...context.groups,choiceGroup],subjects:[...context.subjects,a,b]};
    let edited=initializeDesign(c,plan);
    edited=withWeeklyHours(withWeeklyHours(edited,a.id,1,1,2),b.id,1,1,2);
    const review=reviewCohort(c,edited);
    expect(review.exceptions.length).toBeGreaterThan(0);
    expect(review.warnings.some(x=>x.includes("선택 묶음"))).toBe(true);
  });
});
