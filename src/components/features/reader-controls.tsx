"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReaderPeriodNavigator({ title, subtitle, previous, next, today, previousLabel = "이전 기간", nextLabel = "다음 기간", todayDisabled = false, onTitleClick }: {
  title: string; subtitle?: string; previous?: () => void; next?: () => void; today: () => void;
  previousLabel?: string; nextLabel?: string; todayDisabled?: boolean; onTitleClick?: () => void;
}) {
  return <div className="schedule-period-nav reader-period-nav">
    <Button type="button" variant="ghost" size="icon" aria-label={previousLabel} disabled={!previous} onClick={previous}><ChevronLeft /></Button>
    <div className="reader-period-title" aria-live="polite">
      <h2>{onTitleClick ? <button type="button" className="reader-period-picker" aria-label={title+" 날짜 선택"} onClick={onTitleClick}>{title}<ChevronDown className="reader-period-chevron" aria-hidden="true" size={14} /></button> : title}</h2>
      {subtitle && <small>{subtitle}</small>}
    </div>
    <Button type="button" variant="ghost" size="icon" aria-label={nextLabel} disabled={!next} onClick={next}><ChevronRight /></Button>
    <Button type="button" variant="outline" size="sm" className="reader-today" disabled={todayDisabled} onClick={today}>오늘</Button>
  </div>;
}

export function ReaderViewSegment<T extends string>({ options, value, onChange, label, className = "" }: {
  options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string; className?: string;
}) {
  return <div className={`schedule-segments reader-segments ${className}`} role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
