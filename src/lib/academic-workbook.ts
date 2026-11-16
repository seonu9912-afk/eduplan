import { type AcademicClass, type AnnualPlan, calculateAcademic, dayTypes, isTeachingDay } from "./academic";
import { academicEventInTerm, curriculumTargets, hoursRange } from "./academic-rebuild";
import type { PaperSize } from "exceljs";
import type { Context, Row } from "./models";

type ExportOptions = { paper: "A3" | "A4"; grade: number; semester: number };
export type ExportData = Pick<Context, "grades" | "plans" | "hours" | "subjects" | "groups"> & {
  classes?: AcademicClass[];
  semesters: Pick<Row<"semesters">, "number" | "start_date" | "end_date">[];
  events: Pick<Row<"events">, "id" | "title" | "start_date" | "end_date" |
    "target_grades" | "department" | "description" | "version">[];
};

export async function buildAcademicWorkbook(year: number, plan: AnnualPlan,
  data: ExportData, options: ExportOptions, label: string) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const report = calculateAcademic(year, plan, data.grades, data.semesters, data.classes);
  const classNumbers = new Map(data.classes?.map((item) => [item.id, item.class_number]));
  const targets = curriculumTargets(year, data);
  const byDate = new Map(report.days.map((day) => [day.date, day]));
  const months = [...new Set(report.days.map((day) => day.date.slice(0, 7)))];
  const sheets = ["연간 학사력", "행사 목록", "시수 확보 현황"].map((name) => book.addWorksheet(name, {
    pageSetup: { paperSize: (options.paper === "A3" ? 8 : 9) as PaperSize, orientation: "landscape",
      fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  }));
  const [calendar, events, hours] = sheets;
  const title = `${year}학년도 · ${label} · 배정 점검 ${report.warnings.length}건`;
  for (const sheet of sheets) {
    sheet.addRow([title]);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 2 }];
  }
  calendar.addRow(["일", ...months.map((month) => `${Number(month.slice(5))}월`)]);
  calendar.getColumn(1).width = 7;
  for (let col = 2; col <= 13; col++) calendar.getColumn(col).width = 15;
  const colors = { holiday: "FFFFECE7", vacation: "FFEDE9FC", discretionary: "FFFFF1D8",
    weekend: "FFF0F3F7", swap: "FFDDEAFF", instructional: "FFFFFFFF" };
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  for (let number = 1; number <= 31; number++) {
    const row = calendar.addRow([number]);
    months.forEach((month, index) => {
      const day = byDate.get(`${month}-${String(number).padStart(2, "0")}`);
      if (!day) return;
      const weekday = new Date(day.date + "T12:00:00Z").getUTCDay();
      const cell = row.getCell(index + 2);
      cell.value = [weekdays[weekday], day.type === "swap" ? `→${weekdays[day.weekday]}`
        : day.type === "instructional" ? "" : dayTypes[day.type], !day.enabled ? "사용 해제" : ""]
        .filter(Boolean).join(" ");
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors[day.type] } };
    });
  }
  calendar.addRow(["수업일", ...months.map((month) => report.days.filter(
    (day) => day.date.startsWith(month) && isTeachingDay(day)).length)]);
  calendar.pageSetup.printArea = "A1:M34";

  events.addRow(["시작일", "종료일", "행사명", "학년", "부서", "날짜·교시별 편성", "비고"]);
  const matchesGrade = (grades: number[]) => !options.grade || !grades.length || grades.includes(options.grade);
  const allocations = plan.allocations.filter((row) => matchesGrade(Object.keys(row.areas).map(Number))
    && (!options.semester || byDate.get(row.date)?.semester === options.semester));
  const presentIds = new Set(data.events.map((event) => event.id));
  const eventRows = data.events.filter((event) => matchesGrade(event.target_grades) &&
    academicEventInTerm(event, report.days, options.semester)).map((event) =>
    ({ ...event, allocations: allocations.filter((row) => row.eventId === event.id) }));
  for (const row of allocations.filter((item) => !item.eventId || !presentIds.has(item.eventId))) {
    eventRows.push({ id: row.id, title: row.title, start_date: row.date, end_date: row.date,
      target_grades: Object.keys(row.areas).map(Number), department: row.department, description: "", version: 0,
      allocations: [row] });
  }
  for (const event of eventRows.sort((a, b) => a.start_date.localeCompare(b.start_date)
    || a.title.localeCompare(b.title))) {
    const detail = event.allocations.flatMap((row) => Object.entries(row.areas)
      .filter(([grade, area]) => area !== "없음" && (!options.grade || Number(grade) === options.grade))
      .map(([grade, area]) => {
        const number = row.classId ? classNumbers.get(row.classId) : undefined;
        const scope = row.classId ? number ? ` ${number}반` : " 보관된 학급" : "";
        return `${row.date} ${row.start}~${row.end}교시 · ${grade}학년${scope} ${area}`;
      }));
    const base = [event.start_date, event.end_date, event.title,
      event.target_grades.join(", ") || "전 학년", event.department];
    events.addRow([...base, detail.join("\n"), event.description]).getCell(6).alignment = { wrapText: true };
  }
  events.autoFilter = "A2:G2";
  [16, 16, 32, 14, 20, 50, 38].forEach((width, i) => { events.getColumn(i + 1).width = width; });

  hours.addRow(["학년·학급", "구분", "수업일수", "운영 교시", "교과 확보", "교과 목표",
    "차이", "창체 확보", "창체 목표", "중복 교시"]);
  for (const grade of data.grades.filter((value) => !options.grade || options.grade === value)) {
    for (const semester of [1, 2, 0].filter((value) => !options.semester || !value || options.semester === value)) {
      const rows = report.totals.filter((row) => row.grade === grade && (!semester || semester === row.semester));
      const goals = targets.filter((goal) => goal.grade === grade && (!semester || semester === goal.semester));
      const creativeAreas = ["자율", "자율·자치", "동아리", "진로", "봉사"];
      const subjectGoal = goals.every((goal) => goal.subject !== null)
        ? goals.reduce((sum, goal) => sum + (goal.subject ?? 0), 0) : null;
      const creativeGoal = goals.every((goal) => goal.creative !== null)
        ? goals.reduce((sum, goal) => sum + (goal.creative ?? 0), 0) : null;
      const classReports = (data.classes ?? []).filter((item) => item.grade === grade).map((item) => ({
        label: `${grade}학년 ${item.class_number}반`,
        rows: report.classTotals.filter((row) => row.classId === item.id && (!semester || semester === row.semester)),
      }));
      const summarize = (totals: typeof report.totals) => ({
        subject: totals.reduce((sum, row) => sum + (row.counts["교과"] ?? 0), 0),
        creative: totals.reduce((sum, row) => sum + creativeAreas.reduce(
          (total, area) => total + (row.counts[area] ?? 0), 0), 0),
        conflicts: totals.reduce((sum, row) => sum + row.conflicts, 0),
        provisional: totals.some((row) => row.unconfigured || row.conflicts),
      });
      const addTotals = (label: string, summaries: ReturnType<typeof summarize>[]) => {
        const provisional = summaries.some((value) => value.provisional);
        const subject = hoursRange(summaries.map((value) => value.subject));
        const difference = subjectGoal == null || provisional ? "" :
          hoursRange(summaries.map((value) => value.subject - subjectGoal));
        hours.addRow([label, semester ? `${semester}학기` : "연간",
          rows.reduce((sum, row) => sum + row.days, 0), rows.reduce((sum, row) => sum + row.hours, 0),
          provisional ? `${subject} (잠정)` : subject, subjectGoal ?? "미설정", difference,
          hoursRange(summaries.map((value) => value.creative)), creativeGoal ?? "미설정",
          hoursRange(summaries.map((value) => value.conflicts))]);
      };
      const summaries = classReports.map((item) => ({ label: item.label, totals: summarize(item.rows) }));
      addTotals(`${grade}학년`, summaries.length ? summaries.map((item) => item.totals) : [summarize(rows)]);
      for (const item of summaries) addTotals(item.label, [item.totals]);
    }
  }
  hours.columns.forEach((col) => { col.width = 17; });
  for (const sheet of sheets) {
    sheet.getRow(2).font = { bold: true, color: { argb: "FF173E82" } };
    sheet.pageSetup.printTitlesRow = "1:2";
  }
  return book;
}
