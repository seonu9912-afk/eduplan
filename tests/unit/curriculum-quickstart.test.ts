import {describe,expect,it} from "vitest";
import {missingStandardGroups,parseSubjectLines} from "../../src/lib/curriculum-quickstart";
import {MIDDLE_2022_GROUPS} from "../../src/lib/curriculum-design";

describe("simple curriculum three-step start",()=>{
  it("accepts pasted subject names one per line without creating blank subjects",()=>{
    expect(parseSubjectLines("국어\n 사회 \r\n\n역사\n도덕\n")).toEqual([
      "국어","사회","역사","도덕",
    ]);
  });
  it("does not disguise accidental duplicate names from one paste",()=>{
    expect(parseSubjectLines("요리\n요리")).toEqual(["요리","요리"]);
  });
  it("prepares missing national groups without replacing school aliases",()=>{
    const missing=missingStandardGroups([{name:"사회/역사/도덕"},{name:"국어"},{name:"학교자율시간"}]);
    expect(missing).not.toContain("국어");
    expect(missing).not.toContain("사회(역사 포함)/도덕");
    expect(missing).toContain("수학");
    expect(missing.length).toBe(MIDDLE_2022_GROUPS.length-2);
  });
  it("does not change existing school groups and only supplies empty national shells",()=>{
    const school=[{name:"국어"},{name:"선택"},{name:"학교 특색 활동"}];
    const snapshot=JSON.stringify(school);
    const missing=missingStandardGroups(school);
    expect(JSON.stringify(school)).toBe(snapshot);
    expect(missing).not.toContain("선택");
    expect(missing).toContain("창의적 체험활동");
  });
});
