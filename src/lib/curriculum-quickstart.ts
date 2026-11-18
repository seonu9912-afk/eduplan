import {MIDDLE_2022_GROUPS,matchGroup} from "./curriculum-design";

/** Empty pasted lines are ignored; duplicate names stay visible for validation. */
export function parseSubjectLines(raw:string):string[]{
  return raw.replaceAll("\r","").split("\n").map(line=>line.trim()).filter(Boolean);
}
/** Do not add another national group when a school already uses a compatible label. */
export function missingStandardGroups(groups:readonly {name:string}[]):string[]{
  const present=new Set(groups.map(group=>matchGroup(group.name)));
  return MIDDLE_2022_GROUPS.filter(group=>!present.has(group.key))
    .map(group=>group.label);
}
