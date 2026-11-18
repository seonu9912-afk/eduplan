import type { Context } from "./models";
import type { AnnualPlan } from "./academic";
import { areas } from "./academic";
import { calendarDates, eventChange, type CalendarChange, type CalendarEvent, type EventDraft } from "./academic-calendar";
import type { Workbook, Worksheet, Cell } from "exceljs";

export const EVENT_SHEET = "행사 목록";
export const PERIOD_SHEET = "교시 편성";
export const EVENT_HEADERS = ["행사번호", "행사명", "담당부서", "시작일", "종료일", "대상학년", "대상학급", "비고"] as const;
export const PERIOD_HEADERS = ["행사번호", "날짜", "시작교시", "종료교시", "영역", "적용학년"] as const;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ExcelEventDraft = {
  id: string; key: string; title: string; department: string; start_date: string; end_date: string;
  target_grades: number[]; target_class_ids: string[]; description: string; slots: EventDraft["slots"];
};
export type ExcelEventPreview = {
  events: ExcelEventDraft[]; errors: string[]; warnings: string[]; periodRows: number;
  filename: string;
};
export const EVENT_EXCEL_MAX_BYTES = 2 * 1024 * 1024;

function cellText(cell: Cell): string {
  const value: unknown = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    const rich = value as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (rich.text != null) return rich.text.trim();
    if (rich.richText) return rich.richText.map((item) => item.text).join("").trim();
    if (rich.result != null) return String(rich.result).trim();
  }
  return "";
}
function dateText(cell: Cell): string {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  const raw = cellText(cell);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}[./]\d{1,2}[./]\d{1,2}\.?$/.test(raw)) {
    const parts = raw.match(/\d+/g)!;
    return parts[0] + "-" + parts[1].padStart(2, "0") + "-" + parts[2].padStart(2, "0");
  }
  const serial = Number(raw);
  if (raw && Number.isInteger(serial) && serial > 30000 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  return raw;
}
function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date + "T12:00:00Z")) &&
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date;
}
function parseGrades(input: string, allGrades: readonly number[]): number[] | null {
  if (!input || /^(전체|전학년|전체학년|모든학년)$/.test(input.replace(/\s/g, ""))) return [...allGrades];
  const pieces = input.split(/[,;\s/]+/).map((item) => item.replace(/학년$/, "")).filter(Boolean);
  const values = pieces.map(Number);
  if (!pieces.length || values.some((grade) => !Number.isInteger(grade) || !allGrades.includes(grade))) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}
function parseClasses(input: string, grades: readonly number[], context: Context): string[] | null {
  if (!input) return [];
  const tokens = input.split(/[,;\s/]+/).filter(Boolean);
  const classIds: string[] = [];
  for (const token of tokens) {
    const match = /^(\d+)[-학년](\d+)(?:반)?$/.exec(token);
    if (!match) return null;
    const grade = Number(match[1]), number = Number(match[2]);
    const item = context.classes.find((schoolClass) => schoolClass.grade === grade && schoolClass.class_number === number);
    if (!item || !grades.includes(grade)) return null;
    if (!classIds.includes(item.id)) classIds.push(item.id);
  }
  return classIds;
}
function periodNumber(input: string): number | null {
  if (!/^\d{1,2}$/.test(input)) return null;
  const number = Number(input);
  return number >= 1 && number <= 12 ? number : null;
}
function nonemptyRow(sheet: Worksheet, rowNumber: number, length: number): boolean {
  const row = sheet.getRow(rowNumber);
  return Array.from({ length }, (_, index) => cellText(row.getCell(index + 1))).some(Boolean);
}
function checkHeaders(sheet: Worksheet | undefined, expected: readonly string[], name: string, errors: string[]): sheet is Worksheet {
  if (!sheet) { errors.push("'" + name + "' 시트가 없습니다. 다운로드한 양식을 사용해 주세요."); return false; }
  if (expected.some((header, index) => cellText(sheet.getRow(1).getCell(index + 1)) !== header)) {
    errors.push("'" + name + "' 시트의 열 제목이 양식과 다릅니다.");
    return false;
  }
  return true;
}

