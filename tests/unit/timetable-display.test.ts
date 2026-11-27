import {it,expect} from "vitest";
import {commonPeriodTime,lessonTime,periodChangeBadge} from "../../src/lib/timetable-display";
const day=(start:string,end:string)=>({teaching:true,periodCount:1,allCells:[{period:1,start,end}]});
it("shows row times only when all operating days agree",()=>{
 expect(commonPeriodTime([day("09:00","09:45"),day("09:00","09:45")],1)).toEqual({start:"09:00",end:"09:45"});
 expect(commonPeriodTime([day("09:00","09:45"),day("09:20","10:00")],1)).toBeNull();
 expect(commonPeriodTime([day("09:00","09:45"),{...day("09:00","09:45"),allCells:[]}],1)).toBeNull();
 expect(lessonTime({start:"09:45",end:"09:00"})).toBeNull();
});

it("labels only actual changed bell times and distinguishes shorter lessons",()=>{
 expect(periodChangeBadge("08:50–09:35","08:50–09:25")).toBe("단축");
 expect(periodChangeBadge("08:50–09:35","09:00–09:45")).toBe("변경");
 expect(periodChangeBadge("08:50–09:35","08:50–09:35")).toBeUndefined();
 expect(periodChangeBadge("미설정","08:50–09:35")).toBeUndefined();
 expect(periodChangeBadge("08:50–09:35","미설정")).toBeUndefined();
});
