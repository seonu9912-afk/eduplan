import {expect,it} from "vitest";
import {calendarFeedIcs,foldIcs,mergeFeedItems} from "../../src/lib/calendar-feed";
it("merges adjacent published spans, escapes text, and uses exclusive all-day end dates",()=>{
const items=[{id:"event",title:"독서, 주간;\n안내",start:"2026-11-25",end:"2026-11-26"},{id:"event",title:"독서, 주간;\n안내",start:"2026-11-27",end:"2026-11-27"}];
expect(mergeFeedItems(items)).toHaveLength(1);
const ics=calendarFeedIcs({name:"학교",items},new Date("2026-11-01T00:00:00Z"));
expect(ics).toContain("DTEND;VALUE=DATE:20261128");
expect(ics).toContain("SUMMARY:독서\\, 주간\\;\\n안내");
expect(foldIcs("SUMMARY:"+"가".repeat(50)).split("\r\n").every(l=>Buffer.byteLength(l)<=75)).toBe(true);
});