export async function createEventExcelTemplate(year: number, grades: readonly number[]): Promise<Uint8Array> {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  book.creator = "EduPlan";
  const guide = book.addWorksheet("작성 안내");
  const event = book.addWorksheet(EVENT_SHEET);
  const periods = book.addWorksheet(PERIOD_SHEET);
  guide.addRows([
    ["EduPlan 행사 일괄 등록 양식", String(year) + "학년도"],
    ["작성 순서", "① 행사 목록에 한 행사당 한 줄 작성 → ② 교시 편성에 행사번호로 연결 → ③ EduPlan에 업로드"],
    ["행사번호", "한 파일 안에서 중복되지 않는 임의 번호입니다. E001, E002 등. 교시 편성의 행사번호와 일치시켜 주세요."],
    ["날짜", "YYYY-MM-DD 형식. " + year + "-03-01부터 " + (year + 1) + "-02 말일까지 작성"],
    ["대상학년", "비우면 전체 학년(" + grades.join(",") + ")에 적용. 일부 학년만이면 1,2처럼 쉼표 구분"],
    ["대상학급", "비우면 선택한 학년 전체. 특정 학급만 대상으로 할 때 1-1,2-2처럼 입력"],
    ["교시 편성", "행사번호, 날짜, 시작교시, 종료교시, 영역, 적용학년을 입력. 한 행사에 여러 행을 추가할 수 있습니다."],
    ["적용학년", "교시 편성에서 비우면 그 행사는 대상 학년 모두에 적용. 일부 학년만 편성할 때 기입"],
    ["영역", areas.filter((area) => area !== "없음").join(", ")],
    ["교시 미입력", "행사만 등록되고 교시는 기존 시간표 그대로 유지됩니다."],
    ["주의", "업로드는 기존 행사 삭제/수정 없이 새 행사를 추가합니다. 업로드 전 오류·중복을 확인합니다."],
    ["작성 예시 (설명용이며 실제 업로드되지 않음)", ""],
    ["행사 목록 예시", "E001 | 입학식 | 교무부 | " + year + "-03-02 | " + year + "-03-02 | (비움: 전체학년)"],
    ["교시 편성 예시", "E001 | " + year + "-03-02 | 5 | 5 | 자율·자치 | (비움: 전체학년)"],
  ]);
  guide.getColumn(1).width = 39; guide.getColumn(2).width = 107;
  guide.getRow(1).font = { bold: true, size: 16, color: { argb: "FF1D4F91" } };
  guide.getColumn(2).alignment = { wrapText: true, vertical: "middle" };
  for (let i = 2; i <= 14; i++) guide.getRow(i).height = 31;
  function setup(sheet: Worksheet, headers: readonly string[], widths: number[]) {
    sheet.addRow([...headers]);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: String.fromCharCode(64 + headers.length) + "1" };
    headers.forEach((_, i) => { sheet.getColumn(i + 1).width = widths[i]; });
    const head = sheet.getRow(1);
    head.height = 28; head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.alignment = { vertical: "middle", horizontal: "center" };
    head.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245EC7" } }; });
    sheet.getColumn(1).numFmt = "@";
  }
  setup(event, EVENT_HEADERS, [15, 34, 22, 17, 17, 20, 22, 42]);
  setup(periods, PERIOD_HEADERS, [15, 17, 14, 14, 21, 20]);
  for (const col of [4, 5]) event.getColumn(col).numFmt = "@";
  periods.getColumn(2).numFmt = "@";
  // Dropdowns keep terminology aligned with the existing calendar editor.
  periods.dataValidations.add("E2:E501", {
    type: "list", allowBlank: true, formulae: ['"' + areas.filter((area) => area !== "없음").join(",") + '"'],
    showErrorMessage: true, errorTitle: "영역 선택", error: "목록의 교육활동 영역을 선택해 주세요.",
  });
  const bytes = await book.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

