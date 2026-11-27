import { createClient } from "@/lib/supabase/server";
import { calendarFeedIcs,calendarFeedSchema } from "@/lib/calendar-feed";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive"};
export async function GET(request:Request){
  const token=new URL(request.url).searchParams.get("token");
  if(!token||!/^[0-9a-f]{64}$/.test(token))return new Response("Not found",{status:404,headers});
  const db=await createClient();
  const result=await db.rpc("calendar_feed_read",{token});
  if(result.error)return new Response("Calendar temporarily unavailable",{status:503,headers});
  const feed=calendarFeedSchema.safeParse(result.data);
  if(!feed.success)return new Response("Not found",{status:404,headers});
  return new Response(calendarFeedIcs(feed.data,new Date()),{headers:{...headers,"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":"inline; filename=eduplan.ics"}});
}
