import { describe, expect, it } from "vitest";
import { curriculumGroupRank, MIDDLE_GROUP_LABELS, orderedCurriculumGroups,
  orderedCurriculumSubjects } from "../../src/lib/curriculum-group-order";

describe("national-order curriculum group display", () => {
  it("follows both school workbook orders, independent of Supabase row insertion", () => {
    const labels = [
      "동아리활동", "선택", "예술\n(음악·미술)", "영어",
      "국어", "자유학기 활동", "과학/\n기술·가정/\n정보",
      "수학", "학교자율시간", "체육", "사회/\n역사/\n도덕",
    ];
    const groups = labels.map((name,i)=>({id:String(i),name})).reverse();
    expect(orderedCurriculumGroups(groups).map(group=>curriculumGroupRank(group.name)))
      .toEqual([0,1,2,3,4,5,6,7,8,9,10]);
    expect(MIDDLE_GROUP_LABELS).toHaveLength(11);
    expect(groups.map(group=>group.name)).toEqual([...labels].reverse());
  });
  it("keeps distinct groups inside combined national groups in a known order", () => {
    const groups = ["정보","역사","미술","사회","기술·가정","예술","도덕","과학","음악"]
      .map((name,i)=>({id:String(i),name}));
    expect(orderedCurriculumGroups(groups).map(g=>g.name)).toEqual([
      "사회","역사","도덕","과학","기술·가정","정보","예술","음악","미술",
    ]);
  });
  it("sorts new school-custom groups consistently without moving existing subjects within a group", () => {
    const groups=[
      {id:"customB",name:"특색교육B"},{id:"english",name:"영어"},
      {id:"customA",name:"특색교육A"},{id:"korean",name:"국어"},
      {id:"creative",name:"창의적 체험활동"},{id:"generic",name:"교과"},
    ];
    const subjects=[
      {id:"B",group_id:"customB"},{id:"E",group_id:"english"},
      {id:"C",group_id:"korean"},{id:"A",group_id:"customA"},
      {id:"D",group_id:"korean"},{id:"F",group_id:"creative"},
      {id:"G",group_id:"generic"},
    ];
    expect(orderedCurriculumGroups(groups).map(x=>x.id))
      .toEqual(["korean","english","generic","creative","customA","customB"]);
    expect(orderedCurriculumSubjects(subjects,groups).map(x=>x.id))
      .toEqual(["C","D","E","G","F","A","B"]);
    expect(subjects.map(x=>x.id)).toEqual(["B","E","C","A","D","F","G"]);
  });
  it("is deterministic even for previously unknown group IDs", () => {
    const groups=[{id:"1",name:"영어"}];
    const subjects=[
      {id:"unknown",group_id:"unregistered"},
      {id:"english",group_id:"1"},
    ];
    expect(orderedCurriculumSubjects(subjects,groups).map(s=>s.id)).toEqual(["english","unknown"]);
  });
});
