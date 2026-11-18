/**
 * Stable middle-school curriculum group order, matching the national subject-group
 * sequence used by the school's three-year and operating-year workbooks.
 * Only presentation order changes; group IDs and curriculum records are untouched.
 */
const groupLabel = (name: string) => name.replace(/[\s·⋅\/()（）,]/g, "");
export const MIDDLE_GROUP_LABELS = [
  "국어",
  "사회(역사 포함)/도덕",
  "수학",
  "과학/기술·가정/정보",
  "체육",
  "예술(음악/미술)",
  "영어",
  "선택",
  "학교자율시간",
  "창의적 체험활동",
  "자유학기 활동",
] as const;
export function curriculumGroupRank(name: string): number {
  const n = groupLabel(name);
  // More specific school curriculum categories before general subject keywords.
  if (/학교자율시간/.test(n)) return 8;
  // The legacy generic "교과" category belongs before creative activities.
  if (/^(교과|교과군)$/.test(n)) return 7.5;
  if (/자유학기/.test(n)) return 10;
  if (/창의적체험|창체|동아리|스포츠클럽|자율자치|진로활동|봉사활동/.test(n)) return 9;
  if (/국어/.test(n)) return 0;
  if (/사회|역사|도덕/.test(n)) return 1;
  if (/수학/.test(n)) return 2;
  if (/과학|기술가정|정보/.test(n)) return 3;
  if (/체육/.test(n)) return 4;
  if (/예술|음악|미술/.test(n)) return 5;
  if (/영어/.test(n)) return 6;
  if (/선택/.test(n)) return 7;
  return 11; // Custom groups remain supported, always after standard groups.
}
function groupDetailRank(name: string, rank: number): number {
  const n = groupLabel(name);
  if (rank === 1) return n.startsWith("사회") ? 0 : n.startsWith("역사") ? 1 : n.startsWith("도덕") ? 2 : 3;
  if (rank === 3) return n.startsWith("과학") ? 0 : n.startsWith("기술가정") ? 1 : n.startsWith("정보") ? 2 : 3;
  if (rank === 5) return n.startsWith("예술") ? 0 : n.startsWith("음악") ? 1 : n.startsWith("미술") ? 2 : 3;
  return 0;
}
export function orderedCurriculumGroups<T extends {id:string;name:string}>(groups: readonly T[]): T[] {
  return [...groups].sort((a,b) => {
    const aRank=curriculumGroupRank(a.name),bRank=curriculumGroupRank(b.name);
    return aRank-bRank || groupDetailRank(a.name,aRank)-groupDetailRank(b.name,bRank)
      || a.name.localeCompare(b.name,"ko") || a.id.localeCompare(b.id);
  });
}
/** Sort groups, not subjects: subjects retain their original order within each group. */
export function orderedCurriculumSubjects<T extends {id:string;group_id:string}>(
  subjects: readonly T[],groups:readonly {id:string;name:string}[]):T[]{
  const groupPositions=new Map(orderedCurriculumGroups(groups).map((group,index)=>[group.id,index]));
  const fallback=groups.length+1;
  return [...subjects].sort((a,b) =>
    (groupPositions.get(a.group_id)??fallback)-(groupPositions.get(b.group_id)??fallback)
    || a.group_id.localeCompare(b.group_id));
}
