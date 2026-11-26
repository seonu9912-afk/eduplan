import { seoulToday } from "@/lib/domain";

export function PublicationFields({ start, end }: { start: string; end: string }) {
  const today = seoulToday();
  return <>
    <label className="field">적용 시작일
      <input type="date" name="startsOn" min={start} max={end}
        defaultValue={today < start ? start : today > end ? end : today} required />
    </label>
    <label className="field">변경 내용
      <textarea name="note" maxLength={500} rows={2} />
    </label>
  </>;
}
