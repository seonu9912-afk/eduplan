"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {BookOpen,Check,ChevronDown,ChevronRight,Columns3,Download,History,Plus,Save,ShieldCheck,TriangleAlert} from "lucide-react";
import type {Context} from "@/lib/models";
import {orderedCurriculumGroups,orderedCurriculumSubjects} from "@/lib/curriculum-group-order";
import type {OperatingDocument,OpCell,OpChoice,OpOffering} from "@/lib/curriculum-operating-v4";
import {applyOperatingWeeks,operatingDiffs,operatingTotals,opHours,opKey,updateOperatingCell,
  validateOperating} from "@/lib/curriculum-operating-v4";
import {loadOperatingV4,saveOperatingV4,type OperatingLoad} from "@/app/curriculum-operating-actions";
import {addSubject} from "@/app/actions";
import {CurriculumRowSubjectV4} from "./curriculum-subject-row-v4";
import "./curriculum-operating-v4.css";
type Mode="weekly"|"semester"|"yearly";
const fmt=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(2);
function HourField({value,disabled,index,onValue,onBlock}:{
  value:number;disabled:boolean;index:string;
  onValue:(value:number)=>void;onBlock:(text:string)=>boolean;
}){
  const [draft,setDraft]=useState(String(value));
  const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(document.activeElement!==ref.current)setDraft(String(value));},[value]);
  const commit=()=>{
    const number=Number(draft);
    if(draft.trim()!==""&&Number.isFinite(number)&&number>=0&&number<=100)onValue(number);
    else setDraft(String(value));
  };
  return <input ref={ref} type="text" inputMode="decimal" data-operating-cell={index}
    value={draft} disabled={disabled} aria-label={"주당 시수 "+index}
    onFocus={e=>e.currentTarget.select()} onChange={e=>setDraft(e.target.value)}
    onBlur={commit}
    onPaste={e=>{const text=e.clipboardData.getData("text");
      if(/[\t\n]/.test(text)&&onBlock(text))e.preventDefault();}}
    onKeyDown={e=>{
      const parts=index.split(":").map(Number),row=parts[0],col=parts[1];
      const offset:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],Enter:[1,0]};
      if(e.key==="Escape"){setDraft(String(value));ref.current?.blur();return;}
      const move=offset[e.key];
      if(!move||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
      const next=document.querySelector<HTMLInputElement>('[data-operating-cell="'+(row+move[0])+":"+(col+move[1])+'"]');
      if(next&&!next.disabled){e.preventDefault();commit();next.focus();next.select();}
      else if(e.key==="Enter"){e.preventDefault();commit();ref.current?.blur();}
    }}/>;
}
function createCsv(context:Context,doc:OperatingDocument,mode:Mode){
  const subjects=orderedCurriculumSubjects(context.subjects,context.groups);
  const rows=[["교과(군)","교과목","1-1","1-2","2-1","2-2","3-1","3-2","3개년 합계"]];
  for(const s of subjects){
    const group=context.groups.find(g=>g.id===s.group_id)?.name??"기타";
    const values=Array.from({length:6},(_,i)=>{
      const g=Math.floor(i/2)+1,semester=i%2+1;
      const item=doc.cells.find(c=>c.subjectId===s.id&&c.grade===g&&c.semester===semester);
      return item?mode==="weekly"?item.weekly:opHours(item):0;
    });
    const total=doc.cells.filter(c=>c.subjectId===s.id).reduce((sum,c)=>sum+opHours(c),0);
    rows.push([group,s.name,...values.map(fmt),fmt(total)]);
  }
  const csv="\ufeff"+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=doc.year+"학년도_운영편제_"+mode+".csv";
  document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
}
export function CurriculumOperatingV4({context:c,year,onDirtyChange,onNavigate,focus="table"}:{
  context:Context;year:number;onDirtyChange:(value:boolean)=>void;
  onNavigate?:(route:"timetable")=>void;focus?:"table"|"courses";
}){
  const router=useRouter();
  const [loaded,setLoaded]=useState<OperatingLoad|null>(null);
  const [doc,setDoc]=useState<OperatingDocument|null>(null);
  const [mode,setMode]=useState<Mode>("weekly");
  const [version,setVersion]=useState(0);
  const [status,setStatus]=useState<"draft"|"confirmed">("draft");
  const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [expanded,setExpanded]=useState<string[]>([]);
  const [sideOpen,setSideOpen]=useState(true);
  const [inspectorOpen,setInspectorOpen]=useState(true);
  const [newSubject,setNewSubject]=useState<string|null>(null);
  const [newName,setNewName]=useState("");
  const [choiceEditing,setChoiceEditing]=useState(false);
  const [choiceName,setChoiceName]=useState("");
  const [choiceGrade,setChoiceGrade]=useState(1);
  const [choiceSemester,setChoiceSemester]=useState(1);
  const [choiceSubjectIds,setChoiceSubjectIds]=useState<string[]>([]);
  const [choiceCount,setChoiceCount]=useState(1);
  const [offeringEditing,setOfferingEditing]=useState(false);
  const [offeringSubject,setOfferingSubject]=useState("");
  const [offeringGrade,setOfferingGrade]=useState(1);
  const [offeringSemester,setOfferingSemester]=useState(1);
  const [offeringTeacher,setOfferingTeacher]=useState("");
  const [offeringRoom,setOfferingRoom]=useState("");
  const [offeringClasses,setOfferingClasses]=useState<string[]>([]);
  const serial=useRef(0);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const sourceRef=useRef({doc:null as OperatingDocument|null,version:0});
  const editable=c.role!=="viewer"&&status==="draft";
  const groups=useMemo(()=>orderedCurriculumGroups(c.groups),[c.groups]);
  const subjects=useMemo(()=>orderedCurriculumSubjects(c.subjects,c.groups),[c.subjects,c.groups]);
  const totals=useMemo(()=>doc?operatingTotals(doc):null,[doc]);
  const deltas=useMemo(()=>doc&&loaded?operatingDiffs(doc,loaded.projection):[],[doc,loaded]);
  const mismatch=loaded?Object.entries(loaded.projection.sourceVersions).some(([cohort,source])=>{
    const old=doc?.sourceVersions[cohort];
    return !old||old.planVersion!==source.planVersion||old.documentVersion!==source.documentVersion;
  }):false;
  useEffect(()=>{
    let alive=true;
    setLoaded(null);setDoc(null);setDirty(false);setError("");setMessage("");
    void loadOperatingV4({workspaceId:c.workspace.id,year}).then(result=>{
      if(!alive)return;
      if(!result.ok){setError(result.error);return;}
      setLoaded(result.data);setDoc(result.data.document??result.data.projection);
      setVersion(result.data.version);setStatus(result.data.status);sourceRef.current={
        doc:result.data.document??result.data.projection,version:result.data.version};
    });
    return ()=>{alive=false;if(timer.current)clearTimeout(timer.current);};
  },[c.workspace.id,year]);
  useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
  async function persist(next:OperatingDocument,expected:number,kind:"save"|"confirm"="save"){
    const response=await saveOperatingV4({workspaceId:c.workspace.id,year,document:next,
      expectedVersion:expected,action:kind});
    if(!response.ok){setError(response.error);setMessage("저장 실패");return false;}
    setVersion(response.data.version);setStatus(response.data.status as "draft"|"confirmed");
    sourceRef.current={doc:next,version:response.data.version};
    setMessage(kind==="confirm"?"운영편제 확정 완료":"자동 저장 완료");
    return true;
  }
  async function saveNow(kind:"save"|"confirm"="save"){
    if(!doc||saving||!loaded||!editable)return;
    const errors=validateOperating(doc);
    if(errors.length){setError(errors[0]);return;}
    if(timer.current)clearTimeout(timer.current);
    const snapshot=doc,started=serial.current,expected=version;
    setSaving(true);setError("");setMessage("저장 중…");
    const ok=await persist(snapshot,expected,kind);
    setSaving(false);
    if(ok){setDirty(serial.current!==started);if(serial.current===started)router.refresh();}
  }
  function change(next:OperatingDocument){
    if(!editable||busy||saving||!loaded?.document)return;
    serial.current+=1;setDoc(next);setDirty(true);setError("");setMessage("변경사항 저장 대기");
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>{void (async()=>{
      // Read current state from the input event snapshot, not stale render state.
      const started=serial.current,expected=sourceRef.current.version;
      setSaving(true);
      const ok=await persist(next,expected);
      setSaving(false);
      if(ok)setDirty(serial.current!==started);
    })();},1200);
  }
  function update(id:string,grade:number,semester:number,value:number){
    if(!doc)return;
    try{change(updateOperatingCell(doc,id,grade,semester,{weekly:value}));}
    catch(e){setError(e instanceof Error?e.message:"시수 범위를 확인해 주세요.");}
  }
  function paste(text:string,row:number,col:number){
    if(!doc)return false;
    const grid=text.replace(/\r/g,"").trimEnd().split("\n").map(x=>x.split("\t"));
    if(!grid.length||grid.length>subjects.length-row||grid.some(r=>r.length>6-col))return false;
    try{
      let next=doc;
      for(let r=0;r<grid.length;r++)for(let k=0;k<grid[r].length;k++){
        const number=Number(grid[r][k].trim());
        if(!grid[r][k].trim()||!Number.isFinite(number))return false;
        next=updateOperatingCell(next,subjects[row+r].id,Math.floor((col+k)/2)+1,
          (col+k)%2+1,{weekly:number});
      }
      change(next);return true;
    }catch(e){setError(e instanceof Error?e.message:"붙여넣기 시수를 확인해 주세요.");return false;}
  }
  async function create(){
    if(!loaded||doc===null||version!==0||busy)return;
    if(loaded.missing.length){setError("먼저 누락된 입학년도 편성표를 작성해 주세요.");return;}
    setBusy(true);setError("");
    const ok=await persist(doc,0);
    if(ok){setLoaded(old=>old?{...old,document:doc}:old);router.refresh();}
    setBusy(false);
  }
  async function refreshSources(){
    if(dirty||saving){setError("현재 편성 변경을 먼저 저장해 주세요.");return;}
    const response=await loadOperatingV4({workspaceId:c.workspace.id,year});
    if(response.ok){setLoaded(response.data);setMessage("입학년도별 편성 최신 내용을 확인했습니다.");}
    else setError(response.error);
  }
  function importSource(){
    if(!loaded?.document||!doc||!editable)return;
    if(!window.confirm("운영편제의 시수를 최신 입학년도별 자료로 다시 구성할까요? 이 작업은 운영편제에만 반영되며 기존 입학생 교육과정은 변경하지 않습니다."))return;
    change({...loaded.projection,choiceSets:doc.choiceSets,offerings:doc.offerings});
  }
  async function addRow(groupId:string){
    if(!newName.trim()||busy)return;
    setBusy(true);
    const result=await addSubject({workspace_id:c.workspace.id,group_id:groupId,name:newName.trim()});
    if(result.ok){setNewSubject(null);setNewName("");setMessage("과목을 등록했습니다. 새 시수 입력을 위해 새로고침합니다.");router.refresh();}
    else setError(result.error);
    setBusy(false);
  }
  function addChoice(){
    if(!doc||!choiceName.trim()||choiceSubjectIds.length<2||
      choiceCount<1||choiceCount>=choiceSubjectIds.length)return;
    const item:OpChoice={id:crypto.randomUUID(),name:choiceName.trim(),grade:choiceGrade,
      semester:choiceSemester,subjectIds:choiceSubjectIds,requiredCount:choiceCount};
    change({...doc,choiceSets:[...doc.choiceSets,item]});
    setChoiceName("");setChoiceSubjectIds([]);setChoiceEditing(false);
  }
  function addOffering(){
    if(!doc||!offeringSubject)return;
    const item:OpOffering={id:crypto.randomUUID(),subjectId:offeringSubject,grade:offeringGrade,
      semester:offeringSemester,classIds:offeringClasses,teacherNames:offeringTeacher.split(",")
        .map(s=>s.trim()).filter(Boolean),room:offeringRoom.trim(),note:""};
    change({...doc,offerings:[...doc.offerings,item]});
    setOfferingEditing(false);setOfferingTeacher("");setOfferingRoom("");setOfferingClasses([]);
  }
  if(!loaded||!doc)return <section className="op4-loading" role="status">{error||"운영편제와 입학년도 자료를 불러오는 중입니다…"}</section>;
  const read=(subjectId:string,g:number,sem:number)=>doc.cells.find(row=>
    row.subjectId===subjectId&&row.grade===g&&row.semester===sem);
  const term=Array.from({length:6},(_,i)=>({grade:Math.floor(i/2)+1,semester:i%2+1}));
  const sourceYearClasses=c.classes.filter(row=>c.year?.id===row.academic_year_id);
  return <div className={"op4-root"+(focus==="courses"?" is-course":"")}>
    <header className="op4-head">
      <div><h2>{year}학년도 {focus==="courses"?"과목개설 관리":"운영편제"}</h2>
        <p>입학년도별 설계로부터 독립된 편성안 · v{version} · {status==="confirmed"?"확정본":"작성 중"}</p></div>
      <div className="op4-buttons no-print">
        {version>0&&<span className="op4-save-state" role="status">{saving?"저장 중…":dirty?"저장 대기":message||"저장됨"}</span>}
        <button type="button" onClick={()=>createCsv(c,doc,mode)}><Download size={14}/>표 다운로드</button>
        <button type="button" onClick={()=>void refreshSources()}>원본 갱신 확인</button>
        {version>0&&editable&&<>
          <button type="button" disabled={!dirty||saving} onClick={()=>void saveNow()}><Save size={14}/>저장</button>
          <button type="button" disabled={dirty||saving} className="op4-primary"
            onClick={()=>{if(window.confirm("현재 운영편제를 확정하고 이후 편집을 잠글까요?"))void saveNow("confirm");}}>
            <ShieldCheck size={14}/>편성안 확정
          </button>
        </>}
      </div>
    </header>
    {!version&&<div className="op4-init">
      <BookOpen size={19}/><div><strong>운영편제 초안 미리보기</strong><p>아래 표는 입학년도별 편성값을 가져온 미리보기입니다.
        운영편제를 생성해야 독립적인 수정과 저장이 가능합니다.</p>
        {loaded.missing.length>0&&<p>누락된 입학년도: {loaded.missing.join(", ")}학년도</p>}</div>
      {c.role!=="viewer"&&<button type="button" disabled={busy||!!loaded.missing.length||!doc.cells.length}
        onClick={()=>void create()}>{busy?"생성 중…":"이 내용으로 운영편제 생성"}</button>}
    </div>}
    {status==="confirmed"&&<p className="op4-hint">이 운영편제는 확정본으로 잠겨 있습니다. 입학년도별 원본과 별도로 보존됩니다.</p>}
    {mismatch&&<div className="op4-alert"><TriangleAlert size={16}/>
      <div>입학년도별 원본 문서가 운영편제 생성 당시와 달라졌습니다.
        자동 덮어쓰기는 하지 않으며, 아래 변경 차이를 확인하고 필요할 때 수동으로 가져오세요.</div>
    </div>}
    {error&&<p className="op4-error" role="alert">{error}</p>}
    <div className="op4-overview">
      <div><small>연간 운영시수(단순 합계)</small><strong>{fmt(totals?.rawTotal??0)}</strong></div>
      <div><small>학생 이수시수(선택 경로 반영)</small>
        <strong>{totals?.studentTotal===null?"검토 필요":fmt(totals?.studentTotal??0)}</strong></div>
      <div><small>입학년도별 편성 차이</small><strong>{deltas.length}건</strong></div>
      <div><small>운영편제 상태</small><strong>{status==="confirmed"?"확정":"편성 중"}</strong></div>
    </div>
    <div className="op4-shell">
      {sideOpen&&<nav className="op4-sidebar no-print" aria-label="교육과정 편제 작업 메뉴">
        <strong>편성 작업</strong>
        {["국가 기준 설정","공통과목","선택과목군","창의적 체험활동","자유학기","편성 검증"].map((item,i)=>
          <button type="button" key={item} onClick={()=>{
            const target=document.getElementById(i===2?"op4-choices":i===5?"op4-review":"op4-table");
            target?.scrollIntoView({behavior:"smooth",block:"start"});
          }}>{item}</button>)}
        <button type="button" onClick={()=>setSideOpen(false)}>작업 메뉴 접기</button>
      </nav>}
      <section className="op4-center">
        <div className="op4-table-toolbar no-print">
          {!sideOpen&&<button type="button" onClick={()=>setSideOpen(true)}>☰ 작업 메뉴</button>}
          <div className="op4-modes" role="group" aria-label="교육과정 시수 보기">
            {([["weekly","주당시수 편집"],["semester","학기시수"],["yearly","학년별 합계"]] as const)
              .map(([key,label])=><button type="button" key={key} onClick={()=>setMode(key)}
                className={mode===key?"selected":""}>{label}</button>)}
          </div>
          <button type="button" onClick={()=>setInspectorOpen(x=>!x)}>
            <Columns3 size={13}/>{inspectorOpen?"검토 접기":"검토 열기"}</button>
        </div>
        <div id="op4-table" className="op4-table-scroll" tabIndex={0} aria-label="학년도 운영편제 시수표">
          <table className="op4-table">
            <thead><tr><th rowSpan={2}>교과군</th><th rowSpan={2}>교과목</th>
              {[1,2,3].map(g=><th key={g} colSpan={mode==="yearly"?1:2}>{g}학년</th>)}
              <th rowSpan={2}>연간 합계</th></tr>
              <tr>{mode==="yearly"?[1,2,3].map(g=><th key={g}>합계</th>):
                term.map(t=><th key={t.grade+"-"+t.semester}>{t.semester}학기</th>)}</tr></thead>
            {groups.map(group=>{
              const rows=subjects.filter(s=>s.group_id===group.id);
              const fold=expanded.includes(group.id);
              return <tbody key={group.id}>
                <tr className="op4-group"><th colSpan={mode==="yearly"?6:9}>
                  <div><button type="button" onClick={()=>setExpanded(old=>fold?old.filter(x=>x!==group.id):[...old,group.id])}>
                    {fold?<ChevronRight size={13}/>:<ChevronDown size={13}/>}
                    {group.name} <small>{rows.length}개 과목</small>
                  </button>
                    {editable&&version>0&&<button type="button" onClick={()=>setNewSubject(group.id)}>
                      <Plus size={13}/>행 추가
                    </button>}
                  </div>
                </th></tr>
                {newSubject===group.id&&<tr><td colSpan={mode==="yearly"?6:9} className="op4-addrow">
                  <input type="text" placeholder="교과목 이름" autoFocus maxLength={60} value={newName}
                    onChange={e=>setNewName(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")void addRow(group.id);}}/>
                  <button disabled={busy||!newName.trim()} onClick={()=>void addRow(group.id)}>등록</button>
                  <button onClick={()=>{setNewSubject(null);setNewName("");}}>취소</button>
                </td></tr>}
                {!fold&&rows.map((s)=>{
                  const rowIndex=subjects.findIndex(a=>a.id===s.id);
                  const cellHours=term.map(({grade,semester})=>read(s.id,grade,semester));
                  return <tr key={s.id}>
                    <td className="op4-group-name">{group.name}</td>
                    <th scope="row" className="op4-subject">
                      <CurriculumRowSubjectV4 context={c} subjectId={s.id}
                        disabled={!editable||!version||busy||saving||dirty} onSaved={()=>router.refresh()}/>
                    </th>
                    {mode==="yearly"?[1,2,3].map(g=><td key={g} className="op4-derived">
                      {fmt(cellHours.slice((g-1)*2,g*2).reduce((sum,c)=>sum+(c?opHours(c):0),0))}</td>):
                      term.map(({grade,semester},col)=>{
                        const item=cellHours[col];
                        return <td key={col} className={mode==="weekly"?"op4-entry":"op4-derived"}>
                          {mode==="weekly"?<HourField key={s.id+":"+grade+":"+semester}
                            index={rowIndex+":"+col} disabled={!editable||!version||saving}
                            value={item?.weekly??0}
                            onValue={v=>update(s.id,grade,semester,v)}
                            onBlock={text=>paste(text,rowIndex,col)}/>
                            :<button type="button" className="op4-value"
                              title="주당시수와 조정 내역을 수정하려면 주당시수 편집으로 전환"
                              onClick={()=>setMode("weekly")}>{fmt(item?opHours(item):0)}</button>}
                        </td>;
                      })}
                    <td className="op4-total">{fmt(cellHours.reduce((sum,cell)=>sum+(cell?opHours(cell):0),0))}</td>
                  </tr>;
                })}
              </tbody>;
            })}
            <tfoot><tr><th colSpan={2}>학년·학기별 편성시수</th>
              {mode==="yearly"?[1,2,3].map(g=><td key={g}>{fmt(totals?.byGrade[g-1]??0)}</td>):
                term.map((t,i)=><td key={i}>{fmt(totals?.byTerm[i]??0)}</td>)}
              <td>{fmt(totals?.rawTotal??0)}</td>
            </tr></tfoot>
          </table>
        </div>
        {version>0&&editable&&<div className="op4-adjust-editor no-print">
          <strong>학기별 조정 시수</strong>
          <span>실제 운영시수가 주당시수 × 적용 주수와 다를 때 조정값과 이유를 기록합니다.</span>
          <select aria-label="조정 과목" value={offeringSubject}
            onChange={e=>setOfferingSubject(e.target.value)}>
            <option value="">과목 선택</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select aria-label="조정 학년" value={offeringGrade}
            onChange={e=>setOfferingGrade(Number(e.target.value))}>
            {[1,2,3].map(n=><option key={n} value={n}>{n}학년</option>)}</select>
          <select aria-label="조정 학기" value={offeringSemester}
            onChange={e=>setOfferingSemester(Number(e.target.value))}>
            {[1,2].map(n=><option key={n} value={n}>{n}학기</option>)}</select>
          {offeringSubject&&(()=>{
            const row=read(offeringSubject,offeringGrade,offeringSemester);
            return <>
              <label>운영 주수 <input type="number" min={1} max={24}
                value={row?.weeks??16} onChange={e=>{
                  const n=Number(e.target.value);if(!doc||!Number.isInteger(n)||n<1)return;
                  change(updateOperatingCell(doc,offeringSubject,offeringGrade,offeringSemester,{weeks:n}));
                }}/></label>
              <label>시수 조정 <input type="number" value={row?.adjustment??0}
                onChange={e=>{
                  if(!doc||!e.target.value||!Number.isFinite(Number(e.target.value)))return;
                  try{change(updateOperatingCell(doc,offeringSubject,offeringGrade,
                    offeringSemester,{adjustment:Number(e.target.value)}));}
                  catch(err){setError(err instanceof Error?err.message:"범위 초과");}
                }}/></label>
              <label>조정 사유 <input type="text" maxLength={500}
                placeholder="집중이수·자유학기 조정 등" value={row?.note??""}
                onChange={e=>{
                  if(doc)change(updateOperatingCell(doc,offeringSubject,offeringGrade,
                    offeringSemester,{note:e.target.value}));
                }}/></label>
            </>;
          })()}
        </div>}
      </section>
      {inspectorOpen&&<aside className="op4-inspector" id="op4-review">
        <div className="op4-inspector-head"><strong>교육과정 검토</strong>
          <span>국가 기준 · 운영 현황</span></div>
        <p>당해연도 운영편제에는 서로 다른 입학생 집단이 포함됩니다.
          국가의 3개년 기준은 <b>각 입학년도별 편성표</b>에서 검증해야 합니다.</p>
        {[1,2,3].map(g=><div className="op4-grade-stat" key={g}>
          <span>{g}학년 <small>({year-g+1} 입학생)</small></span>
          <strong>{fmt(totals?.byGrade[g-1]??0)}시간</strong>
        </div>)}
        <div className="op4-week-settings no-print">
          <strong>학기별 적용 주수</strong>
          {term.map(({grade,semester})=><label key={grade+"-"+semester}>
            {grade}학년 {semester}학기
            <select value={read(subjects[0]?.id??"",grade,semester)?.weeks??16}
              disabled={!editable||!version||saving}
              onChange={e=>{if(doc)change(applyOperatingWeeks(doc,grade,semester,Number(e.target.value)));}}>
              {Array.from({length:8},(_,i)=>i+13).map(n=><option key={n} value={n}>{n}주</option>)}
            </select>
          </label>)}
        </div>
        {deltas.length>0&&<div className="op4-diff">
          <strong>입학년도 원본 대비 차이 {deltas.length}건</strong>
          {deltas.slice(0,7).map(x=><p key={opKey(x.subjectId,x.grade,x.semester)}>
            {subjects.find(s=>s.id===x.subjectId)?.name??"과목"} {x.grade}-{x.semester}:
            {fmt(x.source)} → {fmt(x.operating)} ({x.delta>0?"+":""}{fmt(x.delta)})
          </p>)}
          {editable&&<button type="button" onClick={importSource}>원본에서 다시 가져오기</button>}
        </div>}
        {totals?.ambiguous.length?<div className="op4-alert">
          <TriangleAlert size={15}/>선택과목군 시수가 일치하지 않아 학생 이수시수 검증이 필요합니다.
        </div>:<p className="op4-hint"><Check size={13}/>등록된 선택과목군 계산에 불일치가 없습니다.</p>}
        <div className="op4-history"><History size={14}/>이전 버전 {loaded.history.length}개 보존</div>
      </aside>}
    </div>
    <section id="op4-choices" className="op4-bottom">
      <header><h3>선택과목군</h3><p>학생이 실제 선택하는 과목 수를 지정해 중복 합산을 방지합니다.</p></header>
      <div className="op4-cards">
        {doc.choiceSets.map(x=><article key={x.id}>
          <strong>{x.name}</strong><span>{x.grade}학년 {x.semester}학기 · {x.subjectIds.length}과목 중 {x.requiredCount}과목 선택</span>
          <small>{x.subjectIds.map(id=>subjects.find(s=>s.id===id)?.name??id).join(" / ")}</small>
          {editable&&version>0&&<button type="button" onClick={()=>{if(window.confirm("선택과목군을 삭제할까요?"))change({...doc,choiceSets:doc.choiceSets.filter(y=>y.id!==x.id)});}}>삭제</button>}
        </article>)}
        {editable&&version>0&&!choiceEditing&&<button type="button" className="op4-add-card"
          onClick={()=>setChoiceEditing(true)}><Plus size={15}/>선택과목군 추가</button>}
      </div>
      {choiceEditing&&<div className="op4-form no-print">
        <input placeholder="선택과목군 이름" value={choiceName} onChange={e=>setChoiceName(e.target.value)}/>
        <select value={choiceGrade} onChange={e=>setChoiceGrade(Number(e.target.value))}>
          {[1,2,3].map(n=><option key={n} value={n}>{n}학년</option>)}</select>
        <select value={choiceSemester} onChange={e=>setChoiceSemester(Number(e.target.value))}>
          {[1,2].map(n=><option key={n} value={n}>{n}학기</option>)}</select>
        <label>선택할 과목 수 <input type="number" min={1} max={10} value={choiceCount}
          onChange={e=>setChoiceCount(Number(e.target.value))}/></label>
        <div className="op4-choice-options">{subjects.map(s=><label key={s.id}>
          <input type="checkbox" checked={choiceSubjectIds.includes(s.id)}
            onChange={e=>setChoiceSubjectIds(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id))}/>
          {s.name}</label>)}</div>
        <button type="button" onClick={addChoice}>과목군 생성</button>
        <button type="button" onClick={()=>setChoiceEditing(false)}>취소</button>
      </div>}
    </section>
    <section className="op4-bottom" id="op4-offerings">
      <header><h3>과목개설 · 담당교사</h3>
        <p>편제 시수와 교사별 수업 배정을 분리합니다. 같은 과목에 여러 담당교사를 등록할 수 있습니다.</p></header>
      <div className="op4-cards">
        {doc.offerings.map(item=><article key={item.id}>
          <strong>{subjects.find(s=>s.id===item.subjectId)?.name??"과목"}</strong>
          <span>{item.grade}학년 {item.semester}학기 · {item.teacherNames.join(" · ")||"교사 미지정"}</span>
          <small>{item.room||"강의실 미지정"} · 학급 {item.classIds.length}개</small>
          {editable&&version>0&&<button type="button" onClick={()=>change({...doc,offerings:doc.offerings.filter(x=>x.id!==item.id)})}>삭제</button>}
        </article>)}
        {editable&&version>0&&!offeringEditing&&<button type="button" className="op4-add-card"
          onClick={()=>setOfferingEditing(true)}><Plus size={15}/>과목개설 등록</button>}
      </div>
      {offeringEditing&&<div className="op4-form no-print">
        <select value={offeringSubject} onChange={e=>setOfferingSubject(e.target.value)}>
          <option value="">과목 선택</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={offeringGrade} onChange={e=>setOfferingGrade(Number(e.target.value))}>
          {[1,2,3].map(n=><option key={n} value={n}>{n}학년</option>)}</select>
        <select value={offeringSemester} onChange={e=>setOfferingSemester(Number(e.target.value))}>
          {[1,2].map(n=><option key={n} value={n}>{n}학기</option>)}</select>
        <input placeholder="담당교사 여러 명은 쉼표로 구분" value={offeringTeacher}
          onChange={e=>setOfferingTeacher(e.target.value)}/>
        <input placeholder="강의실" value={offeringRoom} onChange={e=>setOfferingRoom(e.target.value)}/>
        <div className="op4-choice-options">{sourceYearClasses.filter(x=>x.grade===offeringGrade).map(x=><label key={x.id}>
          <input type="checkbox" checked={offeringClasses.includes(x.id)}
            onChange={e=>setOfferingClasses(old=>e.target.checked?[...old,x.id]:old.filter(id=>id!==x.id))}/>
          {x.grade}학년 {x.class_number}반</label>)}</div>
        <button type="button" onClick={addOffering}>과목개설 저장</button>
        <button type="button" onClick={()=>setOfferingEditing(false)}>취소</button>
      </div>}
    </section>
    <p className="op4-footnote">운영편제와 입학년도별 설계는 각각 독립 저장됩니다. 운영편제의 수정은 입학년도별 3개년 원본을 바꾸지 않습니다. 시간표 자동 배정은 확정된 운영편제의 주당 시수 및 학급·교사 정보를 확인한 뒤 적용해야 합니다.</p>
    {onNavigate&&<button type="button" className="op4-footnav no-print" onClick={()=>onNavigate("timetable")}>시간표 연계 설정으로 이동</button>}
  </div>;
}
