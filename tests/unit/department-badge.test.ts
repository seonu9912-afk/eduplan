import { expect, it } from "vitest";
import { departmentBadgeInfo } from "../../src/lib/department-badge";
it("uses stable department colors for standard names and arbitrary custom names", () => {
  expect(departmentBadgeInfo("교무지원부")).toEqual({name:"교무지원부", short:"교무", color:"blue"});
  expect(departmentBadgeInfo("교육과정지원부").color).toBe("amber");
  expect(departmentBadgeInfo("학생활동지원부").color).toBe("rose");
  expect(departmentBadgeInfo("기숙사지원부").color).toBe("purple");
  expect(departmentBadgeInfo("방과후학교지원부").color).toBe("green");
  expect(departmentBadgeInfo("행정실").color).toBe("slate");
  expect(departmentBadgeInfo("  특수교육부 ")).toEqual(departmentBadgeInfo("특수교육부"));
  expect(departmentBadgeInfo(undefined).name).toBe("학교");
});
