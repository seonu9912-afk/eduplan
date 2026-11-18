import type { Context } from "./models";
import { orderedCurriculumSubjects } from "./curriculum-group-order";
import { evaluateCell, getCell, matchGroup, MIDDLE_2022_GROUPS,
  curriculumVersion, type CurriculumDocument } from "./curriculum-design";
import type { Workbook, Worksheet } from "exceljs";

export type ExportView = "cohort" | "operating";
export type ExportLayout = "classic" | "modern";
export type CurriculumExportArgs = {
  context: Context; view: ExportView; cohort: number;
  documents: Record<string,CurriculumDocument>; layout: ExportLayout;
};
const xlsxMime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const grades=[1,2,3] as const;
const semesters=[1,2] as const;
type Cell = { weekly: number; total: number; adjustment: number } | null;

function cellFor(args:CurriculumExportArgs,subjectId:string,grade:number,semester:number):Cell {
  const {context,view,cohort,documents}=args;
  const year=view==="cohort"?cohort:context.year?.year??cohort;
  const targetCohort=view==="cohort"?cohort:year-grade+1;
  const plan=context.plans.find((p)=>p.cohort_year===targetCohort);
  const doc=plan?documents[plan.id]:undefined;
  const cell=getCell(doc,subjectId,grade,semester);
  if(!doc||!cell)return null;
  const result=evaluateCell(doc,cell);
  return {weekly:cell.weekly,total:result.total,adjustment:result.adjustments+result.manual};
}
function allSubjects(args:CurriculumExportArgs){
  const {context}=args;
  return orderedCurriculumSubjects(context.subjects,context.groups).map((subject)=>({
    subject,group:context.groups.find((g)=>g.id===subject.group_id)?.name??"기타",
  }));
}
function nationalForGroup(group:string):number|null{
  const key=matchGroup(group);
  return MIDDLE_2022_GROUPS.find((rule)=>rule.key===key)?.hours??null;
}
function header(sheet:Worksheet,title:string,columns:number){
  sheet.mergeCells(1,1,1,columns);
  const cell=sheet.getCell(1,1);
  cell.value=title;
  cell.font={name:"맑은 고딕",size:16,bold:true,color:{argb:"FF1F4E86"}};
  sheet.getRow(1).height=34;
  sheet.views=[{state:"frozen",ySplit:5,xSplit:3}];
  sheet.getColumn(1).width=17;sheet.getColumn(2).width=24;
  sheet.getColumn(3).width=28;
  for(let col=4;col<=columns;col++)sheet.getColumn(col).width=13;
}
function columnStyle(sheet:Worksheet,row:number,lastColumn:number){
  const entry=sheet.getRow(row);entry.height=23;
  for(let col=1;col<=lastColumn;col++){
    const cell=entry.getCell(col);
    cell.font={name:"맑은 고딕",size:10};
    cell.alignment={vertical:"middle",horizontal:col<=3?"left":"center"};
    cell.border={bottom:{style:"hair",color:{argb:"FFDCE6F0"}}};
    if(row%2===0)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF7FAFE"}};
    if(col>=4)cell.numFmt="0.##";
  }
}
function createClassic(book:Workbook,args:CurriculumExportArgs){
  const {context,view,cohort}=args;
  const year=view==="cohort"?cohort:context.year?.year??cohort;
  const s=book.addWorksheet("원본형 편성표");
  const title=year+"학년도 "+(view==="cohort"?"신입생 3개년":"당해연도 3개년")+" 교육과정 편성표";
  header(s,title,26);
  s.getCell("A2").value=context.workspace.name;
  s.getCell("A3").value="구분";
  s.getCell("D3").value="기준\n시수";
  s.getCell("E3").value="학기제";
  s.getCell("G3").value="자유학기제";
  [1,2,3].forEach((grade)=>{
    s.getCell(3,grade===1?9:grade===2?19:23).value=grade+"학년 ("+
      (view==="cohort"?year+grade-1:year)+"년 적용)";
  });
  for(const [col,label] of [[5,"편성\n시수"],[6,"증감"],[7,"편성\n시수"],[8,"증감"]]){
    s.getCell(4,col).value=label;
  }
  for(const [col,value] of [[9,"1학기"],[10,"주당"],[11,"2학기"],[12,"주당"],
    [13,"자유학기 1학기"],[14,"조정"],[15,"주당"],[16,"자유학기 2학기"],
    [17,"조정"],[18,"주당"],[19,"1학기"],[20,"주당"],[21,"2학기"],[22,"주당"],
    [23,"1학기"],[24,"주당"],[25,"2학기"],[26,"주당"]]){
    s.getCell(5,Number(col)).value=value;
  }
  for(let row=3;row<=5;row++){
    s.getRow(row).height=27;
    for(let col=1;col<=26;col++){
      const cell=s.getCell(row,col);
      cell.font={name:"맑은 고딕",bold:true,size:10,color:{argb:"FF25466F"}};
      cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:row===3?"FFDDEAF8":"FFEEF4FC"}};
      cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};
    }
  }
  let row=6;
  let lastGroup="";
  let lastCategory="";
  const rows=allSubjects(args);
  for(const {subject,group} of rows){
    const category=matchGroup(group)==="창체"?"창의적 체험활동":/자유학기/.test(group)?"자유학기 활동":"교과(군)";
    if(category!==lastCategory){s.getCell(row,1).value=category;lastCategory=category;}
    if(group!==lastGroup){s.getCell(row,2).value=group;lastGroup=group;}
    s.getCell(row,3).value=subject.name;
    if(rows.find((x)=>x.group===group)?.subject.id===subject.id){
      const national=nationalForGroup(group);
      if(national!==null)s.getCell(row,4).value=national;
    }
    const terms=[...grades].flatMap((grade)=>[...semesters].map((sem)=>cellFor(args,subject.id,grade,sem)));
    const total=terms.reduce((sum,x)=>sum+(x?.total??0),0);
    s.getCell(row,5).value=total;
    s.getCell(row,7).value=total;
    const place=[9,11,19,21,23,25];
    terms.forEach((item,index)=>{
      if(!item)return;
      s.getCell(row,place[index]).value=item.total;
      s.getCell(row,place[index]+1).value=item.weekly;
      if(index===0&&(item.adjustment!==0)){
        s.getCell(row,13).value=item.total;
        s.getCell(row,14).value=item.adjustment;
        s.getCell(row,15).value=item.weekly;
      }
      if(index===1&&item.adjustment!==0){
        s.getCell(row,16).value=item.total;
        s.getCell(row,17).value=item.adjustment;
        s.getCell(row,18).value=item.weekly;
      }
    });
    columnStyle(s,row,26);
    row++;
  }
  const lastRow=row;
  s.getCell(row,1).value="3개년 시수 총계";
  s.getCell(row,4).value=context.schoolType==="중학교"?3366:"";
  s.getCell(row,7).value=rows.reduce((sum,item)=>sum+[...grades].reduce((running,g)=>
    running+[...semesters].reduce((a,sem)=>a+(cellFor(args,item.subject.id,g,sem)?.total??0),0),0),0);
  for(const [index,col] of [9,11,19,21,23,25].entries()){
    s.getCell(row,col).value=rows.reduce((sum,item)=>
      sum+(cellFor(args,item.subject.id,Math.floor(index/2)+1,index%2+1)?.total??0),0);
  }
  for(let col=1;col<=26;col++){
    s.getCell(row,col).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFDFECFC"}};
    s.getCell(row,col).font={bold:true,name:"맑은 고딕",color:{argb:"FF25466F"}};
  }
  s.getRow(row).height=26;
  s.getCell(row+1,1).value="※ 선택과목·학교스포츠클럽 등의 중복 집계 여부는 원본 편성 구조와 대조해야 합니다.";
  s.mergeCells(row+1,1,row+1,14);
  s.autoFilter={from:{row:5,column:3},to:{row:lastRow-1,column:26}};
  return s;
}
function createModern(book:Workbook,args:CurriculumExportArgs){
  const {context,view,cohort}=args;
  const year=view==="cohort"?cohort:context.year?.year??cohort;
  const title=year+"학년도 "+(view==="cohort"?"신입생 3개년":"당해연도")+" 교육과정 편성표";
  const guide=book.addWorksheet("내보내기 안내");
  guide.addRows([
    ["EduPlan 교육과정 편성 자료",title],
    ["기준",context.workspace.name],
    ["표시",view==="cohort"?"입학년도 기준 3개년":"운영 학년도 기준 1~3학년"],
    ["주의","선택과목 병렬 개설·학교스포츠클럽 포함관계에 따라 단순 과목 합계와 학생 이수 시수가 다를 수 있습니다."],
    ["보존","출력은 확인용이며 기존 학사일정, 시간표, 확정본에 영향을 주지 않습니다."],
    ["자료","교육과정 편성 DB의 현재 화면 수치를 기준으로 생성했습니다."],
  ]);
  guide.getColumn(1).width=18;guide.getColumn(2).width=104;
  guide.getRow(1).font={bold:true,size:15};
  const sheet=book.addWorksheet("학기별 시수");
  const columns=["교과군","교과목"];
  for(const grade of grades)for(const sem of semesters){
    const label=grade+"학년 "+sem+"학기";
    columns.push(label+" 주당",label+" 기준주수",label+" 조정",label+" 최종");
  }
  columns.push("3개년 합계","비고");
  sheet.addRow(columns);
  sheet.getRow(1).height=36;
  sheet.views=[{state:"frozen",ySplit:1,xSplit:2}];
  sheet.getColumn(1).width=23;sheet.getColumn(2).width=29;
  for(let col=3;col<=27;col++)sheet.getColumn(col).width=15;
  sheet.getColumn(28).width=36;
  const headerRow=sheet.getRow(1);
  headerRow.font={bold:true,color:{argb:"FFFFFFFF"},name:"맑은 고딕"};
  headerRow.eachCell((cell)=>{cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF285D99"}};
    cell.alignment={wrapText:true,vertical:"middle",horizontal:"center"};});
  let row=2;
  for(const {subject,group} of allSubjects(args)){
    const values:(string|number)[]=[group,subject.name];
    let total=0;
    for(const grade of grades)for(const sem of semesters){
      const current=cellFor(args,subject.id,grade,sem);
      if(!current){values.push("","","","");continue;}
      const cohortYear=view==="cohort"?cohort:year-grade+1;
      const plan=context.plans.find((p)=>p.cohort_year===cohortYear);
      const rule=plan?args.documents[plan.id]?.weeks[String(cohortYear+grade-1)]:undefined;
      values.push(current.weekly,rule?.count??16,current.adjustment,current.total);
      total+=current.total;
    }
    values.push(total,"");
    sheet.addRow(values);
    columnStyle(sheet,row,28);row++;
  }
  sheet.autoFilter={from:{row:1,column:1},to:{row:row-1,column:28}};
  return sheet;
}
export async function exportCurriculumWorkbook(args:CurriculumExportArgs):Promise<Uint8Array>{
  const {Workbook:ExcelWorkbook}=await import("exceljs");
  const book:Workbook=new ExcelWorkbook();
  book.creator="EduPlan Workspace";
  if(args.layout==="classic")createClassic(book,args);
  else createModern(book,args);
  const buffer=await book.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
export async function downloadCurriculumWorkbook(args:CurriculumExportArgs):Promise<void>{
  const {downloadBlob}=await import("./academic-files");
  const bytes=await exportCurriculumWorkbook(args);
  const year=args.view==="cohort"?args.cohort:args.context.year?.year??args.cohort;
  const label=args.view==="cohort"?"신입생3개년":"당해연도";
  const suffix=args.layout==="classic"?"원본형":"현대화";
  downloadBlob(Uint8Array.from(bytes).buffer as ArrayBuffer,
    year+"학년도_"+label+"_교육과정_"+suffix+".xlsx",xlsxMime);
}
