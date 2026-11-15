import { describe, expect, it } from "vitest";
import { bindTeachingCalendarGrid, buildTeachingCalendarGrid, formatProjectedUnits, mondayOf } from "../../src/lib/teaching-calendar-grid";
import type { GridDay, GridEvent } from "../../src/lib/teaching-calendar-grid";
import type { TeachingUnit } from "../../src/lib/teaching";

const day = (date: string, type = "instructional", name = "", enabled = true, semester = 1): GridDay => ({
  date, type, name, enabled, semester,
});
const unit = (start: string, id: string, end = start): TeachingUnit => ({
  id, period: "", start, end, title: "단원 A\n단원 B", content: "교사 평가요소",
  standard_ids: [], lessons: null, method: "", alignment: "", note: "교사 직접 비고",
});
const date = (n: number) => "2027-03-" + String(n).padStart(2, "0");
const reference = [day(date(1),"holiday","삼일절"),day(date(2)),day(date(3)),
  day(date(4),"discretionary","재량휴업일"),day(date(5)),day(date(6),"weekend"),
  day(date(7),"weekend"),day(date(8)),day(date(9)),day(date(10))];
const event = (start: number, end: number, title: string, target_grades: number[]): GridEvent => ({
  id:title, title, start_date:date(start), end_date:date(end), target_grades,
});

describe("teaching grid calendar linkage", () => {
  it("uses stable calendar Mondays including cross-month and leap weeks", () => {
    expect(mondayOf("2028-02-29")).toBe("2028-02-28");
    expect(mondayOf("2027-04-01")).toBe("2027-03-29");
    expect(mondayOf("2027-02-29")).toBeNull();
  });
  it("shows one row per calendar week with only the selected grade's events", () => {
    const weeks = buildTeachingCalendarGrid(reference, [
      event(3,5,"현장체험학습",[2]),event(3,5,"다른 학년 행사",[1]),event(8,9,"전교 행사",[]),
    ],1,2);
    expect(weeks.map(w=>w.anchor)).toEqual([date(1),date(8)]);
    expect(weeks[0].calendarNotes).toEqual(["삼일절(3.1.)","재량휴업일(3.4.)","현장체험학습(3.3.~3.5.)"]);
    expect(weeks[1].calendarNotes).toEqual(["전교 행사(3.8.~3.9.)"]);
  });
  it("does not create rows for a semester absent from the calendar", () => {
    expect(buildTeachingCalendarGrid(reference,[],2,2)).toEqual([]);
  });
  it("refreshes date and automatic notes without changing authored content", () => {
    const saved = [unit(date(2),"existing")], before = structuredClone(saved);
    const weeks=buildTeachingCalendarGrid(reference.filter(d=>d.date!==date(1)),[event(5,5,"신규 행사",[])],1,2);
    const grid = bindTeachingCalendarGrid(weeks,saved);
    expect(grid.rows[0].unit?.id).toBe("existing");
    expect(grid.rows[0].week.start).toBe(date(2));
    expect(grid.rows[0].unit?.note).toBe("교사 직접 비고");
    expect(formatProjectedUnits(weeks,saved)[0].note).toContain("신규 행사(3.5.)\n교사 직접 비고");
    expect(saved).toEqual(before);
  });
  it("retains duplicate, multiweek, and displaced entries without moving or discarding them", () => {
    const weeks=buildTeachingCalendarGrid(reference,[],1,2);
    const a=unit(date(2),"one"), b=unit(date(4),"two"), c=unit(date(2),"multiple",date(9)), d=unit(date(22),"displaced");
    const grid=bindTeachingCalendarGrid(weeks,[a,b,c,d]);
    expect(grid.rows[0].unit).toBe(a);
    expect(grid.unattached).toEqual([b,c,d]);
    expect(formatProjectedUnits(weeks,[a,b,c,d],true)).toHaveLength(5);
  });
});
