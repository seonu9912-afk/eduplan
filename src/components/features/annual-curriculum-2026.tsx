"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Download,RotateCcw,Save,Table2} from "lucide-react";
import type {Context} from "@/lib/models";
import {
  ANNUAL_2026_COLUMNS,ANNUAL_2026_ROWS,ANNUAL_2026_YEAR,
  changeSheetValue,sheetMergeInfo,sheetValue,SOURCE_2026_SUMMARY,
} from "@/lib/annual-curriculum-2026";
import {loadAnnual2026Sheet,saveAnnual2026Sheet} from "@/app/curriculum-annual-2026-actions";
import "./annual-curriculum-2026.css";

const columnLabels:Record<number,string>={
  4:"기준 시수",5:"학기제 편성 시수",6:"학기제 20% 증감",
  7:"자유학기제 편성 시수",8:"자유학기제 20% 증감",
  9:"1학년 학기제 1학기",10:"1학년 학기제 1학기 주당",
  11:"1학년 학기제 2학기",12:"1학년 학기제 2학기 주당",
  13:"1학년 자유학기제 1학기",14:"1학년 자유학기제 1학기 조정",
  15:"1학년 자유학기제 1학기 주당",16:"1학년 자유학기제 2학기",
  17:"1학년 자유학기제 2학기 조정",18:"1학년 자유학기제 2학기 주당",
  19:"2학년 1학기",20:"2학년 1학기 주당",
  21:"2학년 2학기",22:"2학년 2학기 주당",
  23:"3학년 1학기",24:"3학년 1학기 주당",
  25:"3학년 2학기",26:"3학년 2학기 주당",
};
const inputKey=(row:string,col:number)=>row+":"+col;
function statusText(loading:boolean,dirty:boolean,version:number,notice:string){
  if(loading)return "저장된 원본형 편성표 확인 중…";
  if(notice)return notice;
  if(dirty)return "저장하지 않은 변경사항이 있어요.";
  return version?"공동 저장 버전 "+version:"원본 입력값 · 아직 편집 저장 없음";
}
export function AnnualCurriculum2026({context:c,onDirtyChange}:{
  context:Context;onDirtyChange:(dirty:boolean)=>void;
}){
  const [edits,setEdits]=useState<Record<string,string>>({});
  const [saved,setSaved]=useState<Record<string,string>>({});
  const [version,setVersion]=useState(0);
  const [dirty,setDirty]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const revision=useRef(0);
  const editable=c.role!=="viewer";
  const workspaceId=c.workspace.id;
  const reportDirty=useCallback((next:boolean)=>onDirtyChange(next),[onDirtyChange]);
  useEffect(()=>{reportDirty(dirty);},[dirty,reportDirty]);
  useEffect(()=>{
    let active=true;
    void loadAnnual2026Sheet({workspaceId,year:ANNUAL_2026_YEAR}).then(result=>{
      if(!active)return;
      if(result.ok){
        setEdits(result.data.edits);
        setSaved(result.data.edits);
        setVersion(result.data.version);
        setDirty(false);
        setError("");
      }else setError(result.error);
      setLoading(false);
    });
    return ()=>{active=false;};
  },[workspaceId]);
  function change(id:string,col:number,value:string){
    setError("");
    setMessage("");
    try{
      setEdits(current=>changeSheetValue(current,id,col,value));
      setDirty(true);
      revision.current+=1;
    }catch(error){setError(error instanceof Error?error.message:"셀 값을 확인해 주세요.");}
  }
  function pasteBlock(event:React.ClipboardEvent<HTMLInputElement>,rowIndex:number,col:number){
    const text=event.clipboardData.getData("text");
    if(!text.includes("\t")&&!text.includes("\n"))return;
    event.preventDefault();
    const matrix=text.replace(/\r/g,"").replace(/\n$/,"").split("\n").map(x=>x.split("\t"));
    let next=edits,count=0;
    try{
      for(let ri=0;ri<matrix.length;ri++){
        const currentRow=ANNUAL_2026_ROWS[rowIndex+ri];
        if(!currentRow)break;
        for(let ci=0;ci<matrix[ri].length;ci++){
          const targetCol=col+ci;
          if(targetCol>ANNUAL_2026_COLUMNS)break;
          next=changeSheetValue(next,currentRow.id,targetCol,matrix[ri][ci]);
          count++;
        }
      }
      if(count){setEdits(next);setDirty(true);setMessage(count+"개 셀을 붙여넣었습니다.");revision.current++;}
    }catch(error){setError(error instanceof Error?error.message:"붙여넣기 범위를 확인해 주세요.");}
  }
  function keyAction(event:React.KeyboardEvent<HTMLInputElement>,rowIndex:number,col:number){
    const direction=event.key==="Enter"?(event.shiftKey?-1:1):0;
    if(!direction)return;
    event.preventDefault();
    const nextRow=ANNUAL_2026_ROWS[rowIndex+direction];
    if(nextRow){
      const next=document.querySelector<HTMLInputElement>(
        'input[data-annual26-cell="'+inputKey(nextRow.id,col)+'"]');
      next?.focus();next?.select();
    }else event.currentTarget.blur();
  }
  async function store(){
    if(!editable||!dirty||loading||saving)return;
    setSaving(true);setError("");setMessage("");
    const started=revision.current;
    const snapshot={...edits};
    const result=await saveAnnual2026Sheet({workspaceId,year:ANNUAL_2026_YEAR,
      expectedVersion:version,edits:snapshot});
    if(!result.ok){setError(result.error);setSaving(false);return;}
    if(!result.data.ok){
      setError("다른 사용자가 먼저 편성표를 저장했습니다. 현재 입력값은 유지했어요. 필요하다면 엑셀을 다운로드해 백업하고 최신 저장본을 확인해 주세요.");
      setSaving(false);return;
    }
    setVersion(result.data.version);
    setSaved(snapshot);
    if(started===revision.current)setDirty(false);
    setMessage("2026학년도 원본형 편성표를 공동 저장했습니다.");
    setSaving(false);
  }
  async function reset(){
    if(!dirty||saving||!window.confirm("저장하지 않은 수정 내용만 버리고 마지막 저장 상태로 돌아갈까요?"))return;
    setEdits(saved);revision.current++;setDirty(false);setError("");setMessage("마지막 저장 상태로 되돌렸습니다.");
  }
  async function download(){
    if(exporting||loading)return;
    setExporting(true);setError("");
    try{
      const {downloadAnnual2026Workbook}=await import("@/lib/annual-curriculum-2026-export");
      await downloadAnnual2026Workbook(edits);
    }catch(error){
      setError(error instanceof Error?error.message:"엑셀 파일을 생성하지 못했습니다.");
    }finally{setExporting(false);}
  }
  return <section className="annual26" aria-label="2026학년도 당해연도 교육과정 원본형 편성표">
    <div className="annual26-head">
      <div className="annual26-heading">
        <h2>2026학년도 당해연도 교육과정</h2>
        <p>송정중학교 편성표 원본 구조 · 26열 · 교과군별 병합 · 학기제·자유학기제 동시 표시</p>
      </div>
      <div className="annual26-actions no-print">
        <button type="button" onClick={()=>void download()} disabled={loading||exporting}>
          <Download size={15}/>{exporting?"생성 중…":"엑셀 다운로드"}
        </button>
        {editable&&<>
          <button type="button" onClick={()=>void reset()} disabled={loading||saving||!dirty}>
            <RotateCcw size={15}/>변경 취소
          </button>
          <button type="button" className="annual26-save" onClick={()=>void store()} disabled={loading||saving||!dirty}>
            <Save size={15}/>{saving?"저장 중…":"학교에 저장"}
          </button>
        </>}
      </div>
    </div>
    <div className="annual26-meta">
      <span><Table2 size={13}/>표의 셀을 직접 선택해 입력할 수 있습니다. 엑셀에서 여러 셀을 복사·붙여넣기할 수도 있어요.</span>
      <span className={dirty?"annual26-dirty":""} role="status">
        {statusText(loading,dirty,version,message)}
      </span>
    </div>
    {error&&<div className="annual26-error" role="alert">{error}</div>}
    {c.year?.year!==2026&&<p className="annual26-notice">현재 작업공간에 선택된 학년도와 관계없이, 이 탭은 **2026학년도 원본형 편성표**를 표시합니다.</p>}
    <div className="annual26-scroller" role="region" aria-label="2026학년도 A열부터 Z열까지의 교육과정 편성표" tabIndex={0}>
      <table className="annual26-grid">
        <colgroup>{Array.from({length:26},(_,i)=><col key={i} className={"annual26-col-"+(i+1)}/>)}</colgroup>
        <thead>
          <tr className="annual26-top">
            <th rowSpan={3} colSpan={3} className="annual26-corner">구분</th>
            <th rowSpan={3}>기준{"\n"}시수</th>
            <th colSpan={2}>학기제</th>
            <th colSpan={2}>자유학기제</th>
            <th colSpan={10} className="annual26-first">1학년{"\n"}(2026년 적용)</th>
            <th colSpan={4}>2학년{"\n"}(2026년 적용)</th>
            <th colSpan={4}>3학년{"\n"}(2026년 적용)</th>
          </tr>
          <tr className="annual26-middle">
            <th rowSpan={2}>편성{"\n"}시수</th>
            <th rowSpan={2}>20%{"\n"}증감</th>
            <th rowSpan={2}>편성{"\n"}시수</th>
            <th rowSpan={2}>20%{"\n"}증감</th>
            <th colSpan={4}>학기제</th>
            <th colSpan={6}>자유학기제</th>
            <th rowSpan={2}>1학기</th><th rowSpan={2}>주당{"\n"}시수</th>
            <th rowSpan={2}>2학기</th><th rowSpan={2}>주당{"\n"}시수</th>
            <th rowSpan={2}>1학기</th><th rowSpan={2}>주당{"\n"}시수</th>
            <th rowSpan={2}>2학기</th><th rowSpan={2}>주당{"\n"}시수</th>
          </tr>
          <tr className="annual26-bottom">
            <th>1학기</th><th>주당{"\n"}시수</th>
            <th>2학기</th><th>주당{"\n"}시수</th>
            <th>1학기</th><th>조정{"\n"}시수</th><th>주당{"\n"}시수</th>
            <th>2학기</th><th>조정{"\n"}시수</th><th>주당{"\n"}시수</th>
          </tr>
        </thead>
        <tbody>
          {ANNUAL_2026_ROWS.map((record,rowIndex)=>{
            const merge=sheetMergeInfo(rowIndex);
            return <tr key={record.id} className={"annual26-row annual26-"+record.kind}>
              {record.section==="other"?<th colSpan={3} scope="row" className="annual26-row-label">{record.label}</th>:<>
                {merge.categoryLabel&&merge.categorySpan&&<th rowSpan={merge.categorySpan}
                  className="annual26-category" scope="rowgroup">{merge.categoryLabel}</th>}
                {merge.groupLabel&&merge.groupSpan&&<th rowSpan={merge.groupSpan}
                  className="annual26-group" scope="rowgroup">{merge.groupLabel}</th>}
                <th scope="row" className="annual26-subject">{record.subject}</th>
              </>}
              {Array.from({length:23},(_,offset)=>{
                const col=offset+4;
                const value=sheetValue(record.id,col,edits);
                return <td key={col} className={"annual26-data annual26-data-"+col}>
                  {editable?<input data-annual26-cell={inputKey(record.id,col)}
                    type="text" inputMode="decimal" maxLength={48} value={value}
                    aria-label={(record.subject||record.group||record.label)+" · "+columnLabels[col]}
                    onChange={event=>change(record.id,col,event.target.value)}
                    onKeyDown={event=>keyAction(event,rowIndex,col)}
                    onPaste={event=>pasteBlock(event,rowIndex,col)}
                    disabled={loading||saving}
                    title={columnLabels[col]}
                  />:<span>{value}</span>}
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="annual26-footnote">{SOURCE_2026_SUMMARY.warning}</p>
    <p className="annual26-footnote">이 메뉴는 원본 재현을 위한 별도 편성표입니다. 기존 3개년·학년도 운영 데이터 및 시간표의 수치를 자동으로 덮어쓰지 않습니다.</p>
  </section>;
}
