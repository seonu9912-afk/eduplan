/**
 * Faithful 2026 operating-year school curriculum sheet, transcribed from the
 * teacher-supplied A:Z table.  The source contains independently printed totals,
 * adjustments, fractions and intentional blanks.  Never silently recalculate,
 * normalize or reconcile them with other curriculum documents.
 */
export const ANNUAL_2026_YEAR=2026;
export const ANNUAL_2026_COLUMNS=26;
export type Annual2026Kind="subject"|"subtotal"|"grand"|"footer";
export type Annual2026Section="subject"|"creative"|"free"|"other";
export type Annual2026Row={
  id:string;kind:Annual2026Kind;section:Annual2026Section;
  group:string;subject:string;label?:string;cells:Readonly<Record<number,string>>;
};
function vals(raw:string,width:number):string[]{
  const values=raw.split("|").map(v=>v.trim());
  if(values.length>width)throw Error("2026 운영표 원본 열 개수가 올바르지 않습니다.");
  return Array.from({length:width},(_,i)=>values[i]??"");
}
function row(
  id:string,section:Annual2026Section,group:string,subject:string,
  summary="",regular="",freedom="",freedom2="",grade2="",grade3="",
  kind:Annual2026Kind="subject",
):Annual2026Row{
  const all=[
    ...vals(summary,5),...vals(regular,4),...vals(freedom,3),
    ...vals(freedom2,3),...vals(grade2,4),...vals(grade3,4),
  ];
  const cells:Record<number,string>={};
  all.forEach((value,i)=>{if(value!=="")cells[i+4]=value;});
  return {id,section,group,subject,kind,cells,
    ...(kind!=="subject"?{label:group}:{}),
  };
}
const groupSocial="사회/\n역사/\n도덕";
const groupScience="과학/\n기술·가정/\n정보";
const groupArts="예술\n(음악·미술)";

