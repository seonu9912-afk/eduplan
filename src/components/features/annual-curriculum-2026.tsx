"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Download,Plus,RotateCcw,Save,Table2,Trash2} from "lucide-react";
import type {Context} from "@/lib/models";
import {
  ANNUAL_2026_COLUMNS,ANNUAL_2026_YEAR,
  orderedSheetRows,sheetMergeInfo,SOURCE_2026_SUMMARY,type Annual2026CustomRow,
} from "@/lib/annual-curriculum-2026";
import {
  calculateAnnual2026Sheet,calculatedAnnualCell,editAnnual2026Cell,editableAnnualCell,
  insertAnnualSubject,removeAnnualSubject,updateAnnualSubjectName,
} from "@/lib/annual-curriculum-calculations";
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
function EditableCell({value,disabled,label,cellKey,onCommit,onPaste,onNavigate}:{
  value:string;disabled:boolean;label:string;cellKey:string;
  onCommit:(value:string)=>void;
  onPaste:(event:React.ClipboardEvent<HTMLInputElement>)=>void;
  onNavigate:(event:React.KeyboardEvent<HTMLInputElement>)=>void;
}){
  const [draft,setDraft]=useState(value);
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(document.activeElement!==input.current)setDraft(value);
  },[value]);
  const commit=()=>{
    if(draft!==value)onCommit(draft);
  };
  return <input ref={input} data-annual26-cell={cellKey}
    type="text" inputMode="decimal" maxLength={48} value={draft} disabled={disabled}
    aria-label={label} onFocus={event=>event.currentTarget.select()}
    onChange={event=>setDraft(event.target.value)}
    onBlur={commit}
    onPaste={onPaste}
    onKeyDown={event=>{
      if(event.key==="Enter"){commit();onNavigate(event);}
      else if(event.key==="Escape"){setDraft(value);event.currentTarget.blur();}
    }}
    title={label}/>;
}
export function AnnualCurriculum2026({context:c,onDirtyChange}:{
  context:Context;onDirtyChange:(dirty:boolean)=>void;
}){
  const [edits,setEdits]=useState<Record<string,string>>({});
  const [saved,setSaved]=useState<Record<string,string>>({});
  const [customRows,setCustomRows]=useState<Annual2026CustomRow[]>([]);
  const [savedCustomRows,setSavedCustomRows]=useState<Annual2026CustomRow[]>([]);
  const [focusNewRow,setFocusNewRow]=useState<string|null>(null);
  const [loadFailed,setLoadFailed]=useState(false);
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
  const rows=useMemo(()=>orderedSheetRows(customRows),[customRows]);
  const calculated=useMemo(()=>calculateAnnual2026Sheet({edits,rows:customRows}),[edits,customRows]);
  const reportDirty=useCallback((next:boolean)=>onDirtyChange(next),[onDirtyChange]);
  useEffect(()=>{reportDirty(dirty);},[dirty,reportDirty]);
  useEffect(()=>{
    let active=true;
    void loadAnnual2026Sheet({workspaceId,year:ANNUAL_2026_YEAR}).then(result=>{
      if(!active)return;
      if(result.ok){
        setEdits(result.data.edits);
        setSaved(result.data.edits);
        setCustomRows(result.data.customRows);
        setSavedCustomRows(result.data.customRows);
        setVersion(result.data.version);
        setDirty(false);
        setLoadFailed(false);
        setError("");
      }else {setError(result.error);setLoadFailed(true);}
      setLoading(false);
    });
    return ()=>{active=false;};
  },[workspaceId]);
  useEffect(()=>{
    if(!focusNewRow)return;
    const target=document.querySelector<HTMLInputElement>(
      '[data-annual26-subject="'+focusNewRow+'"]');
    if(target){target.focus();setFocusNewRow(null);}
  },[focusNewRow,customRows]);
  function markDirty(){
    setError("");setMessage("");setDirty(true);revision.current++;
  }
  function change(id:string,col:number,value:string){
    try{
      const updated=editAnnual2026Cell({edits,rows:customRows},id,col,value);
      setEdits(updated);markDirty();
    }catch(error){setError(error instanceof Error?error.message:"셀 값을 확인해 주세요.");}
  }
  function insertRow(referenceId:string){
    const reference=rows.find(row=>row.id===referenceId);
    if(!reference)return;
    const id="extra"+crypto.randomUUID().replaceAll("-","");
    try{
      const next=insertAnnualSubject(customRows,reference,id);
      setCustomRows(next);setFocusNewRow(id);markDirty();
    }catch(error){setError(error instanceof Error?error.message:"행을 추가하지 못했습니다.");}
  }
  function renameRow(id:string,value:string){
    setCustomRows(current=>updateAnnualSubjectName(current,id,value));
    markDirty();
  }
  function deleteRow(id:string){
    if(!window.confirm("이 과목 행과 입력한 시수를 삭제할까요?"))return;
    try{
      const next=removeAnnualSubject(customRows,edits,id);
      setCustomRows(next.rows);setEdits(next.edits);markDirty();
    }catch(error){setError(error instanceof Error?error.message:"행을 삭제하지 못했습니다.");}
  }
  function pasteBlock(event:React.ClipboardEvent<HTMLInputElement>,rowIndex:number,col:number){
    const text=event.clipboardData.getData("text");
    if(!text.includes("\t")&&!text.includes("\n"))return;
    event.preventDefault();
    const matrix=text.replace(/\r/g,"").replace(/\n$/,"").split("\n").map(x=>x.split("\t"));
    let updated=edits,count=0;
    try{
      for(let ri=0;ri<matrix.length;ri++){
        const row=rows[rowIndex+ri];
        if(!row)break;
        for(let ci=0;ci<matrix[ri].length;ci++){
          const column=col+ci;
          if(column>ANNUAL_2026_COLUMNS)break;
          if(!editableAnnualCell(row,column,rows))continue;
          updated=editAnnual2026Cell({edits:updated,rows:customRows},
            row.id,column,matrix[ri][ci]);
          count++;
        }
      }
      if(count){setEdits(updated);markDirty();setMessage(count+"개 입력 셀을 붙여넣고 연결된 시수를 계산했어요.");}
    }catch(error){setError(error instanceof Error?error.message:"붙여넣기 값을 확인해 주세요.");}
  }
  function keyAction(event:React.KeyboardEvent<HTMLInputElement>,rowIndex:number,col:number){
    event.preventDefault();
    const direction=event.shiftKey?-1:1;
    let index=rowIndex+direction;
    while(index>=0&&index<rows.length){
      const row=rows[index];
      if(editableAnnualCell(row,col,rows)){
        const next=document.querySelector<HTMLInputElement>(
          'input[data-annual26-cell="'+inputKey(row.id,col)+'"]');
        if(next){next.focus();next.select();return;}
      }
      index+=direction;
    }
    event.currentTarget.blur();
  }
  async function store(){
    if(!editable||!dirty||loading||saving||loadFailed)return;
    if(customRows.some(row=>!row.subject.trim())){
      setError("추가한 과목의 이름을 먼저 입력해 주세요.");return;
    }
    setSaving(true);setError("");setMessage("");
    const started=revision.current;
    const snapshot={...edits};
    const rowSnapshot=customRows.map(row=>({...row}));
    const result=await saveAnnual2026Sheet({workspaceId,year:ANNUAL_2026_YEAR,
      expectedVersion:version,edits:snapshot,customRows:rowSnapshot});
    if(!result.ok){setError(result.error);setSaving(false);return;}
    if(!result.data.ok){
      setError("다른 사용자가 먼저 편성표를 저장했습니다. 현재 입력값은 유지했어요. 필요하다면 엑셀을 다운로드해 백업하고 최신 저장본을 확인해 주세요.");
      setSaving(false);return;
    }
    setVersion(result.data.version);
    setSaved(snapshot);
    setSavedCustomRows(rowSnapshot);
    if(started===revision.current)setDirty(false);
    setMessage("2026학년도 원본형 편성표를 공동 저장했습니다.");
    setSaving(false);
  }
  async function reset(){
    if(!dirty||saving||!window.confirm("저장하지 않은 수정 내용만 버리고 마지막 저장 상태로 돌아갈까요?"))return;
    setEdits(saved);setCustomRows(savedCustomRows);revision.current++;setDirty(false);setError("");setMessage("마지막 저장 상태로 되돌렸습니다.");
  }
  async function download(){
    if(exporting||loading)return;
    setExporting(true);setError("");
    try{
      const {downloadAnnual2026Workbook}=await import("@/lib/annual-curriculum-2026-export");
      await downloadAnnual2026Workbook(edits,customRows);
    }catch(error){
      setError(error instanceof Error?error.message:"엑셀 파일을 생성하지 못했습니다.");
    }finally{setExporting(false);}
  }
  return <section className="annual26" aria-label="2026학년도 당해연도 교육과정 원본형 편성표">
    <div className="annual26-head">
      <div className="annual26-heading">
        <h2>2026학년도 당해연도 교육과정</h2>
        <p>원본 26열 유지 · 교과군별 과목 행 추가 · 입력과 동시에 시수 연동 계산</p>
      </div>
      <div className="annual26-actions no-print">
        <button type="button" onClick={()=>void download()} disabled={loading||exporting}>
          <Download size={15}/>{exporting?"생성 중…":"엑셀 다운로드"}
        </button>
        {editable&&<>
          <button type="button" onClick={()=>void reset()} disabled={loading||saving||!dirty}>
            <RotateCcw size={15}/>변경 취소
          </button>
          <button type="button" className="annual26-save" onClick={()=>void store()} disabled={loading||saving||loadFailed||!dirty}>
            <Save size={15}/>{saving?"저장 중…":"학교에 저장"}
          </button>
        </>}
      </div>
    </div>
    <div className="annual26-meta">
      <span><Table2 size={13}/>교과군의 ‘행 추가’로 과목을 넣고, 수업·주당 시수를 입력하면 편성 시수와 증감을 계산해요. 푸른색 셀은 계산값입니다.</span>
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
          {rows.map((record,rowIndex)=>{
            const merge=sheetMergeInfo(rowIndex,rows);
            const next=rows[rowIndex+1];
            const groupEnd=record.kind==="subject"&&
              (next?.section!==record.section||next?.group!==record.group);
            const custom=customRows.some(row=>row.id===record.id);
            return <tr key={record.id} className={"annual26-row annual26-"+record.kind}>
              {record.section==="other"?<th colSpan={3} scope="row" className="annual26-row-label">{record.label}</th>:<>
                {merge.categoryLabel&&merge.categorySpan&&<th rowSpan={merge.categorySpan}
                  className="annual26-category" scope="rowgroup">{merge.categoryLabel}</th>}
                {merge.groupLabel&&merge.groupSpan&&<th rowSpan={merge.groupSpan}
                  className="annual26-group" scope="rowgroup">{merge.groupLabel}</th>}
                <th scope="row" className="annual26-subject">
                  <div className="annual26-subject-line">
                    {custom&&editable?<input type="text" className="annual26-subject-name"
                      data-annual26-subject={record.id} maxLength={60}
                      value={record.subject} aria-label={record.group+" 추가 과목 이름"}
                      placeholder="새 과목명 입력" disabled={loading||saving||loadFailed}
                      onChange={event=>renameRow(record.id,event.target.value)}/>
                      :<span>{record.subject}</span>}
                    {custom&&editable&&<button type="button" className="annual26-remove-row no-print"
                      title="추가한 과목 삭제" aria-label={record.subject+" 과목 삭제"}
                      onClick={()=>deleteRow(record.id)} disabled={loading||saving||loadFailed}>
                      <Trash2 size={13}/>
                    </button>}
                  </div>
                  {groupEnd&&editable&&<button type="button" className="annual26-add-row no-print"
                    onClick={()=>insertRow(record.id)} disabled={loading||saving||loadFailed}>
                    <Plus size={12}/>이 교과군에 행 추가
                  </button>}
                </th>
              </>}
              {Array.from({length:23},(_,offset)=>{
                const col=offset+4;
                const value=calculatedAnnualCell(calculated,record,col,edits);
                const canEdit=editable&&editableAnnualCell(record,col,rows);
                const isDerived=calculated.values[inputKey(record.id,col)]!==undefined
                  ||!editableAnnualCell(record,col,rows);
                const label=(record.subject||record.group||record.label)+" · "+columnLabels[col];
                return <td key={col} className={"annual26-data annual26-data-"+col+
                  (isDerived?" annual26-derived":"")}>
                  {canEdit?<EditableCell key={record.id+":"+col} cellKey={inputKey(record.id,col)}
                    value={value} label={label} disabled={loading||saving||loadFailed}
                    onCommit={next=>change(record.id,col,next)}
                    onNavigate={event=>keyAction(event,rowIndex,col)}
                    onPaste={event=>pasteBlock(event,rowIndex,col)}/>
                    :<span aria-label={label}>{value}</span>}
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="annual26-footnote">{SOURCE_2026_SUMMARY.warning}</p>
    <p className="annual26-footnote">기본 계산 기준은 학기당 16주이며, 주당 시수와 학기 시수는 서로 변환됩니다. 자유학기 조정은 같은 학기의 일반 시수를 기준으로 반영합니다.</p>
    <p className="annual26-footnote">원본 총계의 불일치를 보존하기 위해 변경된 시수 차이만 소계·총계에 반영합니다. 기존 다른 연도 교육과정과 시간표는 자동으로 변경되지 않습니다.</p>
  </section>;
}
