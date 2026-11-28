"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Disclosure} from "@/components/ui/disclosure";
import {InlineNotice,useMutation} from "@/components/common";
import {loadNationalReference,importNationalStandard} from "@/app/teaching-actions";
import {nationalSubjects,nationalLanguages,normalized,referenceSubject,defaultCurriculum,hasPrivateGlyph,matchesReference,type NationalReference,type SelectedStandard,type LevelStandard} from "@/lib/national-reference";
import type {Context,Row} from "@/lib/models";
type LevelRow={label:string;description:string;standard_id?:string|null};
export function NationalReferenceBrowser({context:c,subject,grade,mode,onSelect,selectedStandards=[],levelRows=[],onLevels,editable=true}:{context:Context;subject:string;grade:number;mode:"standards"|"levels"|"areas";onSelect?:(s:Row<"achievement_standards">)=>void;selectedStandards?:SelectedStandard[];levelRows?:LevelRow[];onLevels?:(rows:LevelRow[])=>void;editable?:boolean}){
 const [version,setVersion]=useState(()=>defaultCurriculum(c.schoolType,c.year?.year,grade));
 const [catalog,setCatalog]=useState(()=>referenceSubject(subject)||"국어");
 const [language,setLanguage]=useState(()=>nationalLanguages.find(v=>normalized(v)===normalized(subject))??"");
 const [query,setQuery]=useState("");
 const [data,setData]=useState<NationalReference|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const m=useMutation();
 useEffect(()=>{
   let active=true;setLoading(true);setData(null);setError("");setNotice("");
   loadNationalReference(c.schoolType,version,catalog).then(r=>{if(!active)return;if(r.ok)setData(r.data);else setError(r.error);setLoading(false);}).catch(()=>{if(active){setError("공통 자료를 불러오지 못했습니다.");setLoading(false);}});
   return()=>{active=false;};
 },[c.schoolType,version,catalog]);
 const filter=(v:string)=>normalized(v.toLowerCase()).includes(normalized(query.toLowerCase()));
 const source=data?.source;
 const sameLanguage=(v?:string|null)=>!language||v===language;
 const archived=source?.standards.filter(s=>sameLanguage(s.language)&&filter(s.code+" "+s.standard_text+" "+s.area))??[];
 const official=data?.official.filter(s=>filter(s.code+" "+s.content+" "+s.area))??[];
 const availableOfficial=new Set(data?.official.map(s=>s.code)??[]);
 const pages=(p:number[])=>source?p.map(n=>n-source.source.pdf_page_offset).join(", "):p.join(", ");
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);setNotice("복사했습니다.");}catch{setNotice("복사하지 못했습니다. 내용을 직접 선택해 복사하세요.");}};
 const choose=(id:string|null,r?:LevelStandard)=>{
   if(!onSelect||!editable)return;
   if(!id&&!window.confirm("성취수준 자료의 인용문입니다. 교육과정 고시 원문과 대조했는지 확인하세요. 학교별 직접 등록 자료로 연결할까요?"))return;
   m.execute(()=>importNationalStandard(c.workspace.id,id,id?null:source?.source.sha256??null,r?.code??null),onSelect,"성취기준을 연결했습니다.");
 };
 const add=(r:LevelStandard,s:SelectedStandard)=>{
   if(!onLevels||!editable)return;
   const next=r.groups.map(g=>({label:g.levels.join("·"),description:g.description,standard_id:s.id})).filter(g=>!levelRows.some(v=>v.standard_id===g.standard_id&&v.label===g.label));
   if(next.some(g=>hasPrivateGlyph(g.description))){setNotice("수식 원문 확인이 필요한 항목은 자동 입력할 수 없습니다.");return;}
   if(!next.length){setNotice("이미 해당 수준이 작성되어 있습니다.");return;}
   if(levelRows.length+next.length>30){setNotice("성취수준은 최대 30행까지 작성할 수 있습니다.");return;}
   if(!window.confirm("성취수준 자료에서 추출한 참고 진술문을 빈 수준 행에 추가합니다. 기존 내용은 유지됩니다. 원문을 확인했나요?"))return;
   onLevels([...levelRows,...next]);setNotice("참고 진술문을 추가했습니다. 저장 전 검토하세요.");
 };
 return <div className="national-reference-browser">
   <div className="standard-filters"><select aria-label="국가 자료 교육과정" value={version} onChange={e=>setVersion(e.target.value)} disabled={m.pending}><option>2022 개정</option><option>2015 개정</option><option>기타</option></select><select aria-label="국가 자료 교과" value={catalog} onChange={e=>{setCatalog(e.target.value);setLanguage("");}} disabled={m.pending}>{nationalSubjects.map(s=><option key={s}>{s}</option>)}</select></div>
   {catalog==="생활 외국어"&&<select aria-label="생활 외국어 과목" value={language} onChange={e=>setLanguage(e.target.value)}><option value="">전체 언어</option>{nationalLanguages.map(s=><option key={s}>{s}</option>)}</select>}
   <input aria-label="공통 자료 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="코드·영역·내용 검색"/>
   <p className="muted-small">{c.schoolType} · {version} · {catalog} · 성취수준 자료는 추출본이며 원문 확인이 필요합니다.</p>
   {loading&&<p role="status">공통 자료 불러오는 중…</p>}{error&&<p role="alert">{error}</p>}
   {data&&mode==="standards"&&<>
    {official.length>0&&<Disclosure label={`교육부 고시 원문 · ${official.length}개`} open>
     {Array.from(new Set(official.map(s=>s.area))).map(a=><Disclosure compact key={a} label={a}>{official.filter(s=>s.area===a).map(s=><article key={s.id} className="national-reference-item"><strong>{s.code}</strong><p>{s.content}</p><small>{s.notice} [별책 {s.annex}] · {s.printed_page}쪽</small><Button size="sm" variant="outline" disabled={!editable||m.pending} onClick={()=>choose(s.id)}>선택·연결</Button></article>)}</Disclosure>)}
    </Disclosure>}
    {archived.some(r=>!availableOfficial.has(r.code))&&<Disclosure label="성취수준 자료의 성취기준 인용문 · 원문 확인 필요" open={official.length===0}>
     {Array.from(new Set(archived.filter(r=>!availableOfficial.has(r.code)).map(r=>[r.language,r.area].filter(Boolean).join(" · ")))).map(a=><Disclosure compact key={a} label={a}>{archived.filter(r=>!availableOfficial.has(r.code)&&[r.language,r.area].filter(Boolean).join(" · ")===a).map(r=><article className="national-reference-item" key={r.code}><strong>{r.source_code??r.code}</strong><p>{r.standard_text}</p><small>{source?.source.title} · {pages(r.pdf_pages)}쪽 · 고시 대조 필요</small><Button size="sm" variant="outline" disabled={!editable||m.pending||hasPrivateGlyph(r.standard_text)||!!r.linked_code&&r.linked_code!==r.code||!!r.source_code&&r.source_code!==r.code} onClick={()=>choose(null,r)}>확인 후 등록·연결</Button></article>)}</Disclosure>)}
    </Disclosure>}
   </>}
   {data&&mode==="levels"&&archived.map(r=>{
     const s=source&&selectedStandards.find(x=>matchesReference(x,r,source));
     if(!query&&selectedStandards.length&&!selectedStandards.some(x=>normalized(x.code)===normalized(r.code)||normalized(x.code)===normalized(r.linked_code??"")))return null;
     return <Disclosure compact key={r.code} label={`${r.source_code??r.code} · ${r.language??r.area}`}>
       <p>{r.standard_text}</p><small>{source?.source.title} · {pages(r.pdf_pages)}쪽</small>
       {r.groups.map((g,i)=><div className="national-level-row" key={i}><strong>{g.levels.join("·")}</strong><p>{g.display_description??g.description}</p></div>)}
       <div className="teaching-actions"><Button size="sm" variant="outline" onClick={()=>copy(r.groups.map(g=>g.levels.join("·")+" "+(g.display_description??g.description)).join("\n"))}>진술문 복사</Button>{s&&onLevels&&<Button size="sm" disabled={!editable} onClick={()=>add(r,s)}>작성란에 추가</Button>}</div>
       {!s&&selectedStandards.length>0&&<small>연결 기준의 코드·본문·교과가 정확히 일치하지 않아 자동 입력을 제한합니다.</small>}
     </Disclosure>;
   })}
   {data&&mode==="areas"&&source?.areas.filter(a=>sameLanguage(a.language)&&filter([a.language,a.area].filter(Boolean).join(" "))).map((a,i)=><Disclosure compact key={i} label={[a.language,a.area].filter(Boolean).join(" · ")}>
     {a.source_area&&a.source_area!==a.area&&<small>표 원문 영역명: {a.source_area} · 확인 필요</small>}
     {a.levels.map((v,n)=><div className="national-level-row" key={n}><strong>{v.level} {v.category??""}</strong><p>{v.display_description??v.description??""}{!v.description&&" (원문 빈칸)"}</p><small>{pages(v.pdf_pages)}쪽</small></div>)}
     <Button variant="outline" size="sm" onClick={()=>copy(a.levels.map(v=>[v.level,v.category,v.display_description??v.description].filter(Boolean).join(" ")).join("\n"))}>영역 진술문 복사</Button>
   </Disclosure>)}
   {data&&!data.source&&!data.official.length&&<p>해당 교육과정·교과 자료는 아직 등록되지 않았습니다. 기존 직접 등록 기능을 이용하세요.</p>}
   {source&&<Disclosure compact label="자료 출처 및 검수 유의사항"><p>{source.source.title}</p><p>고시 원문 대조와 전체 육안 검수는 완료되지 않았습니다. 학기 단위 성취수준과 채점기준은 교사가 재구성하세요.</p>{[...(source.source.validation_notes??[]),...(source.source.validation_issues??[])].map((v,i)=><p key={i}>{v}</p>)}</Disclosure>}
   {notice&&<p role="status">{notice}</p>}<InlineNotice mutation={m}/>
 </div>;
}
