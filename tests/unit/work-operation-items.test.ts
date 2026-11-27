import { expect, it } from "vitest";
import { defaultAnnual, annualSchema } from "../../src/lib/academic";
import { operationNames, visibleWorkItem, workItemTitle } from "../../src/lib/work-operation-items";
it("preserves legacy duty and hides inactive custom assignments without deleting records", () => {
 const plan=defaultAnnual();
 expect(operationNames(plan)).toEqual([]);
 const old={id:"1",date:"2026-11-27",department:"교무부",kind:"당직" as const,text:"김 교사"};
 expect(operationNames({...plan,workSettings:{dutyEnabled:true},business:[old]})).toEqual(["당직"]);
 const row={...old,kind:"운영업무" as const,operationName:"급식 지도"};
 const active={...plan,workSettings:{dutyEnabled:false,operationNames:["급식 지도"]},business:[old,row]};
 expect(annualSchema.safeParse(active).success).toBe(true);
 expect(visibleWorkItem(active,row)).toBe(true);
 expect(visibleWorkItem(active,old)).toBe(false);
 expect(workItemTitle(row)).toBe("급식 지도 · 김 교사");
 expect(visibleWorkItem({...active,workSettings:{dutyEnabled:false,operationNames:[]}},row)).toBe(false);
});
