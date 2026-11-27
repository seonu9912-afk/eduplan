"use client";
import { useMemo, useState } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateLabel } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { buildScheduleSearchIndex, searchSchedule, type ScheduleSearchResult } from "@/lib/schedule-search";
import { DepartmentBadge } from "./department-badge";
import "./schedule-search.css";

const tones = { event: "학사일정", work: "업무계획", break: "휴업·방학" };
export function ScheduleSearch({ context, start, end, onSelect, onClose }: {
  context: Context; start: string; end: string;
  onSelect: (result: ScheduleSearchResult, trigger: HTMLElement) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const index = useMemo(() => buildScheduleSearchIndex(context, start, end), [context, start, end]);
  const results = useMemo(() => searchSchedule(index, query), [index, query]);
  return <section className="schedule-search-panel no-print" aria-label="일정 검색">
    <div className="schedule-search-heading"><h3>일정 검색 <small>{context.year?.year}학년도 · 학사일정 및 업무계획</small></h3><Button type="button" variant="ghost" size="icon" aria-label="검색 닫기" onClick={onClose}><X size={18} /></Button></div>
    <label className="schedule-search-input"><Search size={18} aria-hidden="true" /><input type="search" autoFocus placeholder="행사명, 업무명, 부서, 장소 검색" aria-label="일정 검색어" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(50); }} /></label>
    <p className="schedule-search-count" role="status">{query.trim() ? `검색 결과 ${results.length}건` : "검색어를 입력해 주세요."}</p>
    {results.length > 0 && <ul className="schedule-search-results">{results.slice(0, limit).map((result, i) => <li key={`${result.entry.id}:${result.from}:${i}`}>
      <button type="button" aria-haspopup="dialog" onClick={(event) => onSelect(result, event.currentTarget)}>
        <span className="schedule-search-date"><strong>{dateLabel(result.from)}{result.to !== result.from && ` ~ ${dateLabel(result.to)}`}</strong><small>{result.entry.operationGroup ?? tones[result.entry.tone]}</small></span>
        <span className="schedule-search-title">{result.entry.department && <DepartmentBadge department={result.entry.department} />}<strong>{result.entry.title}</strong>{result.entry.location && <small>{result.entry.location}</small>}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </li>)}</ul>}
    {!!query.trim() && !results.length && <p className="schedule-search-empty">일치하는 공개 일정이 없습니다.</p>}
    {results.length > limit && <Button type="button" variant="outline" onClick={() => setLimit((value) => value + 50)}>검색 결과 더 보기</Button>}
  </section>;
}
