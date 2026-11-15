'use client';

import {useEffect,useMemo,useState} from 'react';
import {
  ArrowDown,ArrowLeft,ArrowRight,ArrowUp,BookOpen,Check,CheckCircle2,ChevronRight,
  ClipboardCheck,Copy,Download,FilePenLine,FilePlus2,FileText,FolderOpen,
  LayoutTemplate,ListPlus,MoreHorizontal,Plus,Printer,Save,Settings2,Trash2,X,
} from 'lucide-react';

const makeId=()=>globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const ymd=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const clone=v=>JSON.parse(JSON.stringify(v));
const TYPES=[{value:'text',label:'단답형'},{value:'textarea',label:'장문형'},{value:'date',label:'날짜'},{value:'number',label:'숫자'},{value:'select',label:'선택형'},{value:'checkbox',label:'확인란'}];
const field=(label,type='text',required=false,options='')=>({id:makeId(),label,type,required,options});
const STARTERS=[
  {id:'blank',name:'빈 서식',icon:LayoutTemplate,description:'항목을 직접 구성하는 새로운 업무 서식',fields:[field('첫 번째 항목')]},
  {id:'meeting',name:'회의록',icon:BookOpen,description:'회의별 안건, 논의 내용 및 결정 사항',fields:[field('회의 일자','date',true),field('회의명','text',true),field('참석자','text'),field('안건','textarea',true),field('논의 내용','textarea'),field('결정 사항','textarea'),field('후속 업무','textarea')]},
  {id:'dorm',name:'기숙사 운영일지',icon:ClipboardCheck,description:'일일 점호, 운영 현황, 전달 사항',fields:[field('운영 날짜','date',true),field('당직 담당자','text',true),field('점호 상태','select',true,'정상\n확인 필요'),field('주요 특이사항','textarea'),field('인수인계 사항','textarea')]},
  {id:'check',name:'시설 점검표',icon:FileText,description:'점검 결과와 조치 내역을 누적 기록',fields:[field('점검 날짜','date',true),field('점검 구역','text',true),field('점검 결과','select',true,'양호\n조치 필요\n해당 없음'),field('조치 완료','checkbox'),field('조치 및 메모','textarea')]},
];
function download(filename,contents,type='text/csv;charset=utf-8;'){
  const blob=new Blob([contents],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const excelSafe=v=>{let value=String(v??'');if(/^[\s]*[=+\-@]/.test(value))value=`'${value}`;return `"${value.replaceAll('"','""')}"`;};
const displayValue=(f,v)=>f.type==='checkbox'?(v?'완료':'미완료'):(v===null||v===undefined||v===''?'—':String(v));

export default function FormStudio({space,updateSpace,notify,route}){
  const forms=space.forms||[];const entries=space.formEntries||[];
  const [screen,setScreen]=useState('gallery');
  const [selected,setSelected]=useState(null);
  const [draft,setDraft]=useState(null);
  const [entryId,setEntryId]=useState(null);
  const [entrySchema,setEntrySchema]=useState(null);
  const [answers,setAnswers]=useState({});
  const [error,setError]=useState('');
  const [showStarters,setShowStarters]=useState(false);
  const active=forms.find(f=>f.id===selected);
  const currentEntry=entries.find(e=>e.id===entryId);
  const formEntries=useMemo(()=>entries.filter(e=>e.formId===selected).sort((a,b)=>b.updated.localeCompare(a.updated)),[entries,selected]);
  useEffect(()=>{
    if(route?.nonce && route.formId){setSelected(route.formId);setScreen('records');setError('');}
  },[route?.nonce,route?.formId]);
  const openForm=(f)=>{setSelected(f.id);setScreen('records');setError('');};
  const back=()=>{setError('');if(['builder','records'].includes(screen)){setScreen('gallery');setDraft(null);}else{setScreen('records');setEntryId(null);}};
  const newForm=(preset)=>{
    setDraft({id:makeId(),name:preset.name==='빈 서식'?'새 서식':preset.name,description:preset.id==='blank'?'':preset.description,fields:clone(preset.fields).map(f=>({...f,id:makeId()})),version:1,created:ymd(),updated:ymd()});
    setShowStarters(false);setError('');setScreen('builder');
  };
  const editForm=f=>{setDraft(clone(f));setSelected(f.id);setError('');setScreen('builder');};
  const saveForm=()=>{
    const name=draft?.name?.trim();if(!name){setError('서식 이름을 입력해 주세요.');return;}
    if(draft.fields.length===0 || draft.fields.some(f=>!f.label.trim())){setError('모든 입력 항목의 이름을 작성해 주세요.');return;}
    if(draft.fields.some(f=>f.type==='select' && !f.options.trim().split('\n').some(Boolean))){setError('선택형 항목에는 한 개 이상의 선택지를 입력해 주세요.');return;}
    const existing=forms.find(f=>f.id===draft.id);const next={...draft,name,version:existing?existing.version+1:1,updated:ymd()};
    updateSpace(s=>({...s,forms:[...(s.forms||[]).filter(f=>f.id!==next.id),next]}));
    setSelected(next.id);setScreen('records');setDraft(null);setError('');notify('서식을 저장했습니다. 학교별 작업공간에 보관됩니다.');
  };
  const deleteForm=f=>{
    const count=entries.filter(e=>e.formId===f.id).length;
    if(!window.confirm(`'${f.name}' 서식과 작성 기록 ${count}건을 삭제할까요? 복구할 수 없습니다.`))return;
    updateSpace(s=>({...s,forms:(s.forms||[]).filter(x=>x.id!==f.id),formEntries:(s.formEntries||[]).filter(x=>x.formId!==f.id),menus:s.menus.filter(x=>x.formId!==f.id)}));
    setScreen('gallery');setSelected(null);notify('서식과 연결된 기록을 삭제했습니다.');
  };
  const duplicateForm=f=>{const next={...clone(f),id:makeId(),name:`${f.name} 복사본`,fields:f.fields.map(x=>({...x,id:makeId()})),version:1,created:ymd(),updated:ymd()};updateSpace(s=>({...s,forms:[...(s.forms||[]),next]}));notify('서식을 복제했습니다.');};
  const isPinned=id=>space.menus.some(m=>m.type==='form'&&m.formId===id);
  const pinForm=f=>{
    if(isPinned(f.id)){updateSpace(s=>({...s,menus:s.menus.filter(m=>!(m.type==='form'&&m.formId===f.id))}));notify('학교 메뉴에서 서식을 해제했습니다.');}
    else{updateSpace(s=>({...s,menus:[...s.menus,{id:makeId(),title:f.name,type:'form',formId:f.id}]}));notify('서식을 학교 맞춤 메뉴에 등록했습니다.');}
  };
  const startEntry=(record=null)=>{
    setEntryId(record?.id??null);const schema=clone(record?.fields||active?.fields||[]);setEntrySchema(schema);
    setAnswers(record?.values?clone(record.values):Object.fromEntries(schema.map(f=>[f.id,f.type==='checkbox'?false:f.type==='date'?ymd():''])));
    setError('');setScreen('fill');
  };
  const saveEntry=()=>{
    for(const f of entrySchema){const v=answers[f.id];if(f.required&&(v===null||v===undefined||v===''||(f.type==='checkbox'&&!v))){setError(`'${f.label}' 항목은 필수입니다.`);return;}}
    const next={id:entryId||makeId(),formId:selected,formTitle:active?.name||currentEntry?.formTitle||'',formVersion:entryId?currentEntry.formVersion:active.version,fields:clone(entrySchema),values:clone(answers),created:entryId?currentEntry.created:ymd(),updated:ymd()};
    updateSpace(s=>({...s,formEntries:entryId?(s.formEntries||[]).map(e=>e.id===entryId?next:e):[next,...(s.formEntries||[])]}));
    setEntryId(next.id);setScreen('detail');setError('');notify('작성 기록을 저장했습니다.');
  };
  const removeEntry=e=>{if(!window.confirm('이 작성 기록을 삭제할까요?'))return;updateSpace(s=>({...s,formEntries:(s.formEntries||[]).filter(x=>x.id!==e.id)}));setScreen('records');setEntryId(null);notify('기록을 삭제했습니다.');};
  const exportCsv=()=>{
    if(!active)return;const headers=['작성일','수정일',...active.fields.map(f=>f.label)];const rows=formEntries.map(e=>[e.created,e.updated,...active.fields.map(f=>displayValue(f,e.values[f.id]))]);
    const contents='\ufeff'+[headers,...rows].map(r=>r.map(excelSafe).join(',')).join('\r\n');download(`${active.name.replace(/[\\/:*?"<>|]/g,'_')}_작성기록.csv`,contents);notify(`${formEntries.length}건을 CSV로 내려받았습니다.`);
  };
  const exportJson=()=>{if(!active)return;download(`${active.name.replace(/[\\/:*?"<>|]/g,'_')}.json`,JSON.stringify({form:active,entries:formEntries},null,2),'application/json');notify('서식과 작성 기록을 JSON으로 저장했습니다.');};
  const onDraftChange=(key,value)=>setDraft(s=>({...s,[key]:value}));
  const onFieldChange=(id,key,value)=>setDraft(s=>({...s,fields:s.fields.map(f=>f.id===id?{...f,[key]:value}:f)}));
  const moveField=(index,diff)=>setDraft(s=>{const list=[...s.fields];const j=index+diff;if(j<0||j>=list.length)return s;[list[index],list[j]]=[list[j],list[index]];return {...s,fields:list};});
  const removeField=(id)=>setDraft(s=>({...s,fields:s.fields.filter(f=>f.id!==id)}));

  return <div className="studio-shell">
    {screen!=='gallery'&&<div className="studio-heading studio-heading-compact"><button className="btn outline" onClick={back}><ArrowLeft size={16}/> 서식 목록으로</button></div>}

    {screen==='gallery'&&<>
      <div className="studio-hero"><div><span className="studio-hero-icon"><LayoutTemplate size={22}/></span><strong>서식 하나로 반복 업무를 더 간편하게</strong><p>필요한 항목을 직접 만들고, 새로운 기록을 누적하세요. 학교 메뉴에도 등록할 수 있습니다.</p></div><button className="btn primary" onClick={()=>setShowStarters(true)}><Plus size={17}/> 서식 만들기</button></div>
      <div className="studio-row-heading"><h3>우리 학교 서식</h3><span>{forms.length}개</span></div>
      {forms.length===0?<div className="studio-empty"><FolderOpen size={29}/><h3>아직 만든 서식이 없어요.</h3><p>회의록이나 점검표 서식을 가져와 시작해 보세요.</p><button className="btn outline" onClick={()=>setShowStarters(true)}>첫 서식 만들기</button></div>:<div className="studio-form-grid">{forms.map(f=><div key={f.id} className="studio-form-card"><div className="studio-form-card-head"><span><FileText size={21}/></span>{isPinned(f.id)&&<small>학교 메뉴 등록됨</small>}</div><button className="studio-card-main" onClick={()=>openForm(f)}><strong>{f.name}</strong><small>{f.description||'설명 없음'}</small></button><div className="studio-card-bottom"><span>항목 {f.fields.length}개 · 기록 {entries.filter(e=>e.formId===f.id).length}건</span><button onClick={()=>openForm(f)}>열기 <ArrowRight size={15}/></button></div></div>)}</div>}
    </>}

    {screen==='builder'&&draft&&<>
      <div className="studio-builder-header"><div><h2>{forms.some(f=>f.id===draft.id)?'서식 수정':'새 서식 만들기'}</h2><p>항목 유형과 순서를 바꾸면 입력 화면이 자동으로 만들어집니다.</p></div><button className="btn primary" onClick={saveForm}><Save size={16}/> 서식 저장</button></div>
      <div className="studio-builder-grid"><div className="studio-builder-editor">
        <section className="studio-card"><h3>서식 기본 정보</h3><label className="studio-label">서식 이름 <em>*</em><input maxLength={70} value={draft.name} onChange={e=>onDraftChange('name',e.target.value)} placeholder="예: 학년 협의록"/></label><label className="studio-label">설명<textarea rows="2" maxLength={250} value={draft.description||''} onChange={e=>onDraftChange('description',e.target.value)} placeholder="서식의 용도를 입력하세요"/></label></section>
        <section className="studio-card"><div className="studio-section-title"><h3>입력 항목</h3><span>{draft.fields.length}개</span></div><div className="studio-fields">{draft.fields.map((f,i)=><div className="studio-field-card" key={f.id}><div className="studio-field-top"><strong><span>{String(i+1).padStart(2,'0')}</span> 입력 항목</strong><div><button aria-label="위로 이동" disabled={i===0} onClick={()=>moveField(i,-1)}><ArrowUp size={15}/></button><button aria-label="아래로 이동" disabled={i===draft.fields.length-1} onClick={()=>moveField(i,1)}><ArrowDown size={15}/></button><button aria-label="항목 삭제" onClick={()=>removeField(f.id)}><Trash2 size={15}/></button></div></div><div className="studio-field-row"><label className="studio-label">항목 이름<input maxLength={70} value={f.label} onChange={e=>onFieldChange(f.id,'label',e.target.value)} placeholder="항목 이름"/></label><label className="studio-label">입력 방식<select value={f.type} onChange={e=>onFieldChange(f.id,'type',e.target.value)}>{TYPES.map(t=><option value={t.value} key={t.value}>{t.label}</option>)}</select></label></div>{f.type==='select'&&<label className="studio-label">선택지 (한 줄에 하나)<textarea rows={3} value={f.options} onChange={e=>onFieldChange(f.id,'options',e.target.value)} placeholder={'양호\n확인 필요\n해당 없음'}/></label>}<label className="studio-checkline"><input type="checkbox" checked={!!f.required} onChange={e=>onFieldChange(f.id,'required',e.target.checked)}/> 필수 항목으로 지정</label></div>)}</div><button className="studio-add-field" onClick={()=>setDraft(s=>({...s,fields:[...s.fields,field('새 입력 항목')]}))}><Plus size={17}/> 입력 항목 추가</button></section>
        {error&&<p className="studio-error" role="alert">{error}</p>}<button className="btn primary" onClick={saveForm}><Check size={16}/> 이 서식 저장</button>
      </div><aside className="studio-builder-preview"><div className="studio-card"><div className="studio-section-title"><h3>입력 화면 미리보기</h3><span>시뮬레이션</span></div><h3 className="studio-preview-name">{draft.name||'제목 없는 서식'}</h3><p>{draft.description}</p>{draft.fields.map(f=><label key={f.id} className="studio-label">{f.label||'이름 없는 항목'} {f.required&&<em>*</em>}{f.type==='textarea'?<textarea disabled rows="2" placeholder="내용을 입력하세요"/>:f.type==='select'?<select disabled><option>선택해 주세요</option>{f.options.split('\n').filter(Boolean).map(o=><option key={o}>{o}</option>)}</select>:f.type==='checkbox'?<span className="studio-checkline"><input type="checkbox" disabled/> 확인</span>:<input disabled type={f.type==='number'?'number':f.type==='date'?'date':'text'} placeholder="입력 영역"/>}</label>)}</div></aside></div>
    </>}

    {screen==='records'&&<>{!active?<div className="studio-empty"><p>서식을 찾을 수 없어요. 서식 목록으로 돌아가 주세요.</p></div>:<>
      <div className="studio-detail-heading"><div><span className="studio-kicker">REUSABLE FORM · v{active.version}</span><h2>{active.name}</h2><p>{active.description||'학교 업무를 위한 맞춤 서식'}</p></div><button className="btn primary" onClick={()=>startEntry()}><Plus size={17}/> 새 기록 작성</button></div>
      <div className="studio-action-bar"><button onClick={()=>editForm(active)}><Settings2 size={16}/> 서식 수정</button><button onClick={()=>pinForm(active)}><LayoutTemplate size={16}/>{isPinned(active.id)?'학교 메뉴에서 해제':'학교 메뉴에 등록'}</button><button onClick={()=>duplicateForm(active)}><Copy size={16}/> 복제</button><button onClick={exportCsv}><Download size={16}/> CSV</button><button onClick={exportJson}><Download size={16}/> JSON</button><button className="destructive" onClick={()=>deleteForm(active)}><Trash2 size={16}/> 서식 삭제</button></div>
      <section className="studio-card"><div className="studio-section-title"><h3>작성 기록</h3><span>{formEntries.length}건 · 신규 기록은 현재 서식 버전으로 생성됩니다.</span></div>{formEntries.length===0?<div className="studio-empty inline"><FilePlus2 size={27}/><h3>작성한 기록이 없습니다.</h3><p>버튼을 눌러 첫 번째 기록을 작성해 보세요.</p></div>:<div className="studio-record-list">{formEntries.map((e,i)=><button key={e.id} onClick={()=>{setEntryId(e.id);setScreen('detail');}} className="studio-record-row"><span className="studio-record-number">{String(formEntries.length-i).padStart(2,'0')}</span><span className="studio-record-info"><strong>{e.formTitle||active.name} · {e.created}</strong><small>수정 {e.updated} · 서식 v{e.formVersion}</small></span><ChevronRight size={18}/></button>)}</div>}</section>
    </>}</>}

    {screen==='fill'&&active&&entrySchema&&<><div className="studio-detail-heading"><div><span className="studio-kicker">FORM ENTRY</span><h2>{entryId?'작성 기록 수정':'새 기록 작성'}</h2><p>{active.name} · {entryId?'기존 기록의 서식 항목을 유지합니다.':'현재 서식 버전으로 작성합니다.'}</p></div></div><section className="studio-card studio-form-paper"><div className="studio-paper-head"><span><FilePenLine size={18}/> {active.name}</span><small>{entrySchema.length}개 항목</small></div>{entrySchema.map(f=><label className="studio-label" key={f.id}>{f.label} {f.required&&<em>*</em>}{f.type==='textarea'?<textarea rows={5} value={answers[f.id]??''} onChange={e=>setAnswers(s=>({...s,[f.id]:e.target.value}))} placeholder="내용을 입력하세요"/>:f.type==='select'?<select value={answers[f.id]??''} onChange={e=>setAnswers(s=>({...s,[f.id]:e.target.value}))}><option value="">선택해 주세요</option>{(f.options||'').split('\n').map(x=>x.trim()).filter(Boolean).map(o=><option key={o}>{o}</option>)}</select>:f.type==='checkbox'?<span className="studio-checkline"><input type="checkbox" checked={!!answers[f.id]} onChange={e=>setAnswers(s=>({...s,[f.id]:e.target.checked}))}/> 해당 사항 확인</span>:<input type={f.type==='number'?'number':f.type==='date'?'date':'text'} value={answers[f.id]??''} onChange={e=>setAnswers(s=>({...s,[f.id]:e.target.value}))} placeholder="값을 입력하세요"/>}</label>)}{error&&<p className="studio-error" role="alert">{error}</p>}<div className="studio-form-actions"><button className="btn outline" onClick={back}>취소</button><button className="btn primary" onClick={saveEntry}><CheckCircle2 size={17}/> 기록 저장하기</button></div></section></>}

    {screen==='detail'&&currentEntry&&<><div className="studio-detail-heading"><div><span className="studio-kicker">SAVED RECORD</span><h2>{currentEntry.formTitle}</h2><p>작성 {currentEntry.created} · 마지막 수정 {currentEntry.updated} · 서식 v{currentEntry.formVersion}</p></div><div className="studio-record-actions"><button className="btn outline" onClick={()=>startEntry(currentEntry)}><FilePenLine size={16}/> 수정</button><button className="btn primary" onClick={()=>window.print()}><Printer size={16}/> 인쇄</button></div></div><section className="studio-card studio-saved-paper print-scope"><div className="studio-paper-head"><span>{currentEntry.formTitle}</span><small>{currentEntry.created}</small></div><div className="studio-answer-grid">{currentEntry.fields.map(f=><div key={f.id} className="studio-answer"><strong>{f.label}</strong><p>{displayValue(f,currentEntry.values[f.id])}</p></div>)}</div></section><button className="studio-delete-record" onClick={()=>removeEntry(currentEntry)}><Trash2 size={16}/> 작성 기록 삭제</button></>}

    {showStarters&&<div className="studio-overlay" onMouseDown={()=>setShowStarters(false)}><div className="studio-modal" role="dialog" aria-modal="true" aria-label="서식 템플릿 선택" onMouseDown={e=>e.stopPropagation()}><div className="studio-modal-head"><div><h2>서식 만들기</h2><p>빈 서식 또는 기본 템플릿을 선택하세요.</p></div><button aria-label="닫기" onClick={()=>setShowStarters(false)}><X size={19}/></button></div><div className="studio-starter-list">{STARTERS.map(t=><button key={t.id} onClick={()=>newForm(t)}><span><t.icon size={21}/></span><div><strong>{t.name}</strong><small>{t.description}</small></div><ArrowRight size={17}/></button>)}</div></div></div>}
  </div>;
}
