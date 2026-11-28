import "server-only";
import {createClient} from "./supabase/server";
import {teachingDeadlineDataSchema,type TeachingDeadlineData} from "./teaching-submissions";
export async function loadTeachingDeadlines(workspace:string,year:string):Promise<TeachingDeadlineData|null>{
  const db=await createClient();
  const {data,error}=await db.rpc("teaching_deadline_data",{target:workspace,year_id:year});
  const parsed=teachingDeadlineDataSchema.safeParse(data);
  return !error&&parsed.success?parsed.data:null;
}
