import {academicStart, academicEnd, plusDays} from './academic.js';
import {blankEventRow, inYear} from './calendar.js';

export const QUICK_GRADES = [
  {value:'all',label:'전체 학년',grades:[]},
  {value:'1',label:'1학년',grades:[1]},
  {value:'2',label:'2학년',grades:[2]},
  {value:'3',label:'3학년',grades:[3]},
  {value:'1,2',label:'1·2학년',grades:[1,2]},
  {value:'1,3',label:'1·3학년',grades:[1,3]},
  {value:'2,3',label:'2·3학년',grades:[2,3]},
];
export const gradesToChoice = grades => {
  const key=[...(grades||[])].map(Number).sort((a,b)=>a-b).join(',');
  return QUICK_GRADES.some(x=>x.value===key)?key:'all';
};
export const choiceToGrades = choice => QUICK_GRADES.find(x=>x.value===choice)?.grades||[];
export const academicMonthDate = (year,index) => {
  if(!Number.isInteger(year)||!Number.isInteger(index)||index<0||index>11)return null;
  const month=((index+2)%12)+1;
  const y= index<10 ? year : year+1;
  return {year:y,month,key:`${y}-${String(month).padStart(2,'0')}`};
};
export const monthIndexOf = (year,date) => {
  if(!inYear(year,date))return -1;
  const m=Number(date.slice(5,7));
  return m>=3?m-3:m+9;
};
export const moveAcademicMonth = (year,date,delta) => {
  const index=monthIndexOf(year,date);
  const next=academicMonthDate(year,index+delta);
  if(!next)return null;
  const days=new Date(Date.UTC(next.year,next.month,0)).getUTCDate();
  return `${next.key}-${String(Math.min(Number(date.slice(8)),days)).padStart(2,'0')}`;
};
export const moveCalendarDate = (year,date,delta) => {
  const next=plusDays(date,delta);
  return next>=academicStart(year)&&next<=academicEnd(year)?next:null;
};
export const initialQuickEvent=(year,date)=>({...blankEventRow(year),date,id:'',name:'',endDate:''});
export const changeQuickDate=(draft,date)=>({...draft,id:'',name:'',endDate:'',date});

// Keyboard navigation for the contextual event form. Field order is provided by the
// currently rendered controls so the optional subject field works automatically.
export const quickEnterAction=(index,total,{ctrlKey=false,metaKey=false,shiftKey=false}={})=>{
  if(ctrlKey||metaKey)return {type:'save'};
  if(!Number.isInteger(index)||!Number.isInteger(total)||index<0||total<1||index>=total)return {type:'ignore'};
  if(shiftKey)return {type:'focus',index:Math.max(0,index-1)};
  return index===total-1 ? {type:'save'} : {type:'focus',index:index+1};
};
