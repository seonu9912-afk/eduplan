import {z} from "zod";

export const nationalSubjects=["국어","도덕","사회","역사","수학","과학","기술·가정","영어","체육","음악","미술","생활 외국어","환경","진로와 직업","정보","한문"] as const;
export const nationalLanguages=["생활 독일어","생활 프랑스어","생활 스페인어","생활 중국어","생활 일본어","생활 러시아어","생활 아랍어","생활 베트남어"];
export const normalized=(s:string)=>s.normalize("NFC").replace(/[\s·･⋅]/g,"");
export function referenceSubject(s:string):string {
  if(nationalLanguages.some(v=>normalized(v)===normalized(s)))return "생활 외국어";
  return nationalSubjects.find(v=>normalized(v)===normalized(s))??"";
}
export function defaultCurriculum(school:string,year:number|undefined,grade:number){
  if(!year)return "2022 개정";
  const local=school==="고등학교"&&grade>9?grade-9:school==="중학교"&&grade>6?grade-6:grade;
  const first=school==="초등학교"?2024+Math.floor((Math.max(1,local)-1)/2):2024+Math.max(1,local);
  return year>=first?"2022 개정":"2015 개정";
}
const pages=z.array(z.number().int().positive());
const description=z.object({description:z.string(),display_description:z.string().optional(),pdf_pages:pages});
const group=description.extend({levels:z.array(z.string())});
const standard=z.object({code:z.string(),source_code:z.string().optional(),linked_code:z.string().nullable().optional(),official_standard_comparison:z.string().optional(),standard_text:z.string(),area:z.string(),language:z.string().nullable().optional(),pdf_pages:pages,groups:z.array(group)});
const area=z.object({area:z.string(),source_area:z.string().optional(),language:z.string().nullable().optional(),levels:z.array(description.extend({level:z.string(),category:z.string().nullable().optional()}))});
export const levelSourceSchema=z.object({source:z.object({title:z.string(),subject:z.string(),sha256:z.string(),grade_band:z.string(),pdf_page_offset:z.number(),validation_issues:z.array(z.string()).optional(),validation_notes:z.array(z.string()).optional()}),standards:z.array(standard),areas:z.array(area)});
export type LevelSource=z.infer<typeof levelSourceSchema>;
export type LevelStandard=LevelSource["standards"][number];
export type OfficialStandard={id:string;area:string;code:string;content:string;subject:string;grade_band:string;notice:string;annex:number;printed_page:number;curriculum_version:string;school_type:string};
export type NationalReference={official:OfficialStandard[];source:LevelSource|null};
export type SelectedStandard={id:string;code:string;content:string;curriculum_version:string;subject?:string;school_type?:string};
export const hasPrivateGlyph=(s:string)=>/[\uE000-\uF8FF\uFFFD]/.test(s);
export function matchesReference(s:SelectedStandard,r:LevelStandard,source:LevelSource){
  const subject=r.language??source.source.subject;
  return s.curriculum_version==="2022 개정"&&(!s.school_type||s.school_type==="중학교")&&!!s.subject&&normalized(s.subject)===normalized(subject)&&normalized(s.code)===normalized(r.source_code??r.code)&&normalized(s.content)===normalized(r.standard_text)&&!hasPrivateGlyph(s.content);
}
