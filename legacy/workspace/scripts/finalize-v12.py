from pathlib import Path
p=Path(__file__).parents[1]
bridge=p/'lib/v12-calendar-bridge.js'
s=bridge.read_text()
needle='export function v12RecurringHours(plan){'
insert='''/** All dates on which a recurring activity could run, before its per-date exclusions. */
export function v12EligibleRecurringDates(plan,row){
  if(!row||![1,2,3].includes(Number(row.학년))||![1,2].includes(Number(row.학기))||!DOW.slice(1,6).includes(row.요일))return [];
  return v12Days(plan).filter(d=>Number(d.학기)===Number(row.학기)&&(d.적용요일||d.요일)===row.요일&&
    ['instructional','swap'].includes(d.유형)&&isInstructionDate(plan,d.날짜,Number(row.학년))).map(d=>d.날짜);
}
export function v12RecurringDates(plan,row){
  const excluded=new Set(String(row?.제외일목록||'').split(',').map(d=>d.trim()).filter(Boolean));
  return v12EligibleRecurringDates(plan,row).filter(d=>!excluded.has(d));
}
'''
assert needle in s
s=s.replace(needle,insert+needle)
s=s.replace("  const days=v12Days(plan).filter(d=>['instructional','swap'].includes(d.유형));\n  for(const r of v12Recurring(plan)){\n    const excluded=new Set(String(r.제외일목록||'').split(',').map(s=>s.trim()).filter(Boolean));\n    const matching=days.filter(d=>Number(d.학기)===Number(r.학기)&&(d.적용요일||d.요일)===r.요일&&!excluded.has(d.날짜)&&isInstructionDate(plan,d.날짜,Number(r.학년)));\n    const n=Math.max(0,Number(r.종료교시)-Number(r.시작교시)+1)*matching.length;", "  for(const r of v12Recurring(plan)){\n    const n=Math.max(0,Number(r.종료교시)-Number(r.시작교시)+1)*v12RecurringDates(plan,r).length;")
bridge.write_text(s)
print('Patched bridge')