/** No fixture totals or blanks are replaced by computed values. */
export const ANNUAL_2026_ROWS:readonly Annual2026Row[]=[
  row("korean","subject","국어","국어","442|288|-154|272|-170","48|3|48|3","32|-16|2","","48|3|48|3","48|3|48|3"),
  row("social","subject",groupSocial,"사회","510|128|-190|128|-206","32|2|32|2","32||2","","32|2|32|2"),
  row("history","subject",groupSocial,"역사","|128||128","","","","32|2|32|2","32|2|32|2"),
  row("ethics","subject",groupSocial,"도덕","|64||48","16|1|16|1","|-16","","","16|1|16|1"),
  row("math","subject","수학","수학","374|192|-182|192|-182","32|2|32|2","32||2","","32|2|32|2","32|2|32|2"),
  row("science","subject",groupScience,"과학","680|192|-232|192|-232","32|2|32|2","32||2","","32|2|32|2","32|2|32|2"),
  row("technology","subject",groupScience,"기술·가정","|128||128","32|2|32|2","32||2","","16|1|16|1","16|1|16|1"),
  row("informatics","subject",groupScience,"정보","|128||128","16|1|16|1","16||1","","16|1|16|1","32|2|32|2"),
  row("physical","subject","체육","체육","272|288|16|288|16","48|3|48|3","48||3","","48|3|48|3","48|3|48|3"),
  row("music","subject",groupArts,"음악","272|160|48|160|48","32|2|32|2","32||2","","32|2|32|2","16|1|16|1"),
  row("art","subject",groupArts,"미술","|160||160","32|2|32|2","32||2","","16|1|16|1","32|2|32|2"),
  row("english","subject","영어","영어","340|192|-148|192|-148","32|2|32|2","32||2","","32|2|32|2","32|2|32|2"),
  row("choir","subject","선택","합창실기","170|32|566|32|486","16|1|16|1","16||1"),
  row("ensemble","subject","선택","합주실기","|64||64","","","","32|2|32|2"),
  row("orchestra","subject","선택","문화예술체험(관현악)","|64||64","","","","","32|2|32|2"),
  row("gardening","subject","선택","노작원예","|160||144","32|2","16|-16|1","","32|2|32|2","32|2|32|2"),
  row("craft","subject","선택","공예와 일상","|128||128","32|2|32|2","32||2","","32|2|32|2"),
  row("ceramics","subject","선택","도자조형","|64||64","","","","","32|2|32|2"),
  row("cooking","subject","선택","기초 조리","|64||32","","","","32|2|32|2"),
  row("careerCooking","subject","선택","성공적인직업생활(요리)","|64||64","","","","","32|2|32|2"),
  row("woodwork","subject","선택","창의공작소(목공)","|64||32","32|2|32|2","|-32"),
  row("sewing","subject","선택","생활 공작(재봉)"),
  row("practical","subject","선택","생활 속 노작 활동","|32||32","||32|2"),
  row("schoolAutonomyTotal","other","학교자율시간 교과 시수 합계","","32","0|0|32|2","0|0|0","0|0|0","0|0|0|0","0|0|0|0","subtotal"),
  row("freeSubjectTotal","other","자유학기 교과 시수 합계","","","","384|-80|24","","","","subtotal"),
  row("subjectTotal","other","교과 시수 합계","","3060|2784|-276|2672|-388","464|29|464|29","384|-80|24","","464|29|464|29","464|29|464|29","subtotal"),
  row("club","creative","동아리활동","동아리 활동","306|116|78|100|46","21|1.3|21|1.3","5|-16|0.3","","21|1.3|21|1.3","16|1|16|1"),
  row("sports","creative","동아리활동","학교스포츠클럽","|96||96","16|1|16|1","16||1","","16|1|16|1","16|1|16|1"),
  row("autonomy","creative","자율·자치활동","","|66||66","11|0.7|11|0.7","11||0.7","","11|0.7|11|0.7","11|0.7|11|0.7"),
  row("volunteer","creative","봉사활동","","|10||10","","","","","5|0.3|5|0.3"),
  row("career","creative","진로활동","","|96||80","16|1|16|1","|-16|0","","16|1|16|1","16|1|16|1"),
  row("creativeTotal","other","창의적체험활동 시수 합계","","306|384|78|352|46","64|4|64|4","32|-32|2","","64|4|64|4","64|4|64|4","subtotal"),
  row("freeChoice","free","주제선택활동","","102|||80","","80||5"),
  row("freeCareer","free","진로탐색활동","","|||32","","32||2"),
  row("freeTotal","other","자유학기활동 시수 합계","","102|||112","","112||7","","","","subtotal"),
  row("grandTotal","other","3개년 시수 총계","","3,366|3168|-198|3136|-342","528|33|528|33","528|-112|33","","528|33|528|33","528|33|528|33","grand"),
  row("semesterHours","other","학기당 수업 시수","","","528|33|528|33","","","528|33|528|33","528|33|528|33","footer"),
  row("semesterSubjects","other","학기당 과목 수","","","8(+7)||8(+7)","7(+6)","","8(+7)||8(+7)","8(+7)||8(+7)","footer"),
];
export function sheetValue(rowId:string,column:number,overrides:Readonly<Record<string,string>>={}):string{
  const id=rowId+":"+column;
  if(Object.prototype.hasOwnProperty.call(overrides,id))return overrides[id];
  return ANNUAL_2026_ROWS.find(row=>row.id===rowId)?.cells[column]??"";
}
export function changeSheetValue(
  overrides:Readonly<Record<string,string>>,rowId:string,column:number,input:string,
):Record<string,string>{
  if(column<4||column>26||!ANNUAL_2026_ROWS.some(row=>row.id===rowId))
    throw Error("편집할 수 없는 교육과정 셀입니다.");
  const normalized=input.trim();
  if(normalized.length>48)throw Error("셀 내용은 48자 이내로 입력해 주세요.");
  const key=rowId+":"+column;
  const next={...overrides};
  const original=ANNUAL_2026_ROWS.find(row=>row.id===rowId)?.cells[column]??"";
  if(normalized===original)delete next[key];
  else next[key]=normalized;
  return next;
}
export type Annual2026CustomRow={
  id:string;afterId:string;section:"subject"|"creative"|"free";group:string;subject:string;
};
export function orderedSheetRows(customRows:readonly Annual2026CustomRow[]=[]):Annual2026Row[]{
  const built:Annual2026Row[]=[];
  const seen=new Set<string>();
  function add(item:Annual2026Row){
    built.push(item);
    for(const child of customRows){
      if(child.afterId!==item.id||seen.has(child.id))continue;
      if(child.section!==item.section||child.group!==item.group)continue;
      seen.add(child.id);
      add({id:child.id,section:child.section,group:child.group,
        subject:child.subject,kind:"subject",cells:{}});
    }
  }
  for(const item of ANNUAL_2026_ROWS)add(item);
  return built;
}
export function sheetMergeInfo(index:number,rows:readonly Annual2026Row[]=ANNUAL_2026_ROWS):{
  categoryLabel?:string;categorySpan?:number;groupLabel?:string;groupSpan?:number
}{
  const item=rows[index];
  if(!item||item.kind!=="subject"&&item.section==="other")return {};
  const categoryLabel=item.section==="subject"?"교과\n(군)":item.section==="creative"?"창의적\n체험\n활동":"자유\n학기\n활동";
  const previous=rows[index-1],sameSection=previous?.section===item.section;
  const categorySpan=sameSection?undefined:rows.slice(index).findIndex(row=>row.section!==item.section);
  const groupStarts=!sameSection||previous?.group!==item.group;
  const groupSpan=groupStarts?rows.slice(index).findIndex(row=>row.section!==item.section||row.group!==item.group):undefined;
  const restSection=rows.filter((row,j)=>j>=index&&row.section===item.section).length;
  const restGroup=rows.filter((row,j)=>j>=index&&row.section===item.section&&row.group===item.group).length;
  return {
    ...(sameSection?{}:{categoryLabel,categorySpan:categorySpan===-1?restSection:categorySpan}),
    ...(groupStarts?{groupLabel:item.group,groupSpan:groupSpan===-1?restGroup:groupSpan}:{}),
  };
}
export const SOURCE_2026_SUMMARY={
  publishedSubjectTotal:"3,136",
  printedSemesterHours:"528",
  warning:"원본의 3개년 자유학기제 총계(3,136)와 학기당 수업 시수(528×6=3,168)가 다릅니다. 입력값을 자동 보정하지 않습니다.",
} as const;
