import type {TeacherDirectory} from "./staffing";
export const emptyStaffFilters=()=>({query:"",subject:"",department:"",homeroom:"",account:"",active:""});
const normalize=(s:string)=>s.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/g,"");
export function filterStaffDirectory<T extends TeacherDirectory>(people:readonly T[], f:ReturnType<typeof emptyStaffFilters>, subjects:ReadonlyMap<string,string>):T[]{
 const q=normalize(f.query);
 return people.filter(p=>
 (!q||[p.display_name,p.department,p.duties,...p.subject_ids.map(id=>subjects.get(id)??"")].some(v=>normalize(v).includes(q)))&&
 (!f.subject||p.subject_ids.includes(f.subject))&&(!f.department||p.department===f.department)&&
 (!f.homeroom||(f.homeroom==="yes")===!!p.homeroom_class_id)&&
 (!f.account||(f.account==="yes")===!!p.user_id)&&(!f.active||(f.active==="yes")===p.active)
 );
}
