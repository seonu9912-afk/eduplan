'use client';
import {useMemo,useState} from 'react';
import {ClipboardPaste,AlertTriangle,FileSpreadsheet} from 'lucide-react';
import {parseLedgerPaste} from '../lib/ledger';
export default function CalendarPasteImport({year,onApply}){
  const [open,setOpen]=useState(false);
  const [text,setText]=useState('');
  const data=useMemo(()=>parseLedgerPaste(text,year),[text,year]);
  const apply=()=>{
    if(!data.rows.length||data.errors.length)return;
    if(!window.confirm(`${data.rows.length}일의 학사구분·학사일정·교육활동·비고를 현재 편성안에 가져올까요? 동일 날짜의 기존 내용이 변경될 수 있습니다. 가져오기 전에 작업공간을 백업해 주세요.`))return;
    onApply(data.rows);setText('');setOpen(false);
  };
  return <section className="cal-sheet-import">
    <button type="button" className="cal-action secondary" onClick={()=>setOpen(x=>!x)} aria-expanded={open}><ClipboardPaste size={15}/> 엑셀 학사일정 붙여넣기</button>
    {open&&<div className="cal-paste" style={{marginTop:12}}>
      <p><FileSpreadsheet size={15} style={{verticalAlign:'middle',marginRight:5}}/> 첨부한 원본처럼 <b>「학사일정_기본」 시트 B:H열(월/날짜/요일/학사구분/학사일정/주요행사일정/비고)</b>을 복사해 붙여넣으세요. C:H열만 복사해도 돼요.</p>
      <p>상세 교육활동은 원문 텍스트로 보존합니다. <b>시간표 시수 대체</b>는 행사 일괄 편성 메뉴에서 교시·영역을 지정해야 적용됩니다. 직접 입력한 공휴일은 공식 데이터와 비교해 주세요.</p>
      <textarea rows={6} value={text} onChange={e=>setText(e.target.value)} aria-label="엑셀 학사일정 복사 내용" placeholder={`3월\t${year}-03-01\t일\t주말\t삼일절\t\t\n\t${year}-03-02\t월\t공휴일\t대체공휴일\t\t`}/>
      <div className="cal-import-review"><span>읽힌 날짜 <strong>{data.rows.length}건</strong></span><span>확인 필요 <strong>{data.errors.length}건</strong></span></div>
      {!!data.errors.length&&<div className="cal-import-errors" role="alert"><AlertTriangle size={16}/><div>{data.errors.slice(0,7).map((e,i)=><div key={i}>{e}</div>)}{data.errors.length>7&&<div>외 {data.errors.length-7}건</div>}</div></div>}
      <div className="cal-actions"><button type="button" className="cal-action main" disabled={!data.rows.length||data.errors.length>0} onClick={apply}>검증한 {data.rows.length}일 가져오기</button><button type="button" className="cal-action secondary" onClick={()=>{setText('');setOpen(false);}}>닫기</button></div>
    </div>}
  </section>;
}
