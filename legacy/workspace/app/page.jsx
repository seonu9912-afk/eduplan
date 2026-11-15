'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {STORAGE_KEY,parseWorkspace,parseBackup,makeBackup} from '../lib/workspace';
import {EXAMPLE_SCHOOL_ID,EXAMPLE_SCHOOL,newExampleWorkspace,installExampleWorkspace} from '../lib/example-workspace';
import FormStudio from '../components/FormStudio';
import SchoolPlans from '../components/SchoolPlans';
import AcademicPlanner from '../components/AcademicPlanner';
import CurriculumPlanner from '../components/CurriculumPlanner';
import CalendarV12Port from '../components/CalendarV12Port';
import AcademicRebuild from '../components/AcademicRebuild';
import StaffRoster from '../components/StaffRoster';
import IntegratedAudit from '../components/IntegratedAudit';
import TeachingReviewStudio from '../components/TeachingReviewStudio';
import {schoolDay,dayRule} from '../lib/academic';
import {preferredDateForWorkspace} from '../lib/navigation-state';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, BookOpen, CalendarDays, CalendarPlus, Table2,
  Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, ClipboardList, Clock3, ExternalLink, FilePlus2, Files,
  FileText, FolderOpen, GraduationCap, House, Layers3, Link2, ListTodo,
  Menu, MessageSquareText, MoreHorizontal, Plus, Search, Settings2,
  ShieldCheck, Sparkles, Users, X, Trash2, PenLine, School, Bell,
  Building2, LayoutGrid, SlidersHorizontal, Archive, PanelLeftClose,
} from 'lucide-react';

const NAV = [
  { id: 'home', label: '홈', icon: House, group: 'main' },
  { id: 'curriculum', label: '교육과정 편성', icon: BookOpen, group: 'main' },
  { id: 'calendar', label: '학사일정', icon: CalendarDays, group: 'main' },
  { id: 'timetable', label: '시간표', icon: Table2, group: 'main' },
  { id: 'teaching', label: '교수학습·평가계획', icon: ClipboardList, group: 'main' },
  { id: 'plans', label: '월중·주간계획', icon: ClipboardList, group: 'main' },
  { id: 'audit', label: '통합 편성 점검', icon: ShieldCheck, group: 'main' },
  { id: 'forms', label: '서식 제작기', icon: FilePlus2, group: 'work' },
  { id: 'documents', label: '공동 문서', icon: Files, group: 'work' },
  { id: 'links', label: '업무 자료실', icon: FolderOpen, group: 'work' },
  { id: 'services', label: '학교 서비스', icon: LayoutGrid, group: 'work' },
  { id: 'admin', label: '관리자 설정', icon: Settings2, group: 'admin' },
];
const TEMPLATES = [
  { id:'meeting', label:'회의록', icon:MessageSquareText, helper:'협의 내용과 결정 사항을 정리합니다.', placeholder:'회의 안건\n\n1. 논의 내용\n\n2. 결정 사항\n\n3. 후속 업무' },
  { id:'dorm', label:'기숙사 운영일지', icon:BookOpen, helper:'날짜별 생활관 운영 내용을 기록합니다.', placeholder:'인원 현황\n\n점호 및 생활지도\n\n특이사항\n\n인수인계' },
  { id:'check', label:'시설 점검표', icon:ShieldCheck, helper:'점검 결과와 후속 조치를 관리합니다.', placeholder:'점검 장소\n\n점검 항목\n\n점검 결과\n\n조치 사항' },
  { id:'handover', label:'업무 인수인계서', icon:Archive, helper:'반복 업무의 노하우를 남깁니다.', placeholder:'담당 업무\n\n연간 일정\n\n주요 처리 절차\n\n관련 자료' },
];
const initialWorkspace = (schoolId) => ({
  events: schoolId === 'demo' ? [
    {id:'e1',date:'2026-11-13',name:'교직원 협의회',category:'회의',department:'교무부'},
    {id:'e2',date:'2026-11-17',name:'교육과정 운영 협의',category:'교육과정',department:'교육과정부'},
    {id:'e3',date:'2026-11-19',name:'진로 체험 프로그램',category:'행사',department:'진로부'},
    {id:'e4',date:'2026-11-25',name:'월말 업무 협의',category:'회의',department:'교무부'},
  ] : [
    {id:'e5',date:'2026-11-18',name:'학교 교육과정 협의',category:'회의',department:'교육과정부'},
  ],
  tasks: schoolId === 'demo' ? [
    {id:'t1',title:'12월 월중행사 취합',department:'교무부',due:'2026-11-16',status:'진행 중'},
    {id:'t2',title:'교육과정 협의 자료 준비',department:'교육과정부',due:'2026-11-17',status:'예정'},
    {id:'t3',title:'학교 운영위원회 자료 정리',department:'행정실',due:'2026-11-20',status:'예정'},
    {id:'t4',title:'11월 주간계획 취합',department:'교무부',due:'2026-11-11',status:'완료'},
  ] : [
    {id:'t5',title:'학교 평가 계획 취합',department:'연구부',due:'2026-11-20',status:'진행 중'},
  ],
  docs: schoolId === 'demo' ? [
    {id:'d1',title:'11월 교직원 협의록',template:'meeting',updated:'2026-11-12',body:'1. 12월 교육활동 준비\n\n2. 학사일정 공유\n\n3. 부서별 전달 사항'},
    {id:'d2',title:'업무 인수인계서 (예시)',template:'handover',updated:'2026-11-10',body:'담당 업무 및 연간 처리 절차를 작성해 보세요.'},
  ] : [],
  links: [
    {id:'l1',title:'나이스',url:'https://www.neis.go.kr/',category:'행정'},
    {id:'l2',title:'학교알리미',url:'https://www.schoolinfo.go.kr/',category:'정보'},
    {id:'l3',title:'에듀넷',url:'https://www.edunet.net/',category:'수업'},
  ],
  forms: [],
  formEntries: [],
  staffMembers: [],
  staffQuotas: {},
  menus: schoolId === 'demo' ? [
    {id:'m1',title:'기숙사 운영일지',type:'template',template:'dorm',url:''},
  ] : [],
  enabled: { calendar:true, curriculum:true, timetable:true, teaching:true, academic:true, plans:true, forms:true, documents:true, links:true, services:true },
});
const SEED = {
  schools: [EXAMPLE_SCHOOL,{id:'demo',name:'샘플중학교',type:'중학교'},{id:'sample-high',name:'미래고등학교',type:'고등학교'}],
  workspaces: {[EXAMPLE_SCHOOL_ID]:newExampleWorkspace(),demo:initialWorkspace('demo'),'sample-high':initialWorkspace('sample-high')},
  exampleWorkspaceVersion:4,
};
const newId = () => `id-${Math.random().toString(36).slice(2,10)}`;
const todayText = () => new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
const niceDate = d => d ? d.slice(5).replace('-','.') : '';
const shortDate = d => d ? d.replaceAll('-','.') : '';
const localYmd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const cleanUrl = value => { try { const u=new URL(value); return ['http:','https:'].includes(u.protocol) ? u.toString() : null; } catch { return null; } };
const pillClass = s => s==='완료'?'success':s==='진행 중'?'working':'pending';

