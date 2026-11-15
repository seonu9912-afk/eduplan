import type { AnnualPlan } from "./academic";
import {
  calculateAcademic,
  dayTypes,
  areas,
  summarizeAcademicDays,
} from "./academic";
export function downloadBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportAcademic(
  year: number,
  plan: AnnualPlan,
  grades: number[],
  terms: { number: number; start_date: string; end_date: string }[],
  events: {
    title: string;
    start_date: string;
    end_date: string;
    department: string;
    description: string;
    activity_area?: string;
  }[] = [],
) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const result = calculateAcademic(year, plan, grades, terms);
  const summary = summarizeAcademicDays(result.days, plan);
  const add = (name: string, rows: (string | number | boolean)[][]) => {
    const sheet = book.addWorksheet(name);
    sheet.addRows(rows);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c) => {
      c.width = 20;
    });
  };
  add("수업일수 요약", [
    ["구분", "수업일수"],
    ["연간", summary.total],
    ["1학기", summary.semesters[0]],
    ["2학기", summary.semesters[1]],
    ...summary.months.map((m) => [m.month, m.days]),
  ]);
  add("연간 학사일", [
    [
      "날짜",
      "유형",
      "명칭",
      "학기",
      "사용",
      "적용요일",
      "시작교시",
      "종료교시",
    ],
    ...result.days.map((d) => [
      d.date,
      dayTypes[d.type],
      d.name,
      d.semester,
      d.enabled,
      d.weekday,
      d.start ?? "",
      d.end ?? "",
    ]),
  ]);
  add("학교 일정", [
    ["시작일", "종료일", "일정명", "부서", "내용", "교육활동 영역"],
    ...events.map((e) => [
      e.start_date,
      e.end_date,
      e.title,
      e.department,
      e.description,
      e.activity_area ?? "없음",
    ]),
  ]);
  add("행사목록", [
    [
      "날짜",
      "시작교시",
      "종료교시",
      "행사명",
      "담당부서",
      ...grades.map((g) => `${g}학년구분`),
    ],
    ...plan.allocations.map((a) => [
      a.date,
      a.start,
      a.end,
      a.title,
      a.department,
      ...grades.map((g) => a.areas[g] ?? "없음"),
    ]),
  ]);
  add("학기별 시수", [
    [
      "학년",
      "학기",
      "수업일수",
      "전체시수",
      "중복교시",
      ...areas.filter((a) => a !== "없음"),
    ],
    ...result.totals.map((t) => [
      t.grade,
      t.semester,
      t.days,
      t.hours,
      t.conflicts,
      ...areas.filter((a) => a !== "없음").map((a) => t.counts[a] ?? 0),
    ]),
  ]);
  add("날짜별 시수", [
    [
      "날짜",
      "학년",
      "학기",
      "수업일수",
      "전체시수",
      "중복교시",
      ...areas.filter((a) => a !== "없음"),
    ],
    ...result.details.map((t) => [
      t.date,
      t.grade,
      t.semester,
      t.active ? 1 : 0,
      t.hours,
      t.conflicts,
      ...areas.filter((a) => a !== "없음").map((a) => t.counts[a] ?? 0),
    ]),
  ]);
  const weeks = new Map<string, { days: Set<string>; hours: number }>();
  for (const d of result.details.filter((d) => d.active)) {
    const date = new Date(d.date + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = `${date.toISOString().slice(0, 10)},${d.grade}`;
    const w = weeks.get(key) ?? { days: new Set<string>(), hours: 0 };
    w.days.add(d.date);
    w.hours += d.hours;
    weeks.set(key, w);
  }
  add("주별 수업일수 시수", [
    ["주 시작일", "학년", "수업일수", "시수"],
    ...[...weeks].map(([k, v]) => [
      k.split(",")[0],
      Number(k.split(",")[1]),
      v.days.size,
      v.hours,
    ]),
  ]);
  add("반복 창체", [
    [
      "활동명",
      "학년",
      "학기",
      "요일",
      "시작교시",
      "종료교시",
      "영역",
      "제외일",
    ],
    ...plan.recurring.map((r) => [
      r.name,
      r.grade,
      r.semester,
      r.weekday,
      r.start,
      r.end,
      r.area,
      r.exclude.join(","),
    ]),
  ]);
  add("업무계획", [
    ["날짜", "부서", "구분", "내용", "시간", "장소", "대상·참석자"],
    ...plan.business.map((b) => [
      b.date,
      b.department,
      b.kind,
      b.text,
      b.time ?? "",
      b.location ?? "",
      b.participants ?? "",
    ]),
  ]);
  const bytes = await book.xlsx.writeBuffer();
  downloadBlob(
    bytes as unknown as BlobPart,
    `${year}학년도_학사일정.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
export async function importLegacyEvents(file: File, grades: number[]) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet("행사목록") ?? book.worksheets[0];
  if (!sheet) throw new Error("시트를 찾을 수 없습니다.");
  let header = 0;
  const columns: Record<string, number> = {};
  sheet.eachRow((row, n) => {
    if (header) return;
    row.eachCell((cell) => {
      if (cell.text === "날짜") {
        header = n;
        row.eachCell((v, i) => {
          columns[v.text.trim()] = i;
        });
      }
    });
  });
  if (!header || !columns["행사명"])
    throw new Error(
      "날짜·행사명 열이 있는 기존 행사목록 파일을 선택해 주세요.",
    );
  const allocations: AnnualPlan["allocations"] = [];
  sheet.eachRow((row, n) => {
    if (n <= header) return;
    const text = (key: string) =>
      columns[key] ? row.getCell(columns[key]).text.trim() : "";
    const raw = columns["날짜"] ? row.getCell(columns["날짜"]).value : null;
    const date =
      raw instanceof Date ? raw.toISOString().slice(0, 10) : text("날짜");
    if (!date && !text("행사명")) return;
    if (!text("시작교시") || !text("종료교시"))
      throw new Error(
        "시작·종료 교시가 없는 행사는 행사 일정에서 등록해 주세요.",
      );
    allocations.push({
      id: crypto.randomUUID(),
      date,
      title: text("행사명"),
      department: text("담당부서"),
      start: Number(text("시작교시") || 1),
      end: Number(text("종료교시") || text("시작교시") || 1),
      areas: Object.fromEntries(
        grades.map((g) => [g, text(`${g}학년구분`) || "없음"]),
      ) as AnnualPlan["allocations"][number]["areas"],
    });
  });
  return allocations;
}
