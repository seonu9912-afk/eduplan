import {it,expect} from "vitest";
import {versionState,aggregatePlanUnits} from "../../src/lib/plan-overview";
it("never treats missing or older drafts as current publication",()=>{
expect(versionState(undefined,undefined)).toBe("empty");
expect(versionState(undefined,1)).toBe("unknown");
expect(versionState(2,undefined)).toBe("draft");
expect(versionState(2,1)).toBe("changed");
expect(versionState(2,2)).toBe("published");
expect(versionState(1,2)).toBe("unknown");
expect(aggregatePlanUnits([{state:"published"},{state:"empty"}])).toBe("partial");
expect(aggregatePlanUnits([{state:"published"},{state:"changed"}])).toBe("changed");
expect(aggregatePlanUnits([{state:"published"},{state:"unknown"}])).toBe("unknown");
});
