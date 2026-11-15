// Workspace navigation defaults and school-year aware schedule links.
export function preferredDateForWorkspace(id,exampleId,today){return id===exampleId?'2027-03-08':today;}
export function academicYearOfDate(date){const year=Number(String(date).slice(0,4)),month=Number(String(date).slice(5,7));return Number.isInteger(year)&&month>=1&&month<=12?year-(month<3?1:0):null;}
export function countPastedRows(text){return String(text||'').replace(/\r/g,'').split('\n').filter(x=>x.trim()).length;}
export function bulkHasIncompleteRows(rows){return (rows||[]).findIndex(r=>!String(r.title||'').trim()&&[r.time,r.place,r.target,r.note].some(v=>String(v||'').trim()));}
