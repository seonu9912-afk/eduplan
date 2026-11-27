import { z } from "zod";

export const linkCategories = {
  common: "공통 업무", school: "학교 운영", documents: "공동 자료",
  collection: "자료 취합", teaching: "수업 지원", other: "학교 자체 시스템",
} as const;

export const linkIcons = {
  link: "링크", briefcase: "가방", school: "학교", folder: "폴더",
  clipboard: "클립보드", book: "책", globe: "웹사이트",
} as const;

export const externalUrl = z.string().trim().max(2048).refine((value) => {
  if (!/^https?:\/\//i.test(value) || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password &&
      /^https?:\/\/[^/?#@]+/i.test(value) &&
      !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  } catch {
    return false;
  }
}, "http:// 또는 https://로 시작하는 유효한 주소를 입력해 주세요.");

const resourceSchema = z.object({
  name: z.string().trim().min(1, "자료 이름을 입력해 주세요.").max(100),
  url: externalUrl,
});
export const resourceLimit = 5;
export const resourceList = z.array(resourceSchema).max(resourceLimit);
export type ResourceLink = z.infer<typeof resourceSchema>;

export function readableResources(value: unknown): ResourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, resourceLimit).flatMap((entry) => {
    const parsed = resourceSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export const schoolLinkFields = resourceSchema.extend({
  category: z.enum(Object.keys(linkCategories) as [keyof typeof linkCategories, ...(keyof typeof linkCategories)[]]),
  icon: z.enum(Object.keys(linkIcons) as [keyof typeof linkIcons, ...(keyof typeof linkIcons)[]]),
  position: z.number().int().min(0).max(9999),
});

export const neisSchoolCode = z.object({
  neis_office_code: z.string().regex(/^[A-Z][0-9]{2}$/),
  neis_school_code: z.string().regex(/^[0-9]{7}$/),
});

export const weatherGrid = z.object({
  weather_nx: z.number().int().min(1).max(149),
  weather_ny: z.number().int().min(1).max(253),
});