export default function Page() {
  const [db,setDb] = useState(SEED);
  const [ready,setReady] = useState(false);
  const [storageWritable,setStorageWritable] = useState(true);
  const [storageIssue,setStorageIssue] = useState('');
  const [schoolId,setSchoolId] = useState(EXAMPLE_SCHOOL_ID);
  const [nav,setNav] = useState('home');
  const [mobileMenu,setMobileMenu] = useState(false);
  const [modal,setModal] = useState(null);
  const [search,setSearch] = useState('');
  const searchRef = useRef(null);
  const [calendarMonth,setCalendarMonth] = useState('2027-03');
  const [selectedDay,setSelectedDay] = useState('2027-03-08');
  const [calendarFocus,setCalendarFocus] = useState(null);
  const [plansDirty,setPlansDirty] = useState(false);
  const [timetableDirty,setTimetableDirty] = useState(false);
  const [lastSavedAt,setLastSavedAt] = useState(null);
  const [docDirty,setDocDirty] = useState(false);
  const [taskFilter,setTaskFilter] = useState('전체');
  const [planMode,setPlanMode] = useState('week');
  const [formRoute,setFormRoute] = useState(null);
  const [editingDoc,setEditingDoc] = useState(null);
  const [toast,setToast] = useState('');

  useEffect(()=>{
    try{
      const stored=window.localStorage.getItem(STORAGE_KEY);
      if(stored){const restored=parseWorkspace(stored,initialWorkspace('other'));setDb(installExampleWorkspace(restored));}
    }catch(e){setStorageIssue(e.message||'저장 데이터를 읽을 수 없습니다.');setStorageWritable(false);}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!ready||!storageWritable)return;
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(db));setLastSavedAt(new Date().toISOString());}
    catch(e){setStorageIssue('브라우저 저장 공간이 부족하거나 접근이 차단되었습니다. 저장이 중지되었습니다. 데이터를 백업한 뒤 저장 공간을 확인하세요.');setStorageWritable(false);}
  },[db,ready,storageWritable]);
  useEffect(()=>{
    const onStorage=e=>{
      if(e.key===STORAGE_KEY&&e.newValue!==e.oldValue){
        setStorageIssue('다른 탭에서 이 작업공간이 변경되었습니다. 현재 탭의 자동 저장을 중지했습니다. 필요한 자료를 백업한 뒤 새로고침하세요.');
        setStorageWritable(false);
      }
    };
    window.addEventListener('storage',onStorage);return()=>window.removeEventListener('storage',onStorage);
  },[]);
  useEffect(()=>{const handler=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();}if(e.key==='Escape'&&document.activeElement===searchRef.current)setSearch('');};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t); },[toast]);
  useEffect(()=>{if(!(timetableDirty||plansDirty||docDirty))return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[timetableDirty,plansDirty,docDirty]);

  const school = db.schools.find(s=>s.id===schoolId) || db.schools[0];
  const space = db.workspaces[school?.id] || initialWorkspace('other');
  const updateSpace = updater => setDb(old=>{
    const current=old.workspaces[schoolId]||initialWorkspace('other');
    const next=typeof updater==='function'?updater(current):updater;
    return {...old,workspaces:{...old.workspaces,[schoolId]:next}};
  });
  const announce = text => setToast(text);
  const go = id => {if(nav==='timetable'&&id!=='timetable'&&timetableDirty&&!window.confirm('수업 배정표에 적용하지 않은 붙여넣기 내용이 있습니다. 이동하면 사라집니다. 계속할까요?'))return false;if(nav==='plans'&&id!=='plans'&&plansDirty&&!window.confirm('월중·주간계획에 저장하지 않은 입력이 있습니다. 이동하면 사라질 수 있습니다. 계속할까요?'))return false;if(nav==='documents'&&editingDoc&&docDirty&&!window.confirm('문서에 저장하지 않은 변경이 있습니다. 이동할까요?'))return false;setDocDirty(false);setPlansDirty(false);setTimetableDirty(false);setNav(id);setMobileMenu(false);setSearch('');setEditingDoc(null);setFormRoute(null);return true;};
  const switchSchool = id => {if(nav==='timetable'&&timetableDirty&&!window.confirm('수업 배정표 붙여넣기 내용이 아직 적용되지 않았습니다. 작업공간을 변경할까요?'))return;if(nav==='plans'&&plansDirty&&!window.confirm('작성 중인 계획이 있습니다. 저장하지 않고 작업공간을 바꿀까요?'))return;if(nav==='documents'&&editingDoc&&docDirty&&!window.confirm('문서에 저장하지 않은 변경이 있습니다. 작업공간을 바꿀까요?'))return;setDocDirty(false);setPlansDirty(false);setTimetableDirty(false);setSchoolId(id);setNav('home');setMobileMenu(false);setSearch('');setEditingDoc(null);setFormRoute(null);setPlanMode('week');const target=preferredDateForWorkspace(id,EXAMPLE_SCHOOL_ID,localYmd(new Date()));setCalendarMonth(target.slice(0,7));setSelectedDay(target);setCalendarFocus(null);announce('작업공간을 전환했습니다.');};
  const resetExample = () => {
    if(!window.confirm('2027년 일반중학교 검증용 예시를 원본 상태로 다시 불러올까요? 이 예시 작업공간에서 수정한 내용은 사라지지만 다른 학교 자료는 유지됩니다.'))return;
    setDb(current=>({...current,workspaces:{...current.workspaces,[EXAMPLE_SCHOOL_ID]:newExampleWorkspace()}}));
    announce('예시 학사일정·교육과정을 원본 상태로 복원했습니다.');
  };
  const addRecord = (key,item) => updateSpace(s=>({...s,[key]:[item,...s[key]]}));
  const deleteRecord = (key,id) => updateSpace(s=>({...s,[key]:s[key].filter(x=>x.id!==id)}));
  const confirmRemove = (key,id,label) => {if(window.confirm(`${label} 항목을 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`))deleteRecord(key,id);};
  const openTemplate = template => {const t=TEMPLATES.find(t=>t.id===template)||TEMPLATES[0];const doc={id:newId(),title:`새 ${t.label}`,template:t.id,updated:new Date().toISOString().slice(0,10),body:t.placeholder};addRecord('docs',doc);setEditingDoc(doc.id);go('documents');setEditingDoc(doc.id);announce('새 문서 초안을 만들었습니다.');};
  const navigateMenu = menu => {if(menu.type==='link'){const url=cleanUrl(menu.url); if(url) window.open(url,'_blank','noopener,noreferrer');else announce('유효한 웹 주소가 아닙니다.');} else if(menu.type==='form'){go('forms');setFormRoute({formId:menu.formId,nonce:newId()});} else {go('documents');setEditingDoc(null);setModal({type:'templateGo',template:menu.template});}};
  const activeNav = NAV.find(x=>x.id===nav)||NAV[0];
  const stats = [
    {label:'등록된 학사행사',value:space.events.length,unit:'건',icon:CalendarDays,tone:'blue',sub:'학교 일정'},
    {label:'진행 중인 업무',value:space.tasks.filter(x=>x.status!=='완료').length,unit:'건',icon:ListTodo,tone:'purple',sub:'전체 부서'},
    {label:'공유 문서',value:space.docs.length,unit:'개',icon:Files,tone:'green',sub:'문서 초안'},
    {label:'업무 바로가기',value:space.links.length+space.menus.filter(x=>x.type==='link').length,unit:'개',icon:Link2,tone:'orange',sub:'등록된 링크'},
  ];
  const searchItems = useMemo(()=>{
    const q=search.trim().toLowerCase();if(!q)return[];
    return [
      ...space.events.map(x=>({kind:'일정',title:x.name,sub:shortDate(x.date),page:'calendar',date:x.date})),
      ...space.tasks.map(x=>({kind:'업무',title:x.title,sub:x.department,page:'plans'})),
      ...space.docs.map(x=>({kind:'문서',title:x.title,sub:'공동 문서',page:'documents',id:x.id})),
      ...space.links.map(x=>({kind:'링크',title:x.title,sub:x.category,page:'links'})),
      ...(space.forms||[]).map(x=>({kind:'서식',title:x.name,sub:x.description||'서식 제작기',page:'forms',formId:x.id})),
      ...(space.formEntries||[]).map(x=>({kind:'작성 기록',title:x.formTitle,sub:x.created,page:'forms',formId:x.formId})),
      ...space.menus.map(x=>({kind:'학교 메뉴',title:x.title,sub:'학교 맞춤',page:'services'})),
    ].filter(x=>`${x.title} ${x.sub}`.toLowerCase().includes(q)).slice(0,8);
  },[space,search]);
  const openAcademicDate = item => {if(go('calendar')===false)return;if(item?.date)setCalendarFocus({date:item.date,nonce:newId()});};
  const changeMonth = diff => {const [y,m]=calendarMonth.split('-').map(Number);const d=new Date(y,m-1+diff,1);setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);};
  const monthCells = useMemo(()=>{
    const [y,m]=calendarMonth.split('-').map(Number);const first=new Date(y,m-1,1).getDay();const len=new Date(y,m,0).getDate();
    const previous=new Date(y,m-1,0).getDate();return Array.from({length:42},(_,i)=>{
      const day=i-first+1;let date;
      if(day<1){const d=new Date(y,m-2,previous+day);date=localYmd(d);}
      else if(day>len){const d=new Date(y,m-1,day);date=localYmd(d);}
      else date=`${calendarMonth}-${String(day).padStart(2,'0')}`;
      const academicYear=Number(date.slice(0,4))-(Number(date.slice(5,7))<3?1:0);
      const academicPlan=space.academics?.[String(academicYear)];
      const academicRule=academicPlan?.status==='confirmed' ? dayRule(date,academicPlan.dayRules) : null;
      return {date,day:Number(date.slice(8)),current:date.startsWith(calendarMonth),events:space.events.filter(e=>e.date<=date&&date<=(e.endDate||e.date)),academicRule};
    });
  },[calendarMonth,space.events,space.academics]);

  const backupWorkspace = () => {
    const contents=makeBackup(db);
    const blob=new Blob([contents],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`eduplan-workspace-backup-${localYmd(new Date())}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('이 브라우저의 작업공간을 백업했습니다.');
  };
  const restoreWorkspace = async file => {
    if(!file)return;
    try{
      if(file.size>10*1024*1024)throw Error('10MB 이하 백업 파일만 가져올 수 있습니다.');
      const next=parseBackup(await file.text(),initialWorkspace('other'));
      if(!window.confirm('현재 브라우저의 모든 학교 작업공간 데이터를 백업 내용으로 덮어쓸까요? 먼저 기존 내용을 백업해 두는 것이 안전합니다.'))return;
      // Fail closed if storage cannot accept the new payload; do not replace the in-memory DB.
      window.localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      setDb(next);setStorageWritable(true);setStorageIssue('');setSchoolId(next.schools[0].id);go('home');announce('백업 데이터를 복원했습니다.');
    }catch(e){announce(e.message||'백업을 불러오지 못했습니다.');}
  };

  return <div className="app-shell">
    {storageIssue&&<div className="workspace-storage-warning" role="alert"><strong><AlertTriangle size={17}/> 자동 저장 주의</strong><span>{storageIssue}</span><button type="button" onClick={backupWorkspace}>현재 자료 백업</button><button type="button" onClick={()=>window.location.reload()}>새로고침</button></div>}
    {mobileMenu && <button className="mobile-overlay" aria-label="메뉴 닫기" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`sidebar ${mobileMenu?'show':''}`}>
      <div className="brand"><div className="brand-icon"><Layers3 size={22} strokeWidth={2.4}/></div><div><strong>EduPlan<span className="brand-dot">.</span></strong><small>WORKSPACE</small></div><span className="brand-beta">BETA</span></div>
      <div className="school-picker"><span className="school-avatar"><School size={18}/></span><div className="school-pick-main"><small>현재 작업공간</small><select aria-label="학교 선택" value={schoolId} onChange={e=>switchSchool(e.target.value)}>{db.schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><ChevronDown size={15} className="chevron-decor"/></div>
      <nav className="sidebar-nav" aria-label="메인 메뉴">
        <div className="nav-group-label">WORKSPACE</div>
        {NAV.filter(x=>x.group==='main' && (x.id==='home'||x.id==='audit'||space.enabled[x.id]!==false)).map(item=><SideLink key={item.id} item={item} active={nav===item.id} onClick={()=>go(item.id)}/>)}
        <div className="nav-group-label with-margin">COLLABORATION</div>
        {NAV.filter(x=>x.group==='work'&&space.enabled[x.id]!==false).map(item=><SideLink key={item.id} item={item} active={nav===item.id} onClick={()=>go(item.id)}/>)}
        {space.menus.length>0 && <><div className="nav-group-label with-margin">학교 맞춤 메뉴</div>{space.menus.map(item=><button key={item.id} className="nav-link custom-nav" onClick={()=>navigateMenu(item)}><span className="custom-nav-icon">{item.type==='link'?<ExternalLink size={16}/>:<FileText size={16}/>}</span><span>{item.title}</span></button>)}</>}
      </nav>
      <div className="sidebar-bottom"><SideLink item={NAV.find(x=>x.id==='admin')} active={nav==='admin'} onClick={()=>go('admin')}/><div className="sidebar-help"><div className="help-icon"><Sparkles size={17}/></div><div><strong>나만의 교무실 만들기</strong><p>학교에 맞게 메뉴를 구성해 보세요.</p></div><button aria-label="학교 설정으로 이동" onClick={()=>go('admin')}><ArrowRight size={16}/></button></div><div className="sidebar-user"><span className="user-avatar">D</span><div><strong>데모 사용자</strong><small>관리자 체험 모드</small></div><span className="online-indicator"/></div></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-toggle" onClick={()=>setMobileMenu(true)} aria-label="메뉴 열기"><Menu size={20}/></button><span className="breadcrumb-root">워크스페이스</span><ChevronRight size={15} className="breadcrumb-arrow"/><span className="breadcrumb-current">{activeNav.label}</span></div><div className="topbar-actions"><div className="search-wrap"><Search size={17}/><input aria-label="업무 통합 검색" placeholder="업무, 문서, 일정 검색..." ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)}/><span className="search-shortcut">⌘ K</span>{search && <div className="search-popover">{searchItems.length===0?<div className="search-empty">검색 결과가 없어요.</div>:searchItems.map((x,i)=><button key={i} onClick={()=>{if(go(x.page)===false)return;if(x.date)setCalendarFocus({date:x.date,nonce:newId()});if(x.id)setEditingDoc(x.id);if(x.formId)setFormRoute({formId:x.formId,nonce:newId()});}}><span className="search-kind">{x.kind}</span><span>{x.title}</span><small>{x.sub}</small></button>)}</div>}</div><div className="topbar-divider"/><span className={`edu-save-chip ${storageWritable?"":"error"}`} title={lastSavedAt?`최근 저장 ${new Date(lastSavedAt).toLocaleTimeString("ko-KR")}`:"저장 상태 확인 중"}><CheckCircle2 size={14}/>{storageWritable?(lastSavedAt?"이 브라우저에 저장됨":"저장 확인 중"):"자동 저장 중지"}</span><span className="demo-chip"><span/> 데모 모드</span><button className="icon-button bell-button" onClick={()=>setModal({type:'alerts'})} aria-label="알림"><Bell size={20}/></button><span className="top-avatar">D</span></div></header>
      <main className="content-area">
        {nav!=='calendar'&&schoolId===EXAMPLE_SCHOOL_ID&&space.exampleMeta?.dataIsSample&&<section className="example-workspace-notice" aria-label="2027학년도 일반중학교 검증 예시 안내">
          <div className="example-note-content"><strong>일반중학교 · 2027학년도 검증 자료</strong><span>19학급 · 교원 정원 34명 · 가상 편성안 · 19학급 자동시간표 검증 완료</span></div>
          <div className="example-notice-actions"><button type="button" onClick={()=>go('calendar')}>학사일정</button><button type="button" onClick={()=>go('curriculum')}>교육과정</button><button type="button" onClick={resetExample}>예시 복원</button></div>
        </section>}

        {nav==='home' && <><div className="heading-row"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>좋은 하루예요, 선생님 <span className="wave">✳</span></h1><p className="heading-desc">{todayText()} · 오늘의 학교 업무를 한눈에 확인하세요.</p></div><button className="btn primary desktop-action" onClick={()=>setModal({type:'quick'})}><Plus size={17}/> 새로 만들기</button></div><div className="welcome-banner"><div className="welcome-copy"><span className="banner-kicker"><Sparkles size={14}/> SMART SCHOOL WORKSPACE</span><h2>학교의 모든 업무가<br/>하나의 공간에서 연결됩니다.</h2><p>흩어진 일정과 문서, 업무를 한곳에서 관리하세요.<br/>필요한 기능을 학교에 맞게 자유롭게 구성할 수 있습니다.</p><button className="banner-cta" onClick={()=>go('admin')}>작업공간 설정하기 <ArrowRight size={16}/></button></div><div className="banner-art" aria-hidden="true"><div className="art-back"/><div className="art-calendar"><div><CalendarDays size={18}/> Calendar</div><span>11</span><i/><i/></div><div className="art-task"><CheckCircle2 size={20}/><span>업무가 연결됐어요!</span></div><div className="art-dot one"/><div className="art-dot two"/></div></div><div className="stat-grid">{stats.map(s=><div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><span className={`stat-icon ${s.tone}`}><s.icon size={19}/></span></div><div className="stat-bottom"><strong>{s.value}<small>{s.unit}</small></strong><span>{s.sub}</span></div></div>)}</div><div className="dashboard-grid"><section className="panel upcoming-panel"><div className="panel-head"><div><h3>다가오는 학사일정</h3><p>학교의 주요 일정을 확인하세요.</p></div><button className="subtle-link" onClick={()=>go('calendar')}>전체 보기 <ArrowRight size={15}/></button></div><div className="upcoming-list">{space.events.filter(e=>e.date>=localYmd(new Date())).slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4).map(e=><div className="upcoming-item" key={e.id}><div className="date-square"><strong>{e.date.slice(8)}</strong><small>{Number(e.date.slice(5,7))}월</small></div><div><strong>{e.name}</strong><small>{e.department} · {e.category}</small></div><span className="event-dot"/></div>)}{space.events.length===0&&<Empty text="등록된 학사일정이 없습니다."/>}</div></section><section className="panel work-panel"><div className="panel-head"><div><h3>업무 진행 현황</h3><p>놓치지 말아야 할 업무를 모았어요.</p></div><button className="subtle-link" onClick={()=>go('plans')}>전체 보기 <ArrowRight size={15}/></button></div><div className="dashboard-task-list">{space.tasks.slice(0,4).map(t=><div className="dashboard-task" key={t.id}><button className={`task-check ${t.status==='완료'?'done':''}`} onClick={()=>updateSpace(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,status:x.status==='완료'?'예정':'완료'}:x)}))} aria-label={`${t.title} 완료 변경`}>{t.status==='완료'&&<Check size={14}/>}</button><div><strong className={t.status==='완료'?'completed':''}>{t.title}</strong><small>{t.department} · {niceDate(t.due)}까지</small></div><span className={`status-pill ${pillClass(t.status)}`}>{t.status}</span></div>)}{space.tasks.length===0&&<Empty text="등록된 업무가 없습니다."/>}</div></section></div><div className="dashboard-footer-grid"><section className="panel quick-panel"><div className="panel-head"><div><h3>빠른 실행</h3><p>자주 사용하는 업무를 바로 시작하세요.</p></div></div><div className="quick-list"><button onClick={()=>setModal({type:'event'})}><span className="quick-icon blue"><CalendarPlus size={20}/></span><span>학사일정 등록</span><ArrowRight size={15}/></button><button onClick={()=>go('timetable')}><span className="quick-icon purple"><Table2 size={20}/></span><span>시간표 편성</span><ArrowRight size={15}/></button><button onClick={()=>setModal({type:'task'})}><span className="quick-icon purple"><ListTodo size={20}/></span><span>업무계획 작성</span><ArrowRight size={15}/></button><button onClick={()=>setModal({type:'document'})}><span className="quick-icon green"><FilePlus2 size={20}/></span><span>공동 문서 만들기</span><ArrowRight size={15}/></button></div></section><section className="panel links-panel"><div className="panel-head"><div><h3>업무 바로가기</h3><p>우리 학교에서 자주 쓰는 링크</p></div><button className="subtle-link" onClick={()=>go('links')}>관리하기 <ArrowRight size={15}/></button></div><div className="mini-links">{space.links.slice(0,4).map(l=><a key={l.id} href={cleanUrl(l.url)||'#'} target="_blank" rel="noopener noreferrer"><span><ExternalLink size={15}/></span>{l.title}<ArrowDownRight size={15}/></a>)}</div></section></div></>}
        {nav==='calendar' && <AcademicRebuild space={space} workspaceId={schoolId} focusDate={calendarFocus}>{nav==='calendar' && <CalendarV12Port key={schoolId} focusDate={calendarFocus} schoolName={school.name} space={space} updateSpace={updateSpace} notify={announce}/>}</AcademicRebuild>}
        {nav==='curriculum' && <CurriculumPlanner key={`${schoolId}-curriculum`} space={space} updateSpace={updateSpace} notify={announce} onOpenTimetable={()=>go('timetable')} onOpenStaff={()=>go('admin')}/>}
        {nav==='timetable' && <AcademicPlanner key={`${schoolId}-timetable`} mode="timetable" schoolName={school.name} space={space} updateSpace={updateSpace} notify={announce} onOpenCalendar={()=>go('calendar')} onOpenCurriculum={()=>go('curriculum')} onDirtyChange={setTimetableDirty}/>}
        {nav==='teaching' && <TeachingReviewStudio key={schoolId} space={space} updateSpace={updateSpace} schoolName={school.name} schoolType={school.type} notify={announce}/>}
        {nav==='audit' && <IntegratedAudit space={space} onNavigate={go} onCalendarDate={date=>openAcademicDate({date})} notify={announce}/>}
        {nav==='plans' && <><SchoolPlans key={schoolId} space={space} updateSpace={updateSpace} schoolName={school.name} mode={planMode} setMode={setPlanMode} notify={announce} onAcademic={openAcademicDate} onDirtyChange={setPlansDirty} onTask={t=>setModal({type:'taskEdit',taskId:t.id})}/>
          {planMode==='list'&&<section className="panel spacious"><div className="list-toolbar"><div className="tabs">{['전체','예정','진행 중','완료'].map(f=><button key={f} className={taskFilter===f?'active':''} onClick={()=>setTaskFilter(f)}>{f}</button>)}</div><span className="toolbar-meta">총 {space.tasks.filter(x=>taskFilter==='전체'||x.status===taskFilter).length}건</span></div><div className="responsive-table"><table className="data-table"><thead><tr><th>업무명</th><th>담당 부서</th><th>마감일</th><th>연결된 행사</th><th>진행 상태</th><th>관리</th></tr></thead><tbody>{space.tasks.filter(x=>taskFilter==='전체'||x.status===taskFilter).slice().sort((a,b)=>a.due.localeCompare(b.due)).map(t=><tr key={t.id}><td><strong>{t.title}</strong></td><td>{t.department}</td><td>{shortDate(t.due)}</td><td><span className="task-linked-event">{space.events.find(e=>e.id===t.eventId)?.name||'—'}</span></td><td><select aria-label={`${t.title} 진행 상태`} className={`select-status ${pillClass(t.status)}`} value={t.status} onChange={e=>updateSpace(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,status:e.target.value}:x)}))}>{['예정','진행 중','완료'].map(x=><option key={x}>{x}</option>)}</select></td><td><div className="task-row-actions"><button className="btn-tiny" onClick={()=>setModal({type:'taskEdit',taskId:t.id})}>수정</button><button className="trash-btn" aria-label="업무 삭제" onClick={()=>{if(window.confirm('이 업무를 삭제할까요?'))deleteRecord('tasks',t.id);}}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{space.tasks.filter(x=>taskFilter==='전체'||x.status===taskFilter).length===0&&<Empty text="해당 상태의 업무가 없습니다."/>}</div></section>}
          {planMode==='list'&&<div className="context-tip"><Sparkles size={19}/><span>이 업무 목록은 계획표와 구분하여 저장됩니다. 설정에서 ‘업무 마감일 표시’를 켜면 월중·주간계획에서도 함께 볼 수 있습니다.</span></div>}
        </>}
        {nav==='forms' && <FormStudio key={schoolId} space={space} updateSpace={updateSpace} notify={announce} route={formRoute}/>}
        {nav==='documents' && <><SectionHeading eyebrow="COLLABORATION" title="공동 문서" desc="학교에서 반복 사용하는 서식과 문서 초안을 관리합니다." onClick={()=>setModal({type:'document'})} action="새 문서"/>{editingDoc && space.docs.some(d=>d.id===editingDoc)?<DocEditor key={editingDoc} doc={space.docs.find(d=>d.id===editingDoc)} onDirtyChange={setDocDirty} onBack={()=>{setEditingDoc(null);setDocDirty(false);}} onSave={(values)=>{setDocDirty(false);updateSpace(s=>({...s,docs:s.docs.map(d=>d.id===editingDoc?{...d,...values,updated:new Date().toISOString().slice(0,10)}:d)}));announce('브라우저에 문서를 저장했습니다.');}}/>:<><div className="section-subheading"><h3>서식 라이브러리</h3><span>서식을 선택해 문서를 빠르게 시작하세요.</span></div><div className="template-grid">{TEMPLATES.map(t=><button className="template-card" key={t.id} onClick={()=>openTemplate(t.id)}><span className="template-icon"><t.icon size={22}/></span><strong>{t.label}</strong><small>{t.helper}</small><span className="template-plus"><Plus size={17}/></span></button>)}</div><div className="section-subheading document-section"><h3>최근 문서</h3><span>작성한 문서가 이곳에 모입니다.</span></div><section className="panel doc-list">{space.docs.length===0?<Empty text="아직 작성된 문서가 없어요. 서식을 선택해 시작해 보세요."/>:space.docs.map(d=><div className="doc-row" key={d.id}><span className="doc-file-icon"><FileText size={20}/></span><button className="doc-main" onClick={()=>setEditingDoc(d.id)}><strong>{d.title}</strong><small>{TEMPLATES.find(t=>t.id===d.template)?.label||'일반 문서'} · {shortDate(d.updated)} 수정</small></button><span className="doc-preview-tag">초안</span><button className="trash-btn" aria-label="문서 삭제" onClick={()=>confirmRemove('docs',d.id,'문서')}><Trash2 size={16}/></button></div>)}</section></>}</>}
        {nav==='links' && <><SectionHeading eyebrow="KNOWLEDGE HUB" title="업무 자료실" desc="자주 찾는 사이트와 업무 자료 링크를 한눈에 관리합니다." onClick={()=>setModal({type:'link'})} action="링크 추가"/><div className="link-card-grid">{space.links.map(l=><div className="link-card" key={l.id}><div className="link-card-top"><span className="link-big-icon"><ExternalLink size={19}/></span><span className="link-category">{l.category}</span></div><strong>{l.title}</strong><small>{l.url}</small><div className="link-card-footer"><a href={cleanUrl(l.url)||'#'} target="_blank" rel="noopener noreferrer">사이트 열기 <ArrowRight size={15}/></a><button aria-label="링크 삭제" onClick={()=>confirmRemove('links',l.id,'업무 링크')}><Trash2 size={15}/></button></div></div>)}<button className="link-create-card" onClick={()=>setModal({type:'link'})}><Plus size={25}/><strong>새 링크 추가</strong><span>교직원용 바로가기를 등록하세요.</span></button></div></>}
        {nav==='services' && <><SectionHeading eyebrow="SCHOOL SERVICES" title="학교 서비스" desc="우리 학교에 필요한 전용 기능과 문서 서식을 모았습니다." onClick={()=>setModal({type:'menu'})} action="메뉴 추가"/><div className="service-grid"><div className="service-feature"><span className="service-badge">학교 맞춤 기능</span><span className="service-illustration"><BookOpen size={34}/></span><h3>학교 운영 서식</h3><p>학교 운영에 필요한 서식을 직접 만들고 메뉴에 등록할 수 있습니다.</p><button onClick={()=>go('forms')}>반복 서식 만들기 <ArrowRight size={16}/></button></div><div className="service-card"><div className="service-card-icon"><FilePlus2 size={25}/></div><h3>서식 기반 서비스</h3><p>회의록, 점검표, 운영일지처럼 반복 작성하는 서식을 관리합니다.</p><button onClick={()=>go('forms')}>서식 제작기 열기 <ArrowRight size={15}/></button></div><div className="service-card"><div className="service-card-icon"><Settings2 size={25}/></div><h3>학교별 메뉴 설정</h3><p>외부 웹앱을 연결하거나 원하는 서식을 학교 메뉴에 등록할 수 있습니다.</p><button onClick={()=>go('admin')}>메뉴 설정하기 <ArrowRight size={15}/></button></div></div>{space.menus.length>0&&<section className="panel spacious service-list"><div className="panel-head"><div><h3>등록된 학교 메뉴</h3><p>우리 학교 작업공간에 표시되는 맞춤 메뉴입니다.</p></div></div>{space.menus.map(m=><div className="doc-row" key={m.id}><span className="doc-file-icon">{m.type==='link'?<ExternalLink size={20}/>:<FileText size={20}/>}</span><button className="doc-main" onClick={()=>navigateMenu(m)}><strong>{m.title}</strong><small>{m.type==='link'?'외부 링크':m.type==='form'?'반복 입력 서식':'문서 서식'}</small></button><button className="trash-btn" onClick={()=>confirmRemove('menus',m.id,'학교 메뉴')} aria-label="메뉴 삭제"><Trash2 size={16}/></button></div>)}</section>}</>}
        {nav==='admin' && <><SectionHeading eyebrow="WORKSPACE SETTINGS" title="관리자 설정" desc="학교별 작업공간과 메뉴 구성을 관리합니다." onClick={()=>setModal({type:'school'})} action="학교 추가"/><div className="admin-grid"><section className="panel spacious"><div className="panel-head"><div><h3>작업공간 정보</h3><p>현재 선택한 학교의 기본 정보입니다.</p></div><span className="admin-icon"><Building2 size={21}/></span></div><div className="settings-row"><span>학교명</span><strong>{school.name}</strong></div><div className="settings-row"><span>학교 유형</span><strong>{school.type}</strong></div><div className="settings-row"><span>공간 구분</span><strong>독립 작업공간 (시연)</strong></div><div className="settings-row"><span>데이터 저장</span><strong>현재 브라우저</strong></div><div className="info-note admin-note"><ShieldCheck size={17}/><span>실제 교직원 인증 및 학교별 데이터 접근 제어는 아직 연결되지 않았습니다.</span></div></section><section className="panel spacious"><div className="panel-head"><div><h3>기본 메뉴 표시</h3><p>학교에서 사용할 메뉴를 선택하세요.</p></div><span className="admin-icon"><SlidersHorizontal size={21}/></span></div>{NAV.filter(x=>['calendar','curriculum','timetable','plans','forms','documents','links','services'].includes(x.id)).map(m=><div className="toggle-row" key={m.id}><span><m.icon size={18}/>{m.label}</span><button type="button" role="switch" aria-checked={space.enabled[m.id]!==false} className={`switch ${space.enabled[m.id]!==false?'on':''}`} aria-label={`${m.label} 메뉴 표시 전환`} onClick={()=>{updateSpace(s=>({...s,enabled:{...s.enabled,[m.id]:s.enabled[m.id]===false}}));if(nav===m.id)go('home');}}><i/></button></div>)}</section></div><StaffRoster space={space} updateSpace={updateSpace} notify={announce}/><section className="panel spacious admin-bottom"><div className="panel-head"><div><h3>학교 맞춤 메뉴</h3><p>외부 링크 또는 문서 서식을 학교의 독립된 메뉴로 추가합니다.</p></div><button className="btn outline" onClick={()=>setModal({type:'menu'})}><Plus size={16}/> 메뉴 만들기</button></div>{space.menus.map(m=><div className="settings-row" key={m.id}><span>{m.title} <small>· {m.type==='link'?'외부 링크':m.type==='form'?'반복 입력 서식':'문서 서식'}</small></span><button className="trash-btn" onClick={()=>confirmRemove('menus',m.id,'학교 메뉴')} aria-label="맞춤 메뉴 삭제"><Trash2 size={16}/></button></div>)}{space.menus.length===0&&<Empty text="추가된 학교 맞춤 메뉴가 없습니다."/>}</section><section className="panel spacious admin-backup"><div className="panel-head"><div><h3>브라우저 데이터 백업</h3><p>학교 작업공간 전체를 JSON으로 보관하거나 이 브라우저에 복원합니다.</p></div><span className="admin-icon"><Archive size={21}/></span></div><div className="backup-actions"><button className="btn outline" onClick={backupWorkspace}><Archive size={16}/> 전체 백업 내려받기</button><label className="btn outline backup-import">백업 불러오기<input type="file" accept=".json,application/json" onChange={e=>{restoreWorkspace(e.target.files?.[0]);e.target.value='';}}/></label></div><p className="backup-warning">현재 데이터는 이 브라우저에만 저장되며, 다른 교사에게 자동 공유되지 않습니다. 실제 학생 개인정보를 입력하지 마세요.</p></section><div className="context-tip"><CircleHelp size={18}/><span>데모 입력값을 초기화하려면 브라우저 사이트 데이터에서 localStorage를 삭제하세요. 학생 개인정보를 입력하지 마세요.</span></div></>}
        <footer className="content-footer"><span>© 2026 EduPlan Workspace · v1.6.3 안정화 미리보기</span><span>이 화면은 기능 확인용 데모입니다. 실제 공동작업 기능은 제공되지 않습니다.</span></footer>
      </main>
    </div>
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button aria-label="알림 닫기" onClick={()=>setToast('')}><X size={15}/></button></div>}
    {modal && <Modal title={{quick:'새로 만들기',event:'학사일정 추가',task:'업무계획 추가',taskEdit:'업무 수정',document:'새 문서 만들기',link:'업무 링크 추가',menu:'학교 메뉴 추가',school:'학교 작업공간 추가',templateGo:'서식 시작하기',alerts:'업무 알림'}[modal.type]} onClose={()=>setModal(null)}>
      {modal.type==='alerts'&&<div className="workspace-alerts"><p className="workspace-alert-caption">마감일이 지났거나 앞으로 7일 안에 마감되는 미완료 업무를 표시합니다.</p>{space.tasks.filter(t=>t.status!=='완료'&&t.due<=localYmd(new Date(Date.now()+7*86400000))).sort((a,b)=>a.due.localeCompare(b.due)).map(t=><button key={t.id} onClick={()=>{setModal({type:'taskEdit',taskId:t.id});}} className="workspace-alert-item"><span className={t.due<localYmd(new Date())?'overdue':''}>{t.due<localYmd(new Date())?'기한 경과':t.due===localYmd(new Date())?'오늘 마감':'마감 예정'}</span><strong>{t.title}</strong><small>{shortDate(t.due)} · {t.department}</small></button>)}{!space.tasks.some(t=>t.status!=='완료'&&t.due<=localYmd(new Date(Date.now()+7*86400000)))&&<div className="workspace-alert-empty">현재 확인할 업무 알림이 없습니다.</div>}</div>}
      {modal.type==='quick'&&<div className="modal-choices">{[{id:'event',label:'학사일정 등록',icon:CalendarPlus},{id:'task',label:'업무계획 작성',icon:ListTodo},{id:'document',label:'공동 문서 만들기',icon:FilePlus2},{id:'link',label:'업무 링크 추가',icon:Link2}].map(x=><button key={x.id} onClick={()=>setModal({type:x.id})}><x.icon size={20}/><span>{x.label}</span><ArrowRight size={16}/></button>)}</div>}
      {modal.type==='event'&&<FormShell onSubmit={data=>{
        const event={id:newId(),name:String(data.get('title')||'').trim(),date:String(data.get('date')),category:String(data.get('category')),department:String(data.get('department')||'').trim()||'공통'};
        if(!event.name){announce('행사명을 입력해 주세요.');return;}
        updateSpace(s=>({...s,events:[event,...s.events],tasks:data.get('addTask')?[{id:newId(),title:`${event.name} 준비`,department:event.department,due:event.date,status:'예정',eventId:event.id},...s.tasks]:s.tasks}));
        setCalendarMonth(event.date.slice(0,7));setSelectedDay(event.date);setModal(null);announce(data.get('addTask')?'학사일정과 연결 업무를 등록했습니다.':'학사일정을 등록했습니다.');
      }}><FormField label="행사명" name="title" placeholder="예: 교육과정 설명회" required/><FormField label="날짜" name="date" type="date" defaultValue={modal.date||localYmd(new Date())} required/><div className="form-two"><FormField label="구분" name="category" as="select" options={['행사','회의','교육과정','기타']}/><FormField label="담당 부서" name="department" placeholder="예: 교무부"/></div><label className="modal-checkline"><input type="checkbox" name="addTask" value="yes"/> 이 행사의 준비 업무도 함께 만들기</label><button className="btn primary full" type="submit">일정 등록하기</button></FormShell>}
      {(modal.type==='task'||modal.type==='taskEdit')&&<FormShell onSubmit={data=>{
        const task={title:String(data.get('title')||'').trim(),department:String(data.get('department')||'').trim()||'공통',due:String(data.get('due')),status:String(data.get('status')),eventId:String(data.get('eventId')||'')};
        if(!task.title){announce('업무명을 입력해 주세요.');return;}
        if(modal.type==='taskEdit'){updateSpace(s=>({...s,tasks:s.tasks.map(t=>t.id===modal.taskId?{...t,...task}:t)}));announce('업무를 수정했습니다.');}
        else{addRecord('tasks',{id:newId(),...task});announce('업무를 등록했습니다.');}
        setModal(null);
      }}>
        <FormField label="업무명" name="title" placeholder="예: 다음 주 교육활동 자료 취합" defaultValue={modal.type==='taskEdit'?space.tasks.find(t=>t.id===modal.taskId)?.title:''} required/>
        <div className="form-two"><FormField label="담당 부서" name="department" placeholder="교무부" defaultValue={modal.type==='taskEdit'?space.tasks.find(t=>t.id===modal.taskId)?.department:''}/><FormField label="마감일" name="due" type="date" defaultValue={modal.type==='taskEdit'?space.tasks.find(t=>t.id===modal.taskId)?.due:modal.date||localYmd(new Date())} required/></div>
        <label className="form-field"><span>연결할 학사행사 (선택)</span><select name="eventId" defaultValue={modal.type==='taskEdit'?space.tasks.find(t=>t.id===modal.taskId)?.eventId||'':modal.eventId||''}><option value="">행사 연결 없음</option>{space.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=><option key={e.id} value={e.id}>{shortDate(e.date)} · {e.name}</option>)}</select></label>
        <label className="form-field"><span>진행 상태</span><select name="status" defaultValue={modal.type==='taskEdit'?space.tasks.find(t=>t.id===modal.taskId)?.status:'예정'}>{['예정','진행 중','완료'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <button className="btn primary full" type="submit">{modal.type==='taskEdit'?'변경 사항 저장':'업무 추가하기'}</button>
      </FormShell>}
      {(modal.type==='document'||modal.type==='templateGo')&&<div className="modal-template-grid">{TEMPLATES.filter(x=>modal.type==='document'||x.id===modal.template).map(t=><button key={t.id} onClick={()=>{setModal(null);openTemplate(t.id);}}><span className="template-icon"><t.icon size={20}/></span><strong>{t.label}</strong><small>{t.helper}</small><ArrowRight size={17}/></button>)}</div>}
      {modal.type==='link'&&<FormShell onSubmit={data=>{const url=cleanUrl(data.get('url'));if(!url){announce('https:// 또는 http://로 시작하는 주소를 입력해 주세요.');return;}addRecord('links',{id:newId(),title:data.get('title').trim(),url,category:data.get('category').trim()||'기타'});setModal(null);announce('업무 링크를 추가했습니다.');}}><FormField label="링크 이름" name="title" placeholder="예: 자료 취합 스프레드시트" required/><FormField label="웹 주소" name="url" type="url" placeholder="https://..." required/><FormField label="분류" name="category" placeholder="예: 공통, 수업, 행정"/><button className="btn primary full" type="submit">링크 추가하기</button></FormShell>}
      {modal.type==='menu'&&<MenuForm forms={space.forms||[]} onCreate={entry=>{addRecord('menus',{...entry,id:newId()});setModal(null);announce('학교 메뉴에 추가했습니다.');}}/>}
      {modal.type==='school'&&<FormShell onSubmit={data=>{const id=newId();const name=data.get('name').trim();setDb(old=>({...old,schools:[...old.schools,{id,name,type:data.get('type')}],workspaces:{...old.workspaces,[id]:initialWorkspace('other')}}));setSchoolId(id);go('home');setModal(null);announce('새 데모 작업공간을 만들었습니다.');}}><FormField label="학교명" name="name" placeholder="예: 푸른중학교" required/><FormField label="학교 유형" name="type" as="select" options={['중학교','고등학교','초등학교','기타']}/><div className="form-hint">학교 데이터는 이 브라우저에만 저장됩니다.</div><button className="btn primary full" type="submit">작업공간 만들기</button></FormShell>}
    </Modal>}
  </div>;
}
function SideLink({item,active,onClick}) {return <button className={`nav-link ${active?'active':''}`} onClick={onClick}><item.icon size={19} strokeWidth={active?2.2:1.9}/><span>{item.label}</span>{active&&<span className="active-indicator"/>}</button>;}
function SectionHeading({eyebrow,title,desc,onClick,action}) {return <div className="heading-row page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="heading-desc">{desc}</p></div><button className="btn primary" onClick={onClick}><Plus size={17}/>{action}</button></div>;}
function Empty({text}) {return <div className="empty-state"><span><FolderOpen size={23}/></span><p>{text}</p></div>;}
function Modal({title,children,onClose}) {return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button aria-label="닫기" onClick={onClose}><X size={20}/></button></div><div className="modal-content">{children}</div></div></div>;}
function FormShell({children,onSubmit}) {return <form className="app-form" onSubmit={e=>{e.preventDefault();onSubmit(new FormData(e.currentTarget));}}>{children}</form>;}
function FormField({label,name,placeholder,type='text',required=false,defaultValue,as,options}) {return <label className="form-field"><span>{label}{required&&<em> *</em>}</span>{as==='select'?<select name={name} required={required}>{options.map(o=><option value={o} key={o}>{o}</option>)}</select>:<input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} maxLength={name==='url'?500:120}/>}</label>;}
function MenuForm({onCreate,forms=[]}) {
  const [type,setType]=useState('form');const [title,setTitle]=useState('');const [url,setUrl]=useState('');const [template,setTemplate]=useState('meeting');const [formId,setFormId]=useState(forms[0]?.id||'');const [error,setError]=useState('');
  return <form className="app-form" onSubmit={e=>{e.preventDefault();if(!title.trim())return;const normalized=type==='link'?cleanUrl(url):'';if(type==='link'&&!normalized){setError('유효한 http(s) 웹 주소를 입력해 주세요.');return;}if(type==='form'&&!formId){setError('먼저 서식 제작기에서 서식을 만들어 주세요.');return;}onCreate({type,title:title.trim(),url:normalized,template:type==='template'?template:'',formId:type==='form'?formId:''});}}><label className="form-field"><span>메뉴 이름 <em>*</em></span><input required placeholder="예: 회의록 관리" value={title} onChange={e=>setTitle(e.target.value)} maxLength={35}/></label><div className="form-field"><span>메뉴 유형</span><div className="choice-radio"><button type="button" className={type==='form'?'chosen':''} onClick={()=>setType('form')}><FileText size={17}/> 반복 입력 서식</button><button type="button" className={type==='link'?'chosen':''} onClick={()=>setType('link')}><ExternalLink size={17}/> 외부 링크</button><button type="button" className={type==='template'?'chosen':''} onClick={()=>setType('template')}><Files size={17}/> 문서 초안</button></div></div>{type==='link'?<label className="form-field"><span>웹 주소</span><input required type="url" placeholder="https://..." value={url} onChange={e=>setUrl(e.target.value)}/></label>:type==='form'?<label className="form-field"><span>연결할 반복 서식</span><select value={formId} onChange={e=>setFormId(e.target.value)}><option value="">서식 선택</option>{forms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>{forms.length===0&&<small>먼저 왼쪽 '서식 제작기'에서 서식을 만들어 주세요.</small>}</label>:<label className="form-field"><span>연결할 문서 초안</span><select value={template} onChange={e=>setTemplate(e.target.value)}>{TEMPLATES.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>}{error&&<small className="form-error">{error}</small>}<button className="btn primary full" type="submit">학교 메뉴에 추가</button></form>;
}
function DocEditor({doc,onBack,onSave,onDirtyChange}) {const [title,setTitle]=useState(doc.title);const [body,setBody]=useState(doc.body);const isDirty=title!==doc.title||body!==doc.body;const save=()=>{const nextTitle=title.trim()||doc.title;setTitle(nextTitle);onSave({title:nextTitle,body});};const guardedBack=()=>{if(isDirty&&!window.confirm('문서에 저장하지 않은 내용이 있습니다. 목록으로 돌아갈까요?'))return;onBack();};useEffect(()=>{onDirtyChange?.(isDirty);},[isDirty,onDirtyChange]);useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);useEffect(()=>{const handler=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[title,body,doc.title,onSave]);const t=TEMPLATES.find(t=>t.id===doc.template);return <div className="editor-wrap"><div className="editor-toolbar"><button className="back-button" onClick={guardedBack}><ChevronLeft size={17}/> 문서 목록</button><div><span className={`doc-preview-tag ${isDirty?"draft":""}`}>{isDirty?"미저장 변경":"브라우저 저장"}</span><button className="btn primary" onClick={save}><Check size={17}/> 저장하기</button></div></div><section className="editor-paper"><div className="editor-paper-top"><span><FileText size={17}/> {t?.label||'일반 문서'}</span><small>작성자: 데모 사용자 · 마지막 저장: {shortDate(doc.updated)}</small></div><input aria-label="문서 제목" className="editor-title" value={title} onChange={e=>setTitle(e.target.value)}/><div className="editor-divider"/><textarea aria-label="문서 내용" className="editor-body" value={body} onChange={e=>setBody(e.target.value)} placeholder="문서 내용을 작성하세요"/><div className="editor-paper-foot">실제 공동작성 기능은 연결되지 않았습니다. 이 브라우저에서만 저장됩니다.</div></section></div>;}
