// School-agnostic monthly/weekly operations planning. Browser-free pure helpers.
const pad=n=>String(n).padStart(2,'0');
export const isoDate=d=>`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
export const dateValue=s=>new Date(`${s}T12:00:00Z`);
export const addDays=(s,n)=>isoDate(new Date(dateValue(s).getTime()+n*86400000));
export const isDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;return isoDate(dateValue(s))===s;};
export const mondayOf=s=>addDays(s,-((dateValue(s).getUTCDay()+6)%7));
export const weekDates=(s,saturday=true)=>Array.from({length:saturday?6:5},(_,i)=>addDays(mondayOf(s),i));
export const calendarMonth=(month)=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return [];const first=`${month}-01`,offset=dateValue(first).getUTCDay();const year=Number(month.slice(0,4)),m=Number(month.slice(5,7)),len=new Date(Date.UTC(year,m,0,12)).getUTCDate();return Array.from({length:Math.ceil((offset+len)/7)*7},(_,i)=>{const n=i-offset+1;return n>=1&&n<=len?`${month}-${pad(n)}`:null;});};
export const shiftMonth=(month,delta)=>{const d=dateValue(`${month}-01`);d.setUTCMonth(d.getUTCMonth()+delta);return isoDate(d).slice(0,7);};
export const departmentColors=['#4C78BD','#CF8444','#A05BC6','#1D937C','#D66583','#71819B','#8D7FCA','#BA8553'];
export const defaultDepartments=[{id:'dept-general',name:'교무부',short:'교무',color:'#4C78BD',active:true},{id:'dept-curriculum',name:'교육과정부',short:'교육과정',color:'#CF8444',active:true},{id:'dept-students',name:'학생생활부',short:'학생',color:'#D66583',active:true},{id:'dept-research',name:'연구부',short:'연구',color:'#8D7FCA',active:true},{id:'dept-admin',name:'행정실',short:'행정',color:'#71819B',active:true}];
export const defaultSettings={departments:defaultDepartments,dutyEnabled:false,showSaturday:true,showAcademic:true,showTasks:false};
export function planningSettings(space){const s=space?.planningSettings||{};const departments=Array.isArray(s.departments)&&s.departments.length?s.departments:defaultDepartments;return {...defaultSettings,...s,departments};}
export const planEntries=space=>Array.isArray(space?.planEntries)?space.planEntries:[];
export const planTrips=space=>Array.isArray(space?.planTrips)?space.planTrips:[];
export const planDuties=space=>Array.isArray(space?.planDuties)?space.planDuties:[];
export const planDiscussions=space=>Array.isArray(space?.planDiscussions)?space.planDiscussions:[];
export const planNotices=space=>Array.isArray(space?.planNotices)?space.planNotices:[];
export const planReviews=space=>space?.planReviews&&typeof space.planReviews==='object'?space.planReviews:{};
export function validateEntry(entry){if(!isDate(entry.date))return '올바른 날짜를 입력해 주세요.';if(!(entry.title||'').trim())return '일정 내용을 입력해 주세요.';if(!(entry.department||'').trim())return '담당 부서를 선택해 주세요.';if(String(entry.title).length>250)return '일정 내용은 250자 이내로 입력해 주세요.';return ''};
export function normalizeEntry(input,id){return {id:id||input.id,date:input.date,department:(input.department||'').trim(),title:(input.title||'').trim(),time:(input.time||'').trim(),place:(input.place||'').trim(),target:(input.target||'').trim(),note:(input.note||'').trim(),monthly:input.monthly!==false,weekly:input.weekly!==false,order:Number(input.order)||0,updatedAt:new Date().toISOString()};}
export function scheduleRows(space,rangeStart,rangeEnd,settings=planningSettings(space),mode='week'){
  const matches=s=>isDate(s)&&s>=rangeStart&&s<=rangeEnd;
  const manual=planEntries(space).filter(x=>matches(x.date)&&(mode==='month'?x.monthly!==false:x.weekly!==false)).map(x=>({...x,source:'plan',kind:'계획',editable:true}));
  const academic=settings.showAcademic!==false?(space.events||[]).flatMap(x=>{
    if(!isDate(x.date))return [];
    const end=isDate(x.endDate)&&x.endDate>=x.date?x.endDate:x.date;
    // Multi-day field trips and school events must appear on every affected day.
    // Cap expansion to the requested range to avoid expanding an unbounded import.
    const start=x.date>rangeStart?x.date:rangeStart,finish=end<rangeEnd?end:rangeEnd;
    if(start>finish)return [];
    const items=[];for(let date=start;date<=finish&&items.length<367;date=addDays(date,1)){
      const day= Math.round((dateValue(date)-dateValue(x.date))/86400000)+1;
      const suffix=end!==x.date?` (${day}일차)`:'';
      items.push({id:`academic-${x.id}-${date}`,refId:x.id,date,title:`${x.name}${suffix}`,department:x.department||'학사',time:'',place:'',target:x.grades?.length?`${x.grades.join('·')}학년`:'',note:'',source:'academic',kind:'학사',editable:false});
    }return items;
  }):[];
  const tasks=settings.showTasks===true?(space.tasks||[]).filter(x=>matches(x.due)).map(x=>({id:`task-${x.id}`,refId:x.id,date:x.due,title:x.title,department:x.department||'업무',time:'',place:'',target:'',note:x.status||'',source:'task',kind:'마감',editable:false})) : [];
  const order=new Map(settings.departments.map((d,i)=>[d.name,i]));
  return [...manual,...academic,...tasks].sort((a,b)=>a.date.localeCompare(b.date)||(order.get(a.department)??999)-(order.get(b.department)??999)||(a.order||0)-(b.order||0)||a.title.localeCompare(b.title,'ko'));
}
export function monthKey(date){return date.slice(0,7)}
export function reviewKey(month,department){return `${month}|${department}`}
export function staleReview(reviews,month,department){const key=reviewKey(month,department);if(!reviews[key])return reviews;return {...reviews,[key]:{...reviews[key],stale:true}};}
export function affectedReview(reviews,oldEntry,newEntry){let next={...reviews};const unique=new Set([oldEntry&&`${monthKey(oldEntry.date)}|${oldEntry.department}`,newEntry&&`${monthKey(newEntry.date)}|${newEntry.department}`].filter(Boolean));for(const key of unique){if(next[key])next[key]={...next[key],stale:true};}return next;}
// Safe text export: formula injection is prevented for user-entered values.
export function csvText(rows){const cell=value=>{const raw=String(value??'');const s=/^\s*[=+@\-]/.test(raw)?`'${raw}`:raw;return `"${s.replaceAll('"','""')}"`;};return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');}
export function tsvImport(text,defaultDepartment=''){
  const rows=String(text||'').replace(/\r/g,'').split('\n').filter(x=>x.trim());return rows.slice(0,300).map((line,index)=>{const cols=line.split('\t').map(x=>x.trim());const date=cols[0]?.replace(/\./g,'-');const normalized=date&&/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)?date.split('-').map((x,i)=>i?pad(x):x).join('-'):date;return {date:normalized||'',department:cols[1]||defaultDepartment,title:cols[2]||'',time:cols[3]||'',place:cols[4]||'',target:cols[5]||'',note:cols[6]||'',monthly:true,weekly:true,row:index+1};});
}
