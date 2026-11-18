import {describe,expect,it} from "vitest";
import {recoveryPreviewContext} from "../../src/app/recovery-preview/fixture";
import {
  initializeDesign,evaluateCell,getCell,withWeeklyHours,withTermWeeks,
} from "../../src/lib/curriculum-design";
import {basisForCohort,reviewCohort} from "../../src/lib/curriculum-workbench";
import {orderedCurriculumGroups,orderedCurriculumSubjects}
  from "../../src/lib/curriculum-group-order";

describe("2026 curriculum simplified three-step workflow calculations",()=>{
  const fixture=recoveryPreviewContext();
  const plan=fixture.plans.find(p=>p.cohort_year===2027)!;
  const subject=fixture.subjects[0];
  const context={...fixture,groups:fixture.groups.map(g=>g.id===subject.group_id?
    {...g,name:"국어"}:g)};
  it("recognizes 5-4-4 weekly Korean as 442 hours with 17-week semesters",()=>{
    let doc=initializeDesign(context,plan);
    for(let grade=1;grade<=3;grade++){
      const year=2027+grade-1;
      for(const semester of [1,2] as const){
        doc=withTermWeeks(doc,year,semester,{count:17,status:"confirmed"});
        doc=withWeeklyHours(doc,subject.id,grade,semester,grade===1?5:4);
      }
    }
    const hours=doc.cells.filter(cell=>cell.subjectId===subject.id)
      .reduce((sum,cell)=>sum+evaluateCell(doc,cell).total,0);
    expect(hours).toBe(442);
    expect(basisForCohort(2027).groupRules.find(g=>g.key==="국어")?.hours).toBe(442);
  });
  it("calculated hours follow separate semester week settings without data duplication",()=>{
    const original=initializeDesign(context,plan);
    let edited=withTermWeeks(original,2027,1,{count:17,status:"confirmed"});
    edited=withTermWeeks(edited,2027,2,{count:16,status:"confirmed"});
    edited=withWeeklyHours(edited,subject.id,1,1,3);
    edited=withWeeklyHours(edited,subject.id,1,2,3);
    expect(evaluateCell(edited,getCell(edited,subject.id,1,1)!).total).toBe(51);
    expect(evaluateCell(edited,getCell(edited,subject.id,1,2)!).total).toBe(48);
    expect(original.termWeeks).toBeUndefined();
    expect(reviewCohort(context,edited).basis.version).toBe("2022");
  });
  it("keeps nationally ordered groups while retaining registered subject positions",()=>{
    const groups=orderedCurriculumGroups([
      {id:"english",name:"영어"},{id:"science",name:"과학/기술·가정/정보"},
      {id:"korean",name:"국어"},{id:"elective",name:"선택"},
    ]);
    expect(groups.map(x=>x.name)).toEqual(["국어","과학/기술·가정/정보","영어","선택"]);
    const list=orderedCurriculumSubjects([
      {id:"b",group_id:"elective",curriculum_position:2},
      {id:"a",group_id:"elective",curriculum_position:1},
      {id:"c",group_id:"korean",curriculum_position:null},
    ],groups);
    expect(list.map(x=>x.id)).toEqual(["c","a","b"]);
  });
});
