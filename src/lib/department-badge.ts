const palette = ["blue", "amber", "rose", "purple", "green", "slate", "teal", "indigo"] as const;
type DepartmentColor = typeof palette[number];

export function departmentBadgeInfo(department?: string) {
  const name = department?.trim() || "학교";
  const rules: { pattern: RegExp; color: DepartmentColor; short: string }[] = [
    { pattern: /^교무(지원)?부?$/, color: "blue", short: "교무" },
    { pattern: /^교육과정(지원)?부?$/, color: "amber", short: "과정" },
    { pattern: /^학생(활동|생활)?(지원)?부?$/, color: "rose", short: "학생" },
    { pattern: /^기숙사(지원)?부?$/, color: "purple", short: "기숙사" },
    { pattern: /^방과후(학교)?(지원)?부?$/, color: "green", short: "방과후" },
    { pattern: /^행정(지원)?(실|부)?$/, color: "slate", short: "행정" },
    { pattern: /^(학교|공통|공통 업무|전교직원)$/, color: "slate", short: name },
  ];
  const match = rules.find((rule) => rule.pattern.test(name));
  if (match) return { name, short: match.short, color: match.color };
  let hash = 0;
  for (const character of name) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return { name, short: name, color: palette[hash % palette.length] };
}

/** A closure always takes precedence; all other entries follow their department. */
export function scheduleDepartmentColor(department?: string, tone?: string) {
  return tone === "break" ? "closure" : departmentBadgeInfo(department).color;
}
