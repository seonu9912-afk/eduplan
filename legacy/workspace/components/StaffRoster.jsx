'use client';
import {useMemo,useState} from 'react';
import {Plus,Save,Trash2,UsersRound,Info,X,PenLine} from 'lucide-react';

const EMPLOYMENT=['정규교원','기간제교원','그 외'];
const STATUS=['재직','휴직','파견','퇴직'];
const SUBJECTS=['국어','사회','역사','도덕','수학','과학','기술·가정','정보','체육','음악','미술','영어','특수','보건','진로·상담','기타'];
const id=()=>`teacher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const blank=()=>({name:'',subject:'국어',employment:'정규교원',status:'재직',startDate:'',endDate:''});

export default function StaffRoster({space,updateSpace,notify}){
  const roster=Array.isArray(space.staffMembers)?space.staffMembers:[];
  const quotas=space.staffQuotas&&typeof space.staffQuotas==='object'&&!Array.isArray(space.staffQuotas)?space.staffQuotas:{};
  const [draft,setDraft]=useState(blank());
  const [editing,setEditing]=useState(null);
  const [quotaSubject,setQuotaSubject]=useState('국어');
  const [quotaValue,setQuotaValue]=useState('');
  const active=useMemo(()=>roster.filter(p=>p.status==='재직'),[roster]);
  const quotaTotal=Object.values(quotas).reduce((n,v)=>n+Math.max(0,Number(v)||0),0);
  const commit=(next,message)=>{updateSpace(s=>({...s,staffMembers:next}));if(message)notify(message);};
  const save=()=>{
    const name=draft.name.trim();
    const subject=draft.subject.trim();
    if(!name||!subject){notify('교원 표시명과 담당 교과를 입력해 주세요.');return;}
    if(draft.startDate&&draft.endDate&&draft.startDate>draft.endDate){notify('근무 종료일은 시작일보다 빠를 수 없습니다.');return;}
    const value={...draft,id:editing||id(),name:name.slice(0,50),subject:subject.slice(0,45)};
    const next=editing?roster.map(x=>x.id===editing?value:x):[...roster,value];
    commit(next,editing?'교원 정보를 수정했어요.':'교원을 목록에 등록했어요.');setEditing(null);setDraft(blank());
  };
  const saveQuota=()=>{
    const n=quotaValue===''?null:Number(quotaValue);
    if(n!==null&&(!Number.isInteger(n)||n<0||n>200)){notify('정원은 0~200명 사이의 정수로 입력해 주세요.');return;}
    updateSpace(s=>{const next={...(s.staffQuotas||{})};if(n===null)delete next[quotaSubject];else next[quotaSubject]=n;return {...s,staffQuotas:next};});
    notify('교과별 정원을 저장했어요.');setQuotaValue('');
  };
  return <section className="staff-roster panel spacious admin-bottom" id="staff-management" aria-label="학교 교원 관리">
    <div className="panel-head"><div><h3><UsersRound size={20}/> 교원 목록 관리</h3><p>학교의 실제 근무 교원과 교과별 정원을 등록합니다. 교원 수요를 시수로 추정하지 않습니다.</p></div><span className="staff-counter">재직 {active.length}명 · 등록 {roster.length}명</span></div>
    <div className="staff-roster-layout"><div className="staff-roster-left">
      {roster.length?<div className="staff-roster-scroll"><table className="staff-roster-table"><thead><tr><th>표시명</th><th>담당 교과</th><th>유형</th><th>근무 상태</th><th>관리</th></tr></thead><tbody>{roster.map(person=><tr key={person.id}><td><strong>{person.name}</strong>{(person.startDate||person.endDate)&&<small>{person.startDate||'—'} ~ {person.endDate||'현재'}</small>}</td><td>{person.subject}</td><td>{person.employment}</td><td><span className={person.status==='재직'?'staff-on':'staff-off'}>{person.status}</span></td><td><div className="staff-actions"><button title="정보 수정" aria-label={`${person.name} 수정`} onClick={()=>{setEditing(person.id);setDraft({...person});}}><PenLine size={15}/></button><button title="목록에서 삭제" aria-label={`${person.name} 삭제`} onClick={()=>{if(window.confirm(`'${person.name}' 교원을 목록에서 삭제할까요? 기존 시간표에 배정된 교원 정보는 자동 삭제되지 않습니다.`))commit(roster.filter(x=>x.id!==person.id),'교원 목록에서 삭제했습니다.');}}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>:<p className="staff-empty">아직 등록된 교원이 없어요. 오른쪽에서 표시명과 교과를 입력해 주세요.</p>}
      <div className="staff-quota"><div className="staff-quota-head"><h4>교과별 정원 관리 (선택)</h4><p>정원은 학교에서 이미 정한 숫자를 기록합니다. 등록된 교원의 재직 여부와 별도로 관리해요.</p></div><div className="staff-quota-inputs"><label>교과<select value={quotaSubject} onChange={e=>{setQuotaSubject(e.target.value);setQuotaValue(quotas[e.target.value]===undefined?'':String(quotas[e.target.value]));}}>{[...new Set([...SUBJECTS,...Object.keys(quotas)])].map(s=><option key={s}>{s}</option>)}</select></label><label>정원 (명)<input type="number" min="0" max="200" value={quotaValue} placeholder={quotas[quotaSubject]??'미설정'} onChange={e=>setQuotaValue(e.target.value)}/></label><button type="button" onClick={saveQuota}><Save size={15}/> 저장</button></div><div className="staff-quota-tags">{Object.entries(quotas).map(([subject,n])=><button type="button" key={subject} title="정원 편집" onClick={()=>{setQuotaSubject(subject);setQuotaValue(String(n));}}>{subject} {n}명</button>)}{!Object.keys(quotas).length&&<small>등록된 교과별 정원이 없습니다.</small>}</div></div>
    </div><div className="staff-roster-form"><div className="staff-form-title"><h4>{editing?'교원 정보 수정':'교원 새로 등록'}</h4>{editing&&<button title="수정 취소" aria-label="수정 취소" onClick={()=>{setEditing(null);setDraft(blank());}}><X size={16}/></button>}</div><label>교원 표시명<input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="예: 국어 교사 A" maxLength="50"/></label><label>담당 교과<input list="staff-subject-options" value={draft.subject} onChange={e=>setDraft(d=>({...d,subject:e.target.value}))} maxLength="45"/><datalist id="staff-subject-options">{SUBJECTS.map(x=><option key={x} value={x}/>)}</datalist></label><div className="staff-form-pair"><label>교원 유형<select value={draft.employment} onChange={e=>setDraft(d=>({...d,employment:e.target.value}))}>{EMPLOYMENT.map(x=><option key={x}>{x}</option>)}</select></label><label>근무 상태<select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))}>{STATUS.map(x=><option key={x}>{x}</option>)}</select></label></div><div className="staff-form-pair"><label>근무 시작일<input type="date" value={draft.startDate} onChange={e=>setDraft(d=>({...d,startDate:e.target.value}))}/></label><label>종료일 (선택)<input type="date" value={draft.endDate} onChange={e=>setDraft(d=>({...d,endDate:e.target.value}))}/></label></div><button type="button" className="staff-save" onClick={save}><Plus size={16}/>{editing?'변경 내용 저장':'교원 등록'}</button><div className="staff-help"><Info size={16}/> 등록된 재직 교원은 시간표의 교사 목록으로 가져올 수 있습니다. 실제 학생·교원 개인정보는 현재 시범 환경에 등록하지 마세요.</div></div></div>
  </section>;
}
