// Geometry of a 12-month-by-31-day school-year grid. No browser or React dependency.
const pad=n=>String(n).padStart(2,'0');
const ym=(y,m)=>`${y}-${pad(m)}`;
export const monthDays=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
export const inAcademicYear=(year,date)=>typeof date==='string'&&date>=`${year}-03-01`&&date<=`${year+1}-02-${pad(monthDays(year+1,2))}`;
export function gridDestination(year,date,key){
  if(!inAcademicYear(year,date))return null;
  const [y,m,d]=date.split('-').map(Number);
  let next=date;
  if(key==='ArrowUp'||key==='ArrowDown'){
    next=`${ym(y,m)}-${pad(Math.max(1,Math.min(monthDays(y,m),d+(key==='ArrowUp'?-1:1))))}`;
  }else if(['ArrowLeft','ArrowRight','PageUp','PageDown'].includes(key)){
    const shift=(key==='ArrowLeft'||key==='PageUp')?-1:1;
    const dest=new Date(Date.UTC(y,m-1+shift,1));
    const ny=dest.getUTCFullYear(),nm=dest.getUTCMonth()+1;
    next=`${ym(ny,nm)}-${pad(Math.min(d,monthDays(ny,nm)))}`;
  }else if(key==='Home')next=`${ym(y,m)}-01`;
  else if(key==='End')next=`${ym(y,m)}-${pad(monthDays(y,m))}`;
  return inAcademicYear(year,next)?next:null;
}
