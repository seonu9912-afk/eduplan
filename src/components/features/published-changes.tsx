"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Context } from "@/lib/models";
import { publishedChanges, type PublishedChange } from "@/lib/published-changes";

export type PublishedChangesState = { items: PublishedChange[]; confirm: (id:string)=>void };
export function usePublishedChanges(c: Context): PublishedChangesState {
  const key = `eduplan:published-changes:${c.workspace.id}:${c.year?.id}:${c.userId}`;
  const [confirmed,setConfirmed]=useState<string[]>([]);
  useEffect(()=>{
    const load=()=>{try{const value:unknown=JSON.parse(localStorage.getItem(key)??"[]"); if(Array.isArray(value))setConfirmed(value.filter((v):v is string=>typeof v==="string"));}catch{/* unavailable storage */}};
    const timer=window.setTimeout(load,0);
    window.addEventListener("storage",load);
    return()=>{window.clearTimeout(timer);window.removeEventListener("storage",load);};
  },[key]);
  const all=useMemo(()=>publishedChanges(c),[c]);
  const items=all.filter(item=>!confirmed.includes(item.id));
  function confirm(id:string) {
    let next=[...confirmed,id];
    try {const saved:unknown=JSON.parse(localStorage.getItem(key)??"[]");if(Array.isArray(saved))next=[...new Set([...saved.filter((v):v is string=>typeof v==="string"),...next])];localStorage.setItem(key,JSON.stringify(next));}catch{/* in-memory confirmation remains */}
    setConfirmed(next);
  }
  return {items,confirm};
}
const labels={calendar:"학사일정",plans:"업무계획",timetable:"시간표"};
export function PublishedChanges({context:c,state,onNavigate}:{context:Context;state:PublishedChangesState;onNavigate?:()=>boolean}){
  if(!state.items.length)return null;
  return <section className="published-changes" aria-label="공개 계획 변경 알림">
    <h2>최근 공개 계획 변경 <small>{state.items.length}건</small></h2>
    {state.items.map(item=><article key={item.id} className="published-change">
      <header><strong>{labels[item.domain]} 변경 {item.related&&<span className="published-change-mine">나의 수업 관련</span>}</strong><small>{item.startsOn}부터 적용{item.publishedAt&&" · "+new Date(item.publishedAt).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})+" 공개"}</small></header>
      <details open={item.rows.length<=3||item.related}><summary>변경 내역 {item.rows.length}건 보기</summary>
        <ul>{item.rows.map((row,i)=><li key={i}><strong>{row.title} <small>{row.before===undefined?"추가":row.after===undefined?"삭제":"변경"}{row.related?" · 나의 수업":""}</small></strong>
          {row.before!==undefined&&<p><span>이전</span> {row.before}</p>}
          {row.after!==undefined&&<p><span>변경 후</span> {row.after}</p>}
          {row.before!==undefined&&row.after!==undefined&&row.before===row.after&&<p>세부 정보 변경</p>}
        </li>)}</ul>
      </details>
      <div className="published-change-actions"><Button variant="ghost" asChild><Link href={`/app/${c.workspace.id}/${item.domain}?year=${c.year?.year}&date=${item.startsOn}`} onClick={e=>{if(onNavigate&&!onNavigate())e.preventDefault();}}>{labels[item.domain]} 열기</Link></Button><Button variant="outline" size="sm" onClick={()=>state.confirm(item.id)}>확인</Button></div>
    </article>)}
  </section>;
}
