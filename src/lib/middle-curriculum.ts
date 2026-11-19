/**
 * 중학교 교과군·교과목 기본 목록.
 * 편제의 출처: 교육부 고시 제2015-74호 별책 1, 교육부 고시 제2022-33호 별책 1
 * (2022 개정은 국가교육위원회 고시 제2026-1호의 중학교 총론과 대조).
 * 학교별 편성표의 '기본 시작 목록'이며, 개설 과목/법정 시수 판정이 아닙니다.
 */
export type MiddleCurriculumRevision = "2015" | "2022";

export type SubjectGroupTemplate = Readonly<{
  name: string;
  subjects: readonly string[];
}>;

const sharedGroups: readonly SubjectGroupTemplate[] = [
  { name: "국어", subjects: ["국어"] },
  { name: "사회(역사 포함)/도덕", subjects: ["사회", "역사", "도덕"] },
  { name: "수학", subjects: ["수학"] },
  { name: "과학/기술·가정/정보", subjects: ["과학", "기술·가정", "정보"] },
  { name: "체육", subjects: ["체육"] },
  { name: "예술(음악/미술)", subjects: ["음악", "미술"] },
  { name: "영어", subjects: ["영어"] },
  {
    name: "선택",
    subjects: [
      "한문", "환경", "생활 독일어", "생활 프랑스어", "생활 스페인어",
      "생활 중국어", "생활 일본어", "생활 러시아어", "생활 아랍어",
      "생활 베트남어", "보건", "진로와 직업",
    ],
  },
];

export function middleRevisionForCohort(cohortYear: number): MiddleCurriculumRevision {
  // 2022 개정 중학교 1학년은 2025학년도부터 적용됨.
  return cohortYear >= 2025 ? "2022" : "2015";
}

export function middleSubjectCatalog(
  revision: MiddleCurriculumRevision,
): readonly SubjectGroupTemplate[] {
  return [
    ...sharedGroups,
    {
      name: "창의적 체험활동",
      subjects:
        revision === "2015"
          ? ["자율 활동", "동아리 활동", "봉사 활동", "진로 활동"]
          : ["자율·자치 활동", "동아리 활동", "진로 활동"],
    },
  ];
}
