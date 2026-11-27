import { expect,it } from "vitest";
import { compareSnapshots } from "../../src/lib/published-changes";
it("distinguishes additions, deletions and changes and prioritizes affected teachers",()=>{
  const before=new Map([["1",{title:"국어",value:"월 1교시",teacherId:"mine"}],["2",{title:"회의",value:"화"}],["3",{title:"유지",value:"수"}]]);
  const after=new Map([["1",{title:"국어",value:"월 2교시",teacherId:"other"}],["3",{title:"유지",value:"수"}],["4",{title:"신규",value:"금"}]]);
  const rows=compareSnapshots(before,after,new Set(["mine"]));
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({before:"월 1교시",after:"월 2교시",related:true});
  expect(rows.find(r=>r.title==="회의")?.after).toBeUndefined();
  expect(rows.find(r=>r.title==="신규")?.before).toBeUndefined();
});
