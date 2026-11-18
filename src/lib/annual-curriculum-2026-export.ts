import {ANNUAL_2026_COLUMNS,ANNUAL_2026_ROWS,ANNUAL_2026_YEAR,
  sheetMergeInfo,sheetValue} from "./annual-curriculum-2026";

export async function createAnnual2026WorkbookBytes(edits:Readonly<Record<string,string>>):Promise<Uint8Array>{
  const {Workbook}=await import("exceljs");
  const workbook=new Workbook();
  workbook.creator="EduPlan";
  const sheet=workbook.addWorksheet("2026 당해연도 교육과정",{
    views:[{state:"frozen",xSplit:3,ySplit:3}],
    pageSetup:{orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0},
  });
  const colWidth=Array.from({length:ANNUAL_2026_COLUMNS},(_,i)=>
    i===0?16:i===1?24:i===2?29:i===3?15:i<8?15:i>=8&&i<18?13:13);
  colWidth.forEach((width,index)=>{sheet.getColumn(index+1).width=width;});
  const merge=(a:string,b:string,title:string)=>{
    sheet.mergeCells(a+":"+b);
    sheet.getCell(a).value=title;
  };
  merge("A1","C3","구분");
  merge("D1","D3","기준\n시수");
  merge("E1","F1","학기제");
  merge("G1","H1","자유학기제");
  merge("I1","R1","1학년\n(2026년 적용)");
  merge("S1","V1","2학년\n(2026년 적용)");
  merge("W1","Z1","3학년\n(2026년 적용)");
  for(const [column,title] of [
    ["E","편성\n시수"],["F","20%\n증감"],["G","편성\n시수"],["H","20%\n증감"],
  ] as const)merge(column+"2",column+"3",title);
  merge("I2","L2","학기제");
  merge("M2","R2","자유학기제");
  for(const [column,title] of [
    ["I","1학기"],["J","주당\n시수"],["K","2학기"],["L","주당\n시수"],
    ["M","1학기"],["N","조정\n시수"],["O","주당\n시수"],
    ["P","2학기"],["Q","조정\n시수"],["R","주당\n시수"],
  ] as const)sheet.getCell(column+"3").value=title;
  for(const [column,title] of [
    ["S","1학기"],["T","주당\n시수"],["U","2학기"],["V","주당\n시수"],
    ["W","1학기"],["X","주당\n시수"],["Y","2학기"],["Z","주당\n시수"],
  ] as const)merge(column+"2",column+"3",title);
  for(let row=1;row<=3;row++){
    sheet.getRow(row).height=row===1?46:row===2?35:39;
    for(let col=1;col<=26;col++){
      const c=sheet.getRow(row).getCell(col);
      c.font={name:"맑은 고딕",size:10,bold:true,color:{argb:"FF24384F"}};
      c.alignment={horizontal:"center",vertical:"middle",wrapText:true};
      c.border={top:{style:"thin",color:{argb:"FF8195AA"}},
        bottom:{style:"thin",color:{argb:"FF8195AA"}},
        left:{style:"thin",color:{argb:"FF8195AA"}},
        right:{style:"thin",color:{argb:"FF8195AA"}}};
      c.fill={type:"pattern",pattern:"solid",fgColor:{argb:col<=8?"FFDFE8F3":col<=18?"FFE7F1FA":"FFF0F4FA"}};
    }
  }
  ANNUAL_2026_ROWS.forEach((record,index)=>{
    const rowNumber=index+4;
    const row=sheet.getRow(rowNumber);
    row.height=record.kind==="grand"?29:record.kind==="subtotal"?26:27;
    const background=record.kind==="grand"?"FFCBDDF2":
      record.kind==="subtotal"?"FFE4ECF7":
      record.kind==="footer"?"FFF1F5FA":index%2===0?"FFFFFFFF":"FFFAFCFF";
    for(let col=1;col<=26;col++){
      const c=row.getCell(col);
      c.font={name:"맑은 고딕",size:10,bold:record.kind!=="subject",color:{argb:"FF1F2937"}};
      c.alignment={horizontal:col<=3?"left":"center",vertical:"middle",wrapText:true};
      c.fill={type:"pattern",pattern:"solid",fgColor:{argb:background}};
      c.border={
        top:{style:"hair",color:{argb:"FF9DAEBF"}},
        bottom:{style:"hair",color:{argb:"FF9DAEBF"}},
        left:{style:"hair",color:{argb:"FF9DAEBF"}},
        right:{style:"hair",color:{argb:"FF9DAEBF"}},
      };
      if(col>=4){
        const raw=sheetValue(record.id,col,edits);
        if(raw!==""){
          const numeric=raw.replace(/,/g,"");
          if(/^-?(?:\d+)(?:\.\d+)?$/.test(numeric)){
            c.value=Number(numeric);
            c.numFmt="#,##0.##";
          }else c.value=raw;
        }
      }
    }
    if(record.section==="other"){
      sheet.mergeCells(rowNumber,1,rowNumber,3);
      row.getCell(1).value=record.label;
    }else{
      const merged=sheetMergeInfo(index);
      if(merged.categoryLabel&&merged.categorySpan){
        if(merged.categorySpan>1)sheet.mergeCells(rowNumber,1,rowNumber+merged.categorySpan-1,1);
        row.getCell(1).value=merged.categoryLabel;
      }
      if(merged.groupLabel&&merged.groupSpan){
        if(merged.groupSpan>1)sheet.mergeCells(rowNumber,2,rowNumber+merged.groupSpan-1,2);
        row.getCell(2).value=merged.groupLabel;
      }
      row.getCell(3).value=record.subject;
    }
  });
  sheet.properties.defaultRowHeight=24;
  const buffer=await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
export async function downloadAnnual2026Workbook(edits:Readonly<Record<string,string>>):Promise<void>{
  const {downloadBlob}=await import("./academic-files");
  const bytes=await createAnnual2026WorkbookBytes(edits);
  downloadBlob(Uint8Array.from(bytes).buffer as ArrayBuffer,
    ANNUAL_2026_YEAR+"학년도_당해연도_교육과정_원본형.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
