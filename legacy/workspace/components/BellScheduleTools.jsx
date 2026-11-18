'use client';
import {useMemo,useState} from 'react';
import {DEFAULT_BELL,dayPeriodRange,WDAYS,WDAY_NAMES} from '../lib/timetable-solver.js';
import {clockMinutes,clockParts,changeClockPart,compareBellDay,generateBellSchedule,inferBellSettings,selectOperatingBellRows,timeDifferenceLabel} from '../lib/bell-schedule.js';

const durationFields=[
  {key:'lessonMinutes',label:'수업 시간',min:1,max:120},
  {key:'breakMinutes',label:'쉬는 시간',min:0,max:60},
  {key:'lunchMinutes',label:'점심시간',min:0,max:180},
];
const hours=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
const minutes=Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));
function TimeControls({value,onChange,firstLabel='첫 수업 시작'}){
  const {hour,minute}=clockParts(value.firstLessonStart);
  return <div className="tt-time-controls">
    <div className="tt-time-start">
      <span>{firstLabel}</span>
      <span className="tt-time-pickers">
        <select aria-label={firstLabel+' 시'} value={hour}
          onChange={event=>onChange({...value,firstLessonStart:changeClockPart(value.firstLessonStart,'hour',event.target.value)})}>
          {hours.map(item=><option key={item} value={item}>{item}시</option>)}
        </select>
        <span className="tt-time-colon" aria-hidden="true">:</span>
        <select aria-label={firstLabel+' 분'} value={minute}
          onChange={event=>onChange({...value,firstLessonStart:changeClockPart(value.firstLessonStart,'minute',event.target.value)})}>
          {minutes.map(item=><option key={item} value={item}>{item}분</option>)}
        </select>
      </span>
    </div>
    {durationFields.map(({key,label,min,max})=><label key={key}>
      <span>{label}</span>
      <span className="tt-time-control-wrap">
        <input type="number" value={value[key]??''} min={min} max={max} step={1}
          aria-label={label}
          onChange={event=>onChange({...value,[key]:event.target.value===''?'':Number(event.target.value)})}/>
        <small>분</small>
      </span>
    </label>)}
  </div>;
}
function RowsPreview({rows,original,compact=false}){
  return <div className="tt-table-scroll tt-bell-preview-table">
    <table className="tt-grid">
      <thead><tr><th>구분</th>{original&&<th>현재</th>}<th>{original?'변동 후':'계산된 시작'}</th><th>계산된 종료</th></tr></thead>
      <tbody>{rows.map((row,i)=>{
        const old=original?.[i];
        const changed=!!old&&(row.start!==old.start||row.end!==old.end);
        return <tr key={row.id||i} className={changed?'tt-shifted-row':''}>
          <th>{row.label}</th>
          {original&&<td className="tt-original-time">{old?.start??'—'} ~ {old?.end??'—'}</td>}
          <td>{row.start}</td><td>{row.end}</td>
        </tr>;
      })}</tbody>
    </table>
    {!compact&&<p className="tt-caption">수업 사이 쉬는 시간을 자동 배치하고, 점심시간은 별도 길이로 계산합니다. 조회처럼 첫 수업 전의 일과는 유지합니다.</p>}
  </div>;
}
export function BellAutoSetup({rows,onApply,disabled=false}){
  const bell=rows?.length?rows:DEFAULT_BELL;
  const [settings,setSettings]=useState(()=>inferBellSettings(bell));
  const preview=useMemo(()=>generateBellSchedule(bell,settings),[bell,settings]);
  const changed=preview.ok&&bell.some((row,index)=>row.start!==preview.rows[index].start||row.end!==preview.rows[index].end);
  const lastOld=bell.at(-1)?.end;
  const lastNew=preview.rows.at(-1)?.end;
  const delta=preview.ok?clockMinutes(lastNew)-clockMinutes(lastOld):null;
  return <section className="tt-auto-bell">
    <div className="tt-panel-head">
      <div><h3>일과표 자동 계산</h3><p>첫 수업 시작과 각 활동의 길이를 입력하면 모든 교시의 시작·종료 시각을 다시 계산합니다.</p></div>
      <button className="tt-btn" type="button" onClick={()=>setSettings(inferBellSettings(bell))}>현재 일과 기준으로 다시 설정</button>
    </div>
    <TimeControls value={settings} onChange={setSettings}/>
    {!preview.ok&&<div className="tt-result error" role="alert">{preview.errors.map((e,i)=><p key={i}>{e}</p>)}</div>}
    {preview.ok&&<div className="tt-bell-outcome">
      <span>계산된 종료 시각 <strong>{lastNew}</strong></span>
      <span>현재 종료 시각 <strong>{lastOld}</strong></span>
      <span className="tt-bell-delta">{timeDifferenceLabel(delta)}</span>
    </div>}
    {preview.ok&&<details className="tt-preview-details"><summary>계산된 일과표 미리보기</summary>
      <RowsPreview rows={preview.rows} original={bell}/>
    </details>}
    <div className="tt-actions bottom">
      <span className="tt-caption">미리보기만으로 저장되지 않습니다. 적용 후 상단의 ‘학교에 저장’을 눌러주세요.</span>
      <button type="button" className="tt-btn primary" disabled={disabled||!preview.ok||!changed}
        onClick={()=>onApply(preview.rows)}>이 일과표에 적용</button>
    </div>
  </section>;
}

