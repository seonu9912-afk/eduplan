import { ANNUAL_2026_ROWS } from "../../lib/annual-curriculum-2026";
import { curriculumDraft } from "../../lib/curriculum-draft";
import { evaluateCell, initializeDesign, weekRule, type CurriculumDocument } from "../../lib/curriculum-design";
import type { SchoolType } from "../../lib/domain";
import type { Context } from "../../lib/models";
import { recoveryPreviewContext } from "./fixture";

type ExampleRow = { group: string; name: string; values: number[] };
export type PreviewSaved = { document: CurriculumDocument; planVersion: number; documentVersion: number };
const legacyId = (n: number) => `d1500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const legacyCreativeId = legacyId(34);

// Stable IDs keep browser edits associated with the same subject if rows move.
function exampleId(key: string) {
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `d15a0000-0000-4000-8000-${(hash >>> 0).toString(16).padStart(12, "0")}`;
}

function middleRows(): ExampleRow[] {
  // Use the repository's school sheet, not a single subject representing all
  // teaching. Read only regular-term cells; preserve the original source and
  // its independently printed totals/free-semester adjustments unchanged.
  const groups: Record<string, string> = {
    "사회/역사/도덕": "사회(역사 포함)/도덕",
    "과학/기술·가정/정보": "과학/기술·가정/정보",
    "예술(음악·미술)": "예술(음악/미술)",
  };
  return ANNUAL_2026_ROWS.filter(row => row.kind === "subject" &&
    (row.section === "subject" || row.section === "creative")).map(row => {
    const group = row.group.replace(/\s/g, "");
    return {
      group: row.section === "creative" ? "창의적 체험활동" : groups[group] ?? group,
      name: row.subject || row.group,
      values: [9, 11, 19, 21, 23, 25].map(column => Number(row.cells[column] || 0)),
    };
  });
}

function elementaryRows(): ExampleRow[] {
  const subjects: Record<string, string[]> = {
    "사회/도덕": ["사회", "도덕"], "과학/실과": ["과학", "실과"],
    "예술(음악/미술)": ["음악", "미술"],
    "창의적 체험활동": ["자율·자치 활동", "동아리 활동", "진로 활동"],
  };
  return curriculumDraft("초등학교").rows.flatMap(row => {
    const names = subjects[row.name] ?? [row.name];
    return names.map((name, index) => ({ group: row.name, name,
      // Example allocations only: split group totals without losing hours;
      // practical arts starts in grade five, not grades three/four.
      values: row.values.map((value, term) => row.name === "과학/실과" && term < 8
        ? index === 0 ? value : 0
        : Math.floor(value / names.length) + (index < value % names.length ? 1 : 0)),
    }));
  });
}

function highRows(): ExampleRow[] {
  const rows: [string, string, number[]][] = [
    ["국어", "국어", [4, 4, 0, 0, 0, 0]],
    ["국어", "문학", [0, 0, 4, 0, 0, 0]],
    ["국어", "독서와 작문", [0, 0, 0, 4, 0, 0]],
    ["수학", "수학", [4, 4, 0, 0, 0, 0]],
    ["수학", "대수", [0, 0, 4, 0, 0, 0]],
    ["수학", "확률과 통계", [0, 0, 0, 4, 0, 0]],
    ["영어", "영어", [4, 4, 0, 0, 0, 0]],
    ["영어", "영어Ⅰ", [0, 0, 4, 0, 0, 0]],
    ["영어", "영어Ⅱ", [0, 0, 0, 4, 0, 0]],
    ["한국사", "한국사", [3, 3, 0, 0, 0, 0]],
    ["사회", "통합사회", [4, 4, 0, 0, 0, 0]],
    ["사회", "사회와 문화", [0, 0, 0, 0, 4, 0]],
    ["과학", "통합과학", [4, 4, 0, 0, 0, 0]],
    ["과학", "물리학", [0, 0, 0, 0, 4, 0]],
    ["과학", "화학", [0, 0, 0, 0, 0, 4]],
    ["체육", "체육", [2, 2, 2, 2, 1, 1]],
    ["예술(음악/미술)", "음악", [2, 0, 2, 0, 1, 0]],
    ["예술(음악/미술)", "미술", [0, 2, 0, 2, 0, 1]],
    ["기술·가정/정보/제2외국어/한문/교양", "정보", [0, 0, 2, 2, 0, 0]],
    ["기술·가정/정보/제2외국어/한문/교양", "진로와 직업", [0, 0, 0, 0, 2, 2]],
    ["창의적 체험활동", "자율·자치 활동", [1, 1, 1, 1, 1, 1]],
    ["창의적 체험활동", "동아리 활동", [1, 1, 1, 1, 1, 1]],
    ["창의적 체험활동", "진로 활동", [1, 1, 1, 1, 1, 1]],
  ];
  return rows.map(([group, name, values]) => ({ group, name, values }));
}

/** A full, synthetic editing example. Does not create school catalog records. */
export function curriculumPreviewContext(school: SchoolType): Context {
  const c = recoveryPreviewContext();
  c.role = "editor";
  c.schoolType = school;
  c.workspace = { ...c.workspace, school_type: school, name: "교육과정 실습용 가상 " + school };
  c.grades = school === "초등학교" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3];
  c.plans = [{ ...c.plans[0], unit: school === "고등학교" ? "credits" : "hours" }];
  const rows = school === "중학교" ? middleRows() : school === "초등학교" ? elementaryRows() : highRows();
  const scope = { workspace_id: c.workspace.id, school_id: null };
  c.groups = [...new Set(rows.map(row => row.group))].map(name => ({
    ...scope, id: exampleId(school + ":group:" + name), name,
  }));
  c.subjects = rows.map(row => ({ ...scope,
    id: row.name === "국어" ? legacyId(33) : exampleId(school + ":subject:" + row.group + ":" + row.name),
    group_id: c.groups.find(group => group.name === row.group)!.id, name: row.name,
  }));
  c.hours = rows.flatMap((row, index) => row.values.map((hours, term) => ({ ...scope,
    plan_id: c.plans[0].id, subject_id: c.subjects[index].id,
    grade: Math.floor(term / 2) + 1, semester: term % 2 + 1, hours,
  })));
  // Keep the original aggregate creative row available for an older browser's
  // saved inputs. New examples hide it instead of double-counting activities.
  c.subjects.push({ ...scope, id: legacyCreativeId, name: "창의적 체험활동(기존 입력)",
    group_id: c.groups.find(group => group.name === "창의적 체험활동")!.id });
  return c;
}

export function readCurriculumPreview(c: Context, raw: string | null): PreviewSaved {
  const saved: PreviewSaved | null = raw ? JSON.parse(raw) : null;
  const document = initializeDesign(c, c.plans[0], saved?.document);
  const storedCells = new Set(saved?.document.cells.map(cell => [cell.subjectId, cell.grade, cell.semester].join(":")));
  if (c.plans[0].unit === "hours") document.cells = document.cells.map(cell => {
    if (storedCells.has([cell.subjectId, cell.grade, cell.semester].join(":"))) return cell;
    // Imported annual activity totals need not be a whole number of weekly
    // lessons. Keep their remainder as an explicit adjustment, so changing a
    // sample term to 17 weeks still yields whole lessons. Never rewrite edits.
    const total = evaluateCell(document, cell).total;
    const weeks = weekRule(document, cell.grade, cell.semester).count;
    const weekly = Math.floor(total / weeks);
    return { ...cell, weekly, manual: total - weekly * weeks };
  });
  if (!saved) document.excludedSubjectIds = [legacyCreativeId];
  return { document, planVersion: saved?.planVersion ?? 1, documentVersion: saved?.documentVersion ?? 0 };
}
