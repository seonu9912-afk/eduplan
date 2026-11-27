"use client";
import {useMemo,useRef,useState,type KeyboardEvent,type ClipboardEvent} from "react";
import {Button} from "@/components/ui/button";
import type {AnnualPlan} from "@/lib/academic";
import {operationNames} from "@/lib/work-operation-items";
import {emptyWorkInput,WORK_FIELDS,WORK_HEADERS,WORK_LIMIT,normalizeWorkDate,parseWorkClipboard,reviewWorkBatch,type WorkField} from "@/lib/work-batch";
import "./work-batch.css";
export function WorkBatch({plan,start,end,date,onApply,disabled,onDraftChange}:{plan:AnnualPlan;start:string;end:string;date:string;onApply:(rows:AnnualPlan["business"])=>void;disabled:boolean;onDraftChange:(dirty:boolean)=>void}){
 const [rows,setRows]=useState(()=>Array.from({length:8},emptyWorkInput));
 const [dept,setDept]=useState(plan.departments[0]??""),[day,setDay]=useState(date),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[ack,setAck]=useState(false);
 const picker=useRef<HTMLInputElement>(null),grid=useRef<HTMLTableElement>(null);
 const review=useMemo(()=>reviewWorkBatch(rows,plan,start,end,dept,day),[rows,plan,start,end,dept,day]);
 const hasInput=rows.some(row=>Object.values(row).some(v=>v.trim()));
 function update(next:typeof rows){setRows(next);setAck(false);onDraftChange(next.some(row=>Object.values(row).some(v=>v.trim())));}
 function focus(r:number,c:number){requestAnimationFrame(()=>grid.current?.querySelector<HTMLInputElement>('[data-row="'+r+'"][data-col="'+c+'"]')?.focus());}
 function navigate(e:KeyboardEvent<HTMLInputElement>,r:number,c:number){
 if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.nativeEvent.isComposing)return;
 const t=e.currentTarget;
 if(e.key==="Enter"||e.key==="ArrowDown")r++;else if(e.key==="ArrowUp")r--;else if(e.key==="ArrowLeft"&&t.selectionStart===0&&t.selectionEnd===0)c--;else if(e.key==="ArrowRight"&&t.selectionStart===t.value.length&&t.selectionEnd===t.value.length)c++;else return;
 e.preventDefault();if(c<0){r--;c=6;}if(c>6){r++;c=0;}if(r>=rows.length&&r<WORK_LIMIT)update([...rows,emptyWorkInput()]);focus(Math.max(0,Math.min(WORK_LIMIT-1,r)),c);
 }
 function paste(e:ClipboardEvent<HTMLInputElement>,r:number,c:number){
 const raw=e.clipboardData.getData("text/plain");if(!/[\t\r\n]/.test(raw))return;e.preventDefault();
 try{let matrix=parseWorkClipboard(raw);if(c===0&&matrix[0]?.map(v=>v.trim()).join("\t")===WORK_HEADERS.join("\t"))matrix=matrix.slice(1);
 if(r+matrix.length>WORK_LIMIT||matrix.some(line=>c+line.length>7))throw Error("300행 또는 지정 열의 범위를 초과했습니다.");
 const next=Array.from({length:Math.max(rows.length,r+matrix.length)},(_,i)=>({... (rows[i]??emptyWorkInput())}));
 matrix.forEach((line,i)=>line.forEach((v,j)=>{const field=WORK_FIELDS[c+j];next[r+i][field]=field==="date"?normalizeWorkDate(v):v;}));update(next);setNotice(matrix.length+"행을 붙여넣었습니다.");
 }catch(err){setNotice(err instanceof Error?err.message:"붙여넣지 못했습니다.");}}
 async function upload(file?:File){if(!file)return;if(!file.name.toLowerCase().endsWith(".xlsx")||file.size>2*1024*1024){setNotice("2MB 이하 .xlsx 파일을 선택하세요.");return;}if(hasInput&&!window.confirm("현재 입력을 엑셀 내용으로 교체할까요?"))return;setBusy(true);try{const {readWorkExcel}=await import("@/lib/work-batch");const loaded=await readWorkExcel(await file.arrayBuffer());update([...loaded,...Array.from({length:Math.max(0,8-loaded.length)},emptyWorkInput)]);setNotice(loaded.length+"행을 불러왔습니다.");}catch(err){setNotice(err instanceof Error?err.message:"파일을 읽지 못했습니다.");}finally{setBusy(false);}}
 return <section className="panel work-batch no-print" aria-label="업무계획 일괄 입력">
 <header className="work-batch-heading"><div><h2>여러 일정 한 번에 입력</h2><p>빈 날짜·부서는 기본값으로 채웁니다. 학사일정은 별도로 관리합니다.</p></div><div className="work-batch-defaults"><label>기본 날짜<input type="date" min={start} max={end} value={day} onChange={e=>{setAck(false);setDay(e.target.value);}}/></label><label>기본 부서<select value={dept} onChange={e=>{setAck(false);setDept(e.target.value);}}>{plan.departments.map(d=><option key={d}>{d}</option>)}</select></label></div></header>
 <div className="work-batch-toolbar"><Button variant="outline" disabled={rows.length>=WORK_LIMIT||busy} onClick={()=>update([...rows,emptyWorkInput()])}>+ 행 추가</Button><Button variant="outline" disabled={busy} onClick={()=>{if(!hasInput||window.confirm("입력 내용을 지울까요?")){update(Array.from({length:8},emptyWorkInput));setNotice("");}}}>입력 비우기</Button><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{const {workExcelTemplate}=await import("@/lib/work-batch");const {downloadBlob}=await import("@/lib/academic-files");downloadBlob(await workExcelTemplate(),"업무계획_입력양식.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");}catch{setNotice("양식을 만들지 못했습니다.");}finally{setBusy(false);}}}>엑셀 양식</Button><Button variant="outline" disabled={busy||disabled} onClick={()=>picker.current?.click()}>엑셀 업로드</Button><input ref={picker} type="file" accept=".xlsx" className="sr-only" aria-label="업무계획 엑셀 선택" onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/><span className="work-batch-total">등록 가능 {review.items.length}건 · 최대 300행</span></div>
 <p className="work-batch-hint">엑셀 범위를 복사해 원하는 칸에 붙여넣으세요. Enter·위아래 방향키로 행 이동, Tab·좌우 방향키(글자 끝)로 칸 이동.</p>
 <datalist id="batch-depts">{plan.departments.map(d=><option key={d} value={d}/>)}</datalist><datalist id="batch-kinds">{["업무","출장","협의사항",...operationNames(plan)].map(k=><option key={k} value={k}/>)}</datalist>
 <div className="work-batch-table-wrap"><table ref={grid} className="work-batch-table" aria-label="일괄 입력 표"><thead><tr><th scope="col">행</th>{WORK_HEADERS.map(h=><th key={h} scope="col">{h}</th>)}<th scope="col">삭제</th></tr></thead><tbody>{rows.map((row,i)=><tr key={i} data-error={review.errors.some(e=>e.row===i+1)?"":undefined} data-duplicate={review.duplicates.includes(i+1)?"":undefined}><th scope="row">{i+1}</th>{WORK_FIELDS.map((field:WorkField,j)=><td key={field}><input type="text" disabled={busy} data-row={i} data-col={j} aria-label={(i+1)+"행 "+WORK_HEADERS[j]} value={row[field]} placeholder={field==="date"?day:field==="department"?dept:field==="kind"?"업무":field==="text"?"일정 내용을 입력하세요":""} list={field==="department"?"batch-depts":field==="kind"?"batch-kinds":undefined} onChange={e=>update(rows.map((r,n)=>i===n?{...r,[field]:e.target.value}:r))} onKeyDown={e=>navigate(e,i,j)} onPaste={e=>paste(e,i,j)}/></td>)}<td><button type="button" disabled={busy} aria-label={(i+1)+"행 삭제"} onClick={()=>update(rows.length===1?[emptyWorkInput()]:rows.filter((_,n)=>i!==n))}>×</button></td></tr>)}</tbody></table></div>
 {notice&&<p role="status">{notice}</p>}
 {!!review.errors.length&&<div className="work-batch-errors" role="alert">{review.errors.slice(0,20).map((e,i)=><p key={i}>{e.row?e.row+"행 · ":""}{e.message}</p>)}{review.errors.length>20&&<p>외 {review.errors.length-20}건</p>}</div>}
 {!!review.duplicates.length&&<label className="work-batch-duplicate"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>동일 일정 {review.duplicates.length}건({review.duplicates.join(", ")}행)을 제외하고 추가합니다.</label>}
 <footer className="work-batch-footer"><p>초안에 추가한 뒤 상단의 업무계획 저장 및 확정·공개를 진행하세요.</p><Button disabled={disabled||busy||!review.items.length||!!review.errors.length||!!review.duplicates.length&&!ack} onClick={()=>{const count=review.items.length;onApply(review.items.map(r=>({...r,id:crypto.randomUUID()})));update(Array.from({length:8},emptyWorkInput));setNotice(count+"건을 초안에 추가했습니다.");}}>{review.items.length}건 초안에 추가</Button></footer>
 </section>;
}
