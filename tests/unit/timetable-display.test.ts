import {it,expect} from "vitest";
import {commonPeriodTime,lessonTime} from "../../src/lib/timetable-display";
const day=(start:string,end:string)=>({teaching:true,periodCount:1,allCells:[{period:1,start,end}]});
it("shows row times only when all operating days agree",()=>{
 expect(commonPeriodTime([day("09:00","09:45"),day("09:00","09:45")],1)).toEqual({start:"09:00",end:"09:45"});
 expect(commonPeriodTime([day("09:00","09:45"),day("09:20","10:00")],1)).toBeNull();
 expect(commonPeriodTime([day("09:00","09:45"),{...day("09:00","09:45"),allCells:[]}],1)).toBeNull();
 expect(lessonTime({start:"09:45",end:"09:00"})).toBeNull();
});
