import type { SchoolType } from "./domain";
export const curriculumSource = "국가교육위원회 고시 제2026-1호 별책1 총론";
export function curriculumDraft(type: SchoolType, vocational = false) {
  const rows: { name: string; values: number[] }[] = [];
  const split = (total: number, n: number) =>
    Array.from(
      { length: n },
      (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0),
    );
  const add = (name: string, total: number, offset = 0, n = 6) => {
    let row = rows.find((r) => r.name === name);
    if (!row) {
      row = { name, values: Array(type === "초등학교" ? 12 : 6).fill(0) };
      rows.push(row);
    }
    split(total, n).forEach((v, i) => (row!.values[offset + i] = v));
  };
  if (type === "초등학교") {
    [
      ["국어", 482],
      ["수학", 256],
      ["바른 생활", 144],
      ["슬기로운 생활", 224],
      ["건강한 생활", 144],
      ["즐거운 생활", 256],
      ["창의적 체험활동", 238],
    ].forEach(([n, v]) => add(String(n), Number(v), 0, 4));
    [
      "국어",
      "사회/도덕",
      "수학",
      "과학/실과",
      "체육",
      "예술(음악/미술)",
      "영어",
      "창의적 체험활동",
    ].forEach((name, i) => {
      add(name, [408, 272, 272, 204, 204, 272, 136, 204][i], 4, 4);
      add(name, [408, 272, 272, 340, 204, 272, 204, 204][i], 8, 4);
    });
  } else if (type === "중학교") {
    [
      "국어",
      "사회(역사 포함)/도덕",
      "수학",
      "과학/기술·가정/정보",
      "체육",
      "예술(음악/미술)",
      "영어",
      "선택",
      "창의적 체험활동",
    ].forEach((n, i) =>
      add(n, [442, 510, 374, 680, 272, 272, 340, 170, 306][i]),
    );
  } else {
    const entries: (string | number)[][] = vocational
      ? [
          ["국어·수학·영어", 24],
          ["한국사", 6],
          ["사회·과학", 12],
          ["체육", 8],
          ["예술", 6],
          ["기술·가정/정보/제2외국어/한문/교양", 8],
          ["전문 교과", 80],
          ["자율 이수 (배분 전)", 30],
          ["창의적 체험활동", 18],
        ]
      : [
          ["국어", 8],
          ["수학", 8],
          ["영어", 8],
          ["한국사", 6],
          ["사회", 8],
          ["과학", 10],
          ["체육", 10],
          ["예술", 10],
          ["기술·가정/정보/제2외국어/한문/교양", 16],
          ["자율 이수 (배분 전)", 90],
          ["창의적 체험활동", 18],
        ];
    entries.forEach(([n, v]) => add(String(n), Number(v)));
  }
  return {
    rows,
    unit: type === "고등학교" ? "학점" : "시수",
    minCohort: type === "초등학교" ? 2028 : 2025,
    page:
      type === "초등학교"
        ? "17~19"
        : type === "중학교"
          ? "20~22"
          : vocational
            ? "25"
            : "24",
    total: rows.reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0),
  };
}
