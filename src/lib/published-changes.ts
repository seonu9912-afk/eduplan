import type { Context } from "./models";
import { addDays } from "./domain";
import { publicationAt, publishedSchoolContext, type SchoolPlanPublication } from "./school-publications";
import { schoolScheduleEntries } from "./school-schedule";
import { myTeacherIds } from "./school-operations";
import { timetableDocumentSchema, type TimetableDocument } from "./timetable-bridge";

export type ChangeRow = { title: string; before?: string; after?: string; related?: boolean };
export type PublishedChange = { id: string; domain: "calendar" | "plans" | "timetable"; startsOn: string; publishedAt?: string; rows: ChangeRow[]; related: boolean };
type Snapshot = Map<string, { title: string; value: string; fingerprint?: string; teacherId?: string }>;

export function compareSnapshots(before: Snapshot, after: Snapshot, mine = new Set<string>()): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key), b = after.get(key);
    if (a && b && a.value === b.value && a.title === b.title && a.fingerprint === b.fingerprint) continue;
    if (!a && !b) continue;
    rows.push({ title: b?.title ?? a!.title, before: a ? [a.title !== b?.title && b ? a.title : "", a.value].filter(Boolean).join(" · ") : undefined,
      after: b?.value, related: !!((a?.teacherId && mine.has(a.teacherId)) || (b?.teacherId && mine.has(b.teacherId))) });
  }
  return rows.sort((a,b) => Number(!!b.related) - Number(!!a.related));
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+":"+stable(v)).join(",") + "}";
  return JSON.stringify(value) ?? "";
}
function scheduleSnapshot(c: Context, release: SchoolPlanPublication, start: string, end: string): Snapshot {
  const context = publishedSchoolContext({ ...c, schoolPublications: [release] }, start);
  const entries = schoolScheduleEntries(context, start, end, release.domain === "plans").filter(e => release.domain === "plans" ? e.tone === "work" : e.tone !== "work");
  return new Map(entries.map(e => {
    const value = [e.date === e.end ? e.date : e.date + " ~ " + e.end, e.time, e.department, e.location, e.participants, e.targetGrades?.map(g=>g+"학년").join(", "), e.resources && Array.isArray(e.resources) && e.resources.length ? "관련 자료 " + e.resources.length + "개" : ""].filter(Boolean).join(" · ");
    return [e.tone + ":" + e.id, { title: e.title, value, fingerprint: stable(e.resources ?? []) }];
  }));
}
const weekdays = ["", "월", "화", "수", "목", "금"];
function timetableSnapshot(doc: TimetableDocument, startsOn: string): Snapshot {
  const entries: Snapshot = new Map();
  const scopeName = (scope: string, id: string) => (scope === "class" ? doc.classes.find(c=>c.id===id)?.label : doc.groups.find(g=>g.id===id)?.label) ?? "학급·그룹";
  const teacherName = (id: string) => doc.teachers.find(t=>t.id===id)?.label ?? "";
  const subjectName = (id: string) => doc.subjects.find(s=>s.id===id)?.label ?? "수업";
  for (const row of doc.weekly) {
    entries.set("weekly:"+row.scope+":"+row.scopeId+":"+row.weekday+":"+row.period, {
      title: scopeName(row.scope,row.scopeId) + " " + weekdays[row.weekday] + "요일 " + row.period + "교시",
      value: [subjectName(row.subjectId),teacherName(row.teacherId),doc.roomLabels?.[row.room] ?? ""].filter(Boolean).join(" · "), teacherId: row.teacherId,
      fingerprint: stable([row.subjectId,row.teacherId,row.room])
    });
  }
  for (const row of doc.overrides.filter(r=>r.date>=startsOn)) {
    const teacherId = typeof row.teacherId === "string" ? row.teacherId : "";
    entries.set("override:"+row.date+":"+row.scope+":"+row.scopeId+":"+row.period,{
      title: row.date+" "+scopeName(row.scope,row.scopeId)+" "+row.period+"교시 (변경 수업)",
      value: row.action === "cancel" ? "수업 취소" : ["수업 변경",subjectName(String(row.subjectId ?? "")),teacherName(teacherId),doc.roomLabels?.[String(row.room ?? "")] ?? ""].filter(Boolean).join(" · "),
      teacherId, fingerprint: stable([row.action,row.subjectId,row.teacherId,row.room])
    });
  }
  return entries;
}
export function publishedChanges(c: Context): PublishedChange[] {
  if (!c.year) return [];
  const start = c.year.year+"-03-01", end = addDays((c.year.year+1)+"-03-01",-1);
  const out: PublishedChange[] = [];
  for (const domain of ["calendar","plans"] as const) {
    const releases = (c.schoolPublications ?? []).filter(p=>p.domain===domain).sort((a,b)=>a.published_at.localeCompare(b.published_at)||a.source_version-b.source_version);
    for (let i=Math.max(1,releases.length-10); i<releases.length; i++) {
      const current=releases[i];
      const previous=publicationAt(releases.slice(0,i),domain,current.starts_on);
      if (!previous) continue;
      const from=current.starts_on<start?start:current.starts_on;
      if (from>end) continue;
      try {
        const rows=compareSnapshots(scheduleSnapshot(c,previous,from,end),scheduleSnapshot(c,current,from,end));
        if(rows.length) out.push({id:current.id,domain,startsOn:current.starts_on,publishedAt:current.published_at,rows,related:false});
      } catch { /* malformed legacy publication is not a reliable comparison */ }
    }
  }
  const versions=[...(c.operations?.effectiveTimetables ?? [])].sort((a,b)=>a.starts_on.localeCompare(b.starts_on));
  const mine=myTeacherIds(c);
  for(let i=Math.max(1,versions.length-10);i<versions.length;i++){
    const current=versions[i], previous=versions[i-1];
    const a=timetableDocumentSchema.safeParse(previous.document), b=timetableDocumentSchema.safeParse(current.document);
    if(!a.success||!b.success) continue;
    const rows=compareSnapshots(timetableSnapshot(a.data,current.starts_on),timetableSnapshot(b.data,current.starts_on),mine);
    if(rows.length) out.push({id:current.id,domain:"timetable",startsOn:current.starts_on,publishedAt:current.published_at ?? (c.operations?.publication?.id===current.id?c.operations.publication.published_at:undefined),rows,related:rows.some(r=>r.related)});
  }
  return out.sort((a,b)=>Number(b.related)-Number(a.related)||(b.publishedAt??b.startsOn).localeCompare(a.publishedAt??a.startsOn));
}