export async function parseEventExcel(
  buffer: Uint8Array,
  context: Context,
  filename: string,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<ExcelEventPreview> {
  const output: ExcelEventPreview = { events: [], errors: [], warnings: [], periodRows: 0, filename };
  if (buffer.byteLength > EVENT_EXCEL_MAX_BYTES) {
    output.errors.push("파일은 2MB 이하여야 합니다."); return output;
  }
  let workbook: Workbook;
  try {
    const { Workbook } = await import("exceljs");
    workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as Buffer);
  } catch {
    output.errors.push("엑셀 파일을 읽을 수 없습니다. 다운로드한 .xlsx 양식을 사용해 주세요.");
    return output;
  }
  const sheet = workbook.getWorksheet(EVENT_SHEET), periodSheet = workbook.getWorksheet(PERIOD_SHEET);
  if (!checkHeaders(sheet, EVENT_HEADERS, EVENT_SHEET, output.errors) ||
      !checkHeaders(periodSheet, PERIOD_HEADERS, PERIOD_SHEET, output.errors)) return output;
  const year = context.year?.year;
  if (!year) { output.errors.push("학년도가 설정되지 않았습니다."); return output; }
  const min = year + "-03-01", max = (year + 1) + "-03-01";
  const byKey = new Map<string, ExcelEventDraft>();
  if (sheet.rowCount > 501 || periodSheet.rowCount > 1501) {
    output.errors.push("한 번에 행사 100건, 교시 편성 800행 이하만 업로드할 수 있습니다."); return output;
  }
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
    if (!nonemptyRow(sheet, rowIndex, 8)) continue;
    const row = sheet.getRow(rowIndex);
    const [key, title, department] = [1, 2, 3].map((col) => cellText(row.getCell(col)));
    const start_date = dateText(row.getCell(4)), end_date = dateText(row.getCell(5));
    const grades = parseGrades(cellText(row.getCell(6)), context.grades);
    const classes = grades && parseClasses(cellText(row.getCell(7)), grades, context);
    const description = cellText(row.getCell(8));
    const prefix = EVENT_SHEET + " " + rowIndex + "행: ";
    if (!key || key.length > 30 || !/^[A-Za-z0-9가-힣_-]+$/.test(key) || byKey.has(key)) {
      output.errors.push(prefix + "행사번호가 없거나 중복되었거나 사용할 수 없는 형식입니다."); continue;
    }
    if (!title || title.length > 120 || !department || department.length > 60 || description.length > 2000) {
      output.errors.push(prefix + "행사명·담당부서는 필수이며 글자 수 제한을 확인해 주세요."); continue;
    }
    if (!validDate(start_date) || !validDate(end_date) || start_date < min || end_date >= max || start_date > end_date) {
      output.errors.push(prefix + "시작일/종료일은 해당 학년도 내 YYYY-MM-DD 형식이어야 합니다."); continue;
    }
    if (!grades || !grades.length || !classes) {
      output.errors.push(prefix + "대상 학년·학급이 학교 설정과 다릅니다."); continue;
    }
    if (context.events.some((event) => event.title.trim() === title && event.start_date === start_date && event.end_date === end_date)) {
      output.errors.push(prefix + "동일한 제목과 기간의 행사가 이미 등록되어 있습니다."); continue;
    }
    if (output.events.some((event) => event.title === title && event.start_date === start_date && event.end_date === end_date)) {
      output.errors.push(prefix + "동일한 제목과 기간의 행사가 파일에 중복되었습니다."); continue;
    }
    const normalized = { id: makeId(), key, title, department, start_date, end_date,
      target_grades: grades, target_class_ids: classes, description, slots: {} };
    output.events.push(normalized);
    byKey.set(key, normalized);
    if (context.events.some((event) =>
      event.start_date <= end_date && event.end_date >= start_date &&
      event.target_grades.some((grade) => grades.includes(grade)))) {
      output.warnings.push(prefix + "같은 날짜·학년의 기존 행사와 겹칩니다. 교시 중복을 확인해 주세요.");
    }
    if (output.events.length > 100) { output.errors.push("한 번에 100개 행사까지 등록할 수 있습니다."); break; }
  }
  for (let rowIndex = 2; rowIndex <= periodSheet.rowCount; rowIndex++) {
    if (!nonemptyRow(periodSheet, rowIndex, 6)) continue;
    output.periodRows++;
    const row = periodSheet.getRow(rowIndex);
    const key = cellText(row.getCell(1));
    const event = byKey.get(key);
    const date = dateText(row.getCell(2));
    const start = periodNumber(cellText(row.getCell(3))), end = periodNumber(cellText(row.getCell(4)));
    const area = cellText(row.getCell(5));
    const grades = event ? parseGrades(cellText(row.getCell(6)), event.target_grades) : null;
    const prefix = PERIOD_SHEET + " " + rowIndex + "행: ";
    if (!event) { output.errors.push(prefix + "행사번호에 연결되는 행사가 없습니다."); continue; }
    if (!validDate(date) || date < event.start_date || date > event.end_date) {
      output.errors.push(prefix + "교시 편성 날짜가 행사 기간을 벗어났습니다."); continue;
    }
    if (!start || !end || start > end || !areas.some((option) => option === area && option !== "없음")) {
      output.errors.push(prefix + "1~12교시 범위와 교육활동 영역을 확인해 주세요."); continue;
    }
    if (!grades || !grades.length) { output.errors.push(prefix + "적용 학년이 행사 대상에 포함되지 않습니다."); continue; }
    let collision = false;
    for (const grade of grades) {
      const slots = event.slots["g:" + grade]?.[date] ?? {};
      for (let period = start; period <= end; period++) {
        if (slots[period]) collision = true;
      }
    }
    if (collision) { output.errors.push(prefix + "같은 행사·날짜·학년·교시에 중복 배정이 있습니다."); continue; }
    for (const grade of grades) {
      const scope = "g:" + grade;
      event.slots[scope] ??= {};
      event.slots[scope][date] ??= {};
      for (let period = start; period <= end; period++) event.slots[scope][date][period] = area as EventDraft["slots"][string][string][number];
    }
    if (output.periodRows > 800) { output.errors.push("교시 편성은 최대 800행까지 가져올 수 있습니다."); break; }
  }
  if (!output.events.length) output.errors.push("행사 목록 시트에 등록할 행사가 없습니다.");
  return output;
}

export function eventImportChanges(
  events: readonly ExcelEventDraft[], context: Context, plan: AnnualPlan,
): CalendarChange[] {
  if (!context.year || events.length > 100) throw Error("학년도 또는 행사 개수를 확인해 주세요.");
  const changes = events.map((item) => {
    const event: CalendarEvent = {
      id: item.id, workspace_id: context.workspace.id, academic_year_id: context.year!.id,
      school_id: null, title: item.title, start_date: item.start_date, end_date: item.end_date,
      target_grades: item.target_grades, target_class_ids: item.target_class_ids,
      department: item.department, description: item.description, activity_area: "없음",
      event_type: "school", version: 0, created_by: context.userId, updated_at: "",
    };
    return eventChange({ event, slots: item.slots }, context, plan);
  });
  const count = changes.reduce((sum, change) => sum + (change.kind === "event" ? change.allocations.length : 0), 0);
  if (count + plan.allocations.length > 1500) throw Error("교시 배정이 연간 편성 최대 1,500행을 초과합니다. 파일을 나누거나 교시를 줄여 주세요.");
  return changes;
}
export { XLSX_MIME };
