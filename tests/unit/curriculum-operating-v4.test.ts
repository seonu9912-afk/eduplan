import {describe,expect,it} from "vitest";
import {
  composeOperating,opHours,operatingDiffs,operatingTotals,updateOperatingCell,
  applyOperatingWeeks,validateOperating,type SourceCohort,
} from "../../src/lib/curriculum-operating-v4";
import {
  initializeDesign,withWeeklyHours,withTermWeeks,evaluateCell,getCell,
} from "../../src/lib/curriculum-design";
import {recoveryPreviewContext} from "../../src/app/recovery-preview/fixture";

describe("Curriculum operating v4 independent source and calculation",()=>{
  const c=recoveryPreviewContext();
  const subject=c.subjects[0].id;
  const source:SourceCohort[]=c.plans.map(plan=>{
    const original=initializeDesign(c,plan);
    return {cohortYear:plan.cohort_year,planId:plan.id,planVersion:plan.version,
      documentVersion:1,document:original,legacyHours:[]};
  });
  const doc=composeOperating(2027,source);
  it("composes each grade from its own cohort, not from all 3-year sums",()=>{
    expect(Object.keys(doc.sourceVersions)).toHaveLength(3);
    expect(doc.year).toBe(2027);
    for(let grade=1;grade<=3;grade++){
      const target=source.find(p=>p.cohortYear===2027-grade+1)!;
      const term=target.document!.cells.find(c=>c.subjectId===subject&&c.grade===grade&&c.semester===1)!;
      const operating=doc.cells.find(c=>c.subjectId===subject&&c.grade===grade&&c.semester===1)!;
      expect(opHours(operating)).toBe(evaluateCell(target.document!,term).total);
    }
    expect(doc.cells).toHaveLength(c.subjects.length*6);
  });
  it("edits an operating semester without mutating any entrance cohort",()=>{
    const orig=JSON.stringify(source);
    const next=updateOperatingCell(doc,subject,2,1,{weekly:5});
    expect(next.cells.find(c=>c.subjectId===subject&&c.grade===2&&c.semester===1)?.weekly).toBe(5);
    expect(doc.cells.find(c=>c.subjectId===subject&&c.grade===2&&c.semester===1)?.weekly).not.toBe(5);
    expect(JSON.stringify(source)).toBe(orig);
    expect(operatingDiffs(next,doc)).toHaveLength(1);
  });
  it("links semester weeks and hour-adjustment transparently",()=>{
    let next=applyOperatingWeeks(doc,1,1,17);
    const gradeOne=next.cells.find(c=>c.subjectId===subject&&c.grade===1&&c.semester===1)!;
    expect(gradeOne.weeks).toBe(17);
    next=updateOperatingCell(next,subject,1,1,{weekly:3,adjustment:-2,note:"집중이수 일정 조정"});
    expect(opHours(next.cells.find(c=>c.subjectId===subject&&c.grade===1&&c.semester===1)!)).toBe(49);
    expect(validateOperating(next)).toHaveLength(0);
    expect(validateOperating(updateOperatingCell(next,subject,1,1,{note:""}))).toContain(
      "조정 시수 사유 미입력: "+subject+":1:1");
  });
  it("switches from raw sums to student-path hours only for equal-hour alternatives",()=>{
    const row=doc.cells.find(x=>x.subjectId===subject&&x.grade===1&&x.semester===1)!;
    const secondId=c.subjects[1].id;
    const week=updateOperatingCell(doc,secondId,1,1,{weekly:row.weekly,
      adjustment:row.adjustment});
    const choice={id:"43dfc1b3-a65c-4001-955c-168145d20012",name:"선택 묶음",grade:1,semester:1,
      subjectIds:[subject,secondId],requiredCount:1};
    const chosen={...week,choiceSets:[choice]};
    const result=operatingTotals(chosen);
    expect(result.studentTotal).toBe(result.rawTotal-opHours(row));
    expect(result.ambiguous).toHaveLength(0);
    const unequal={...doc,choiceSets:[choice]};
    expect(operatingTotals(unequal).studentTotal).toBeNull();
    expect(validateOperating(unequal).some(s=>s.includes("선택 묶음"))).toBe(true);
  });
  it("respects 1st/2nd semester weeks in source cohort (without overwriting defaults)",()=>{
    const plan=c.plans.find(p=>p.cohort_year===2027)!;
    let special=initializeDesign(c,plan);
    special=withWeeklyHours(special,subject,1,1,3);
    special=withWeeklyHours(special,subject,1,2,3);
    special=withTermWeeks(special,2027,1,{count:17,status:"confirmed"});
    special=withTermWeeks(special,2027,2,{count:16,status:"confirmed"});
    expect(evaluateCell(special,getCell(special,subject,1,1)!).total).toBe(51);
    expect(evaluateCell(special,getCell(special,subject,1,2)!).total).toBe(48);
    const other=source.map(s=>s.cohortYear===2027?{...s,document:special}:s);
    const composed=composeOperating(2027,other);
    expect(composed.cells.find(x=>x.subjectId===subject&&x.grade===1&&x.semester===1)?.weeks).toBe(17);
    expect(composed.cells.find(x=>x.subjectId===subject&&x.grade===1&&x.semester===2)?.weeks).toBe(16);
  });
  it("preserves old curricula when no detailed source exists",()=>{
    const older:SourceCohort[]=[{
      cohortYear:2025,planId:"abc",planVersion:1,documentVersion:0,document:null,
      legacyHours:[{subjectId:subject,grade:3,semester:1,hours:50}],
    }];
    const preview=composeOperating(2027,older);
    const value=preview.cells[0];
    expect(value.weekly).toBe(3);
    expect(value.adjustment).toBe(2);
    expect(value.note).toBe("기존 학기 총시수 이관 차이");
    expect(opHours(value)).toBe(50);
  });
});
