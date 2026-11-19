import { describe, expect, it } from "vitest";
import { middleRevisionForCohort, middleSubjectCatalog } from "@/lib/middle-curriculum";

describe("middle school curriculum templates", () => {
  it("uses the correct cohort-level revision", () => {
    expect(middleRevisionForCohort(2024)).toBe("2015");
    expect(middleRevisionForCohort(2025)).toBe("2022");
    expect(middleRevisionForCohort(2026)).toBe("2022");
  });
  it("includes every common subject group and the eight living foreign languages", () => {
    const catalog = middleSubjectCatalog("2022");
    expect(catalog).toHaveLength(9);
    expect(catalog.find((group) => group.name === "선택")?.subjects).toContain("생활 베트남어");
    expect(catalog.find((group) => group.name === "과학/기술·가정/정보")?.subjects).toEqual(["과학", "기술·가정", "정보"]);
    expect(catalog.flatMap((group) => group.subjects)).toHaveLength(
      new Set(catalog.flatMap((group) => group.subjects)).size,
    );
  });
  it("keeps creative experiential activity areas distinct between revisions", () => {
    expect(middleSubjectCatalog("2015").at(-1)?.subjects).toEqual([
      "자율 활동", "동아리 활동", "봉사 활동", "진로 활동",
    ]);
    expect(middleSubjectCatalog("2022").at(-1)?.subjects).toEqual([
      "자율·자치 활동", "동아리 활동", "진로 활동",
    ]);
  });
});
