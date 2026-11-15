import {academicStart,academicEnd,rangeDates,getTerm2Start} from './academic.js';
import {isInstructionDate,gradeIds} from './calendar.js';

export const CREATIVE_FIELDS=['creative_self','creative_club','creative_career','sports','volunteer'];
export const CREATIVE_LABELS={creative_self:'자율·자치',creative_club:'동아리',creative_career:'진로',sports:'학교스포츠클럽',volunteer:'봉사(참고)'};
export const summarizeEventHours=(plan,events=[])=>{
  const year=Number(plan.year),grades=gradeIds(plan);
  const counters={};
  for(const grade of grades){counters[grade]={first:Object.fromEntries(CREATIVE_FIELDS.map(k=>[k,0])),second:Object.fromEntries(CREATIVE_FIELDS.map(k=>[k,0])),undetermined:Object.fromEntries(CREATIVE_FIELDS.map(k=>[k,0]))};}
  const excluded=[];
  for(const event of events){
    if(!event.affectsTimetable||!event.curriculumArea||event.curriculumArea==='none')continue;
    const targetGrades=(event.grades||[]).length?event.grades.map(Number):grades;
    const from=event.date,to=event.endDate||from;
    if(!from||!to||from>to)continue;
    const area=event.curriculumArea;
    const periods=Number(event.periodEnd)-Number(event.periodStart)+1;
    if(!Number.isInteger(periods)||periods<1||periods>12)continue;
    for(const d of rangeDates(from,to)){
      if(d<academicStart(year)||d>academicEnd(year))continue;
      for(const g of targetGrades){
        if(!counters[g])continue;
        if(!isInstructionDate(plan,d,g)){excluded.push({date:d,grade:g,event:event.name});continue;}
        const termStart=getTerm2Start(plan,g)||getTerm2Start(plan);
        const term=termStart?(d>=termStart?'second':'first'):'undetermined';
        if(CREATIVE_FIELDS.includes(area)&&area!=='volunteer')counters[g][term][area]+=periods;
        if(event.volunteer)counters[g][term].volunteer+=periods;
      }
    }
  }
  return {grades,counters,excluded};
};
