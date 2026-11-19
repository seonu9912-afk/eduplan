import {describe,it,expect} from "vitest";
import {
  creativeSubjectsForRevision,isCreativeGroup,middleCurriculumCatalog,
  middleRevisionForCohort,
} from "../../src/lib/middle-curriculum";

describe("2015/2022 middle school baseline catalog",()=>{
  it("selects the revision by admission year, not the current calendar year",()=>{
    expect(middleRevisionForCohort(2024)).toBe("2015");
    expect(middleRevisionForCohort(2025)).toBe("2022");
    expect(middleRevisionForCohort(2027)).toBe("2022");
  });
  it("keeps 2015 language subject names distinct from 2022 생활- names",()=>{
    const old=middleCurriculumCatalog("2015").groups.find(group=>group.name==="선택")!;
    const now=middleCurriculumCatalog("2022").groups.find(group=>group.name==="선택")!;
    expect(old.subjects).toContain("독일어");
    expect(old.subjects).not.toContain("생활 독일어");
    expect(now.subjects).toContain("생활 독일어");
    expect(now.subjects).not.toContain("독일어");
    expect(now.subjects.filter(name=>name.startsWith("생활 "))).toHaveLength(8);
  });
  it("preserves national groups without mixing creative activities in subjects",()=>{
    const catalog=middleCurriculumCatalog("2022");
    expect(catalog.groups).toHaveLength(8);
    expect(catalog.groups.flatMap(group=>group.subjects)).not.toContain("동아리 활동");
    expect(catalog.creative.name).toBe("창의적 체험활동");
    expect(creativeSubjectsForRevision("2015")).toEqual([
      "자율 활동","동아리 활동","봉사 활동","진로 활동",
    ]);
    expect(creativeSubjectsForRevision("2022")).toEqual([
      "자율·자치 활동","동아리 활동","진로 활동",
    ]);
    expect(isCreativeGroup("창의적 체험활동")).toBe(true);
    expect(isCreativeGroup("예술(음악/미술)")).toBe(false);
  });
});
