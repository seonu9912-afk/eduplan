import {expect,it} from "vitest";
import {defaultAnnual} from "../../src/lib/academic";
import {mergeWorkSettings,transferDate,transferWorkEvents,transferPeriods} from "../../src/lib/year-transfer";
it("preserves destination settings and skips duplicate or personal work assignments",()=>{
const a=defaultAnnual([1]),b=defaultAnnual([1]);a.departments=["연구부"];b.departments=["교무부"];a.workSettings={dutyEnabled:true};const m=mergeWorkSettings(a,b);
expect(m.result.departments).toEqual(["교무부","연구부"]);expect(m.result.workSettings?.operationNames).toContain("당직");
a.business=[{id:"a",date:"2028-02-29",kind:"업무",department:"연구부",text:"협의회",participants:"교원",resources:[]},{id:"b",date:"2028-02-29",kind:"출장",department:"연구부",text:"출장"}];
const r=transferWorkEvents(a,m.result,1,()=>"new");expect(r.result.business).toHaveLength(1);expect(r.result.business[0].date).toBe("2029-02-28");expect(r.result.business[0].participants).toBeUndefined();expect(transferWorkEvents(a,r.result,1,()=>"new2").result.business).toHaveLength(1);
expect(transferDate("2028-02-29",1)).toBe("2029-02-28");
expect(transferPeriods(a,b,[1]).items.every(x=>x.state==="skip")).toBe(true);
});
