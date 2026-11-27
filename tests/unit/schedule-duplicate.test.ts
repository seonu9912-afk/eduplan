import { expect,it } from "vitest";
import type { EventDraft } from "../../src/lib/academic-calendar";
import { duplicateEventDraft } from "../../src/lib/schedule-duplicate";
const source:EventDraft={event:{id:"original",workspace_id:"school",school_id:null,academic_year_id:"year",title:"독서 주간",start_date:"2026-11-25",end_date:"2026-11-27",event_type:"school",target_grades:[2],target_class_ids:[],department:"교육과정",description:"",activity_area:"없음",version:2,created_by:"old",updated_at:""},slots:{"g:2":{"2026-11-25":{2:"자율"},"2026-11-27":{4:"진로"}},"c:class":{"2026-11-26":{3:"교과"}}}};
it("copies duration and moves grade and class allocations without mutating the source",()=>{
  const copy=duplicateEventDraft(source,"2026-12-02",2026,"user","copy");
  expect(copy.event).toMatchObject({id:"copy",version:0,created_by:"user",start_date:"2026-12-02",end_date:"2026-12-04"});
  expect(copy.slots).toEqual({"g:2":{"2026-12-02":{2:"자율"},"2026-12-04":{4:"진로"}},"c:class":{"2026-12-03":{3:"교과"}}});
  expect(source.event.id).toBe("original");
  expect(source.slots["g:2"]["2026-11-25"][2]).toBe("자율");
  expect(()=>duplicateEventDraft(source,"2027-02-27",2026,"user","copy")).toThrow();
});