export function BellChangeCalculator({rows,config}){
  const bell=rows?.length?rows:DEFAULT_BELL;
  const [weekday,setWeekday]=useState(1);
  const weekdayRange=dayPeriodRange(config,weekday);
  const selected=useMemo(()=>selectOperatingBellRows(bell,weekdayRange.start,weekdayRange.end),
    [bell,weekdayRange.start,weekdayRange.end]);
  const [settings,setSettings]=useState(()=>{
    const range=dayPeriodRange(config,1);
    const section=selectOperatingBellRows(bell,range.start,range.end);
    return inferBellSettings(section.ok?section.rows:bell);
  });
  const base=selected.ok?inferBellSettings(selected.rows):inferBellSettings(bell);
  const comparison=useMemo(()=>
    compareBellDay(bell,weekdayRange.start,weekdayRange.end,settings),
    [bell,weekdayRange.start,weekdayRange.end,settings]);
  const oldFirst=selected.ok?selected.rows.find(row=>row.type==='lesson')?.start:null;
  function selectDay(day){
    setWeekday(day);
    const range=dayPeriodRange(config,day);
    const part=selectOperatingBellRows(bell,range.start,range.end);
    setSettings(inferBellSettings(part.ok?part.rows:bell));
  }
  return <section className="tt-panel tt-variation-tool">
    <div className="tt-panel-head"><div>
      <h3>일과 변동 자동계산기</h3>
      <p>단축수업, 점심시간 조정, 수업 시작 시각 변경을 시험해 보세요. 학교에 저장된 일과표에는 영향을 주지 않습니다.</p>
    </div></div>
    <div className="tt-variation-weekday">
      <label>계산할 요일 <select aria-label="계산할 요일" value={weekday} onChange={event=>selectDay(Number(event.target.value))}>
        {WDAYS.map(day=><option key={day} value={day}>{WDAY_NAMES[day]}요일 ({dayPeriodRange(config,day).start}~{dayPeriodRange(config,day).end}교시)</option>)}
      </select></label>
      {oldFirst&&<span>현재 첫 수업: {oldFirst} · 현재 {weekdayRange.start}~{weekdayRange.end}교시 운영</span>}
    </div>
    <TimeControls value={settings} onChange={setSettings} firstLabel="변경할 첫 수업 시각"/>
    <div className="tt-actions tt-variation-presets">
      <button className="tt-btn" type="button" onClick={()=>setSettings(base)}>현재 일과로 초기화</button>
      <button className="tt-btn" type="button" onClick={()=>setSettings({...base,lessonMinutes:Math.max(1,base.lessonMinutes-5)})}>
        수업 5분 단축 시험
      </button>
    </div>
    {!comparison.ok&&<div className="tt-result error" role="alert">{comparison.errors.map((error,index)=><p key={index}>{error}</p>)}</div>}
    {comparison.ok&&<>
      <div className="tt-variation-results" aria-live="polite">
        <div><span>현재 종료 예상</span><strong>{comparison.oldEnd}</strong></div>
        <div><span>변경 후 종료 예상</span><strong>{comparison.newEnd}</strong></div>
        <div className={comparison.delta<0?'tt-variation-earlier':comparison.delta>0?'tt-variation-later':''}>
          <span>종료 시각 변화</span><strong>{timeDifferenceLabel(comparison.delta)}</strong>
        </div>
      </div>
      <RowsPreview rows={comparison.rows} original={selected.rows} compact/>
    </>}
    <p className="tt-caption">계산은 선택한 요일의 운영 교시만 대상으로 합니다. 실제 학생 하교는 종례·청소·방과후 운영 등에 따라 달라질 수 있어요.</p>
  </section>;
}
