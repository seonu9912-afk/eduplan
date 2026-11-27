import {expect,it} from "vitest";
import {scheduleListGroups} from "../../src/lib/schedule-list-view";
import type {ScheduleEntry} from "../../src/lib/school-schedule";
it("groups consecutive effective days once and keeps operation items",()=>{
  const dates=["2026-11-25","2026-11-26","2026-11-27"];
  const reading:ScheduleEntry={id:"reading",date:dates[0],end:dates[2],title:"가을 독서 주간",tone:"event"};
  const duty:ScheduleEntry={id:"duty",date:dates[1],end:dates[1],title:"등교 지도",tone:"work",operationGroup:"등교 지도"};
  const days=new Map(dates.map(date=>[date,{entries:date===dates[1]?[reading,duty]:[reading]}]));
  expect(scheduleListGroups(dates,days)).toEqual([{date:dates[0],rows:[{entry:reading,from:dates[0],to:dates[2]}]},{date:dates[1],rows:[{entry:duty,from:dates[1],to:dates[1]}]}]);
  expect(scheduleListGroups([dates[0],dates[2]],days)).toHaveLength(2);
});
