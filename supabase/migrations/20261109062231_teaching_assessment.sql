-- Add the teaching/assessment module without replacing existing school data.
create table public.achievement_standards (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 curriculum_version text not null check(curriculum_version in ('2022 개정','2015 개정','기타')),
 school_type text not null check(school_type in ('초등학교','중학교','고등학교')),
 subject text not null check(length(trim(subject)) between 1 and 120), grade_band text not null check(length(trim(grade_band)) between 1 and 60),
 code text not null check(length(trim(code)) between 1 and 80), content text not null check(length(trim(content)) between 1 and 5000),
 source text not null default '사용자 직접 등록' check(source='사용자 직접 등록'),
 created_by uuid default auth.uid() references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 unique(id,workspace_id), unique(workspace_id,curriculum_version,school_type,subject,grade_band,code)
);
create index standards_creator on public.achievement_standards(created_by);
create table public.teaching_courses (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 academic_year_id uuid not null, grade smallint not null check(grade between 1 and 6), semester smallint not null check(semester between 0 and 2),
 subject_id uuid, subject_name text not null check(length(trim(subject_name)) between 1 and 120), teacher_name text not null check(length(trim(teacher_name)) between 1 and 80),
 owner_id uuid default auth.uid() references auth.users(id) on delete set null,
 visibility text not null default 'private' check(visibility in ('private','workspace')),
 manual_hours numeric check(manual_hours between 0 and 10000), expected_hours numeric check(expected_hours>=0),
 reference_snapshot jsonb not null, archived boolean not null default false,
 version integer not null default 1 check(version>0), updated_at timestamptz not null default now(),
 foreign key(academic_year_id,workspace_id) references public.academic_years(id,workspace_id) on delete cascade,
 foreign key(subject_id,workspace_id) references public.subjects(id,workspace_id) on delete set null(subject_id),
 unique(id,workspace_id),unique(id,workspace_id,academic_year_id),unique(id,workspace_id,academic_year_id,grade)
);
create index courses_year on public.teaching_courses(academic_year_id,workspace_id);
create index courses_owner on public.teaching_courses(owner_id);
create index courses_subject on public.teaching_courses(subject_id,workspace_id);
alter table public.classes add constraint classes_teaching_scope unique(id,workspace_id,academic_year_id,grade);
create table public.teaching_course_classes (
 course_id uuid not null, workspace_id uuid not null, academic_year_id uuid not null, grade smallint not null, class_id uuid not null,
 primary key(course_id,class_id),
 foreign key(course_id,workspace_id,academic_year_id,grade) references public.teaching_courses(id,workspace_id,academic_year_id,grade) on delete cascade,
 foreign key(class_id,workspace_id,academic_year_id,grade) references public.classes(id,workspace_id,academic_year_id,grade)
);
create index course_classes_class on public.teaching_course_classes(class_id,workspace_id,academic_year_id,grade);
create index course_classes_scope on public.teaching_course_classes(workspace_id,academic_year_id);
create table public.teaching_plans (
 course_id uuid primary key,workspace_id uuid not null,academic_year_id uuid not null,document jsonb not null,
 foreign key(course_id,workspace_id,academic_year_id) references public.teaching_courses(id,workspace_id,academic_year_id) on delete cascade
);
create index teaching_plans_scope on public.teaching_plans(workspace_id,academic_year_id);
create table public.teaching_standard_links (
 course_id uuid not null,workspace_id uuid not null,kind text not null check(kind in ('unit','assessment')),entry_id uuid not null,standard_id uuid not null,
 primary key(course_id,kind,entry_id,standard_id),
 foreign key(course_id,workspace_id) references public.teaching_courses(id,workspace_id) on delete cascade,
 foreign key(standard_id,workspace_id) references public.achievement_standards(id,workspace_id)
);
create index teaching_links_standard on public.teaching_standard_links(standard_id,workspace_id);
create table public.teaching_plan_versions (
 course_id uuid not null,workspace_id uuid not null,version integer not null,document jsonb not null,course_snapshot jsonb not null,
 action text not null,actor_id uuid references auth.users(id) on delete set null,actor_name text not null,created_at timestamptz not null default now(),
 primary key(course_id,version), foreign key(course_id,workspace_id) references public.teaching_courses(id,workspace_id) on delete cascade
);
create index teaching_versions_workspace on public.teaching_plan_versions(workspace_id);
create index teaching_versions_actor on public.teaching_plan_versions(actor_id);

-- Private ownership and workspace membership are both required. A workspace
-- admin can edit shared plans but cannot read another teacher's private plan.
create function private.teaching_access(target_course uuid,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teaching_courses c where c.id=target_course and auth.uid() is not null
 and private.workspace_role(c.workspace_id) is not null
 and case when writing then private.workspace_role(c.workspace_id) in ('admin','editor') and (c.owner_id=auth.uid() or (c.visibility='workspace' and private.workspace_role(c.workspace_id)='admin'))
 else c.owner_id=auth.uid() or c.visibility='workspace' end)
$$;
revoke all on function private.teaching_access(uuid,boolean) from public,anon,authenticated;
grant execute on function private.teaching_access(uuid,boolean) to authenticated;
alter table public.teaching_courses enable row level security;
alter table public.teaching_course_classes enable row level security;
alter table public.teaching_plans enable row level security;
alter table public.teaching_standard_links enable row level security;
alter table public.teaching_plan_versions enable row level security;
alter table public.achievement_standards enable row level security;
create policy courses_read on public.teaching_courses for select to authenticated using(private.teaching_access(id,false));
create policy course_classes_read on public.teaching_course_classes for select to authenticated using(private.teaching_access(course_id,false));
create policy teaching_plans_read on public.teaching_plans for select to authenticated using(private.teaching_access(course_id,false));
create policy teaching_links_read on public.teaching_standard_links for select to authenticated using(private.teaching_access(course_id,false));
create policy teaching_versions_read on public.teaching_plan_versions for select to authenticated using(private.teaching_access(course_id,false));
create policy standards_read on public.achievement_standards for select to authenticated using(private.workspace_role(workspace_id) is not null);
create policy standards_insert on public.achievement_standards for insert to authenticated with check((select auth.uid())=created_by and private.workspace_role(workspace_id) in ('admin','editor'));
revoke all on public.teaching_courses,public.teaching_course_classes,public.teaching_plans,public.teaching_standard_links,public.teaching_plan_versions,public.achievement_standards from public,anon,authenticated;
grant select on public.teaching_courses,public.teaching_course_classes,public.teaching_plans,public.teaching_standard_links,public.teaching_plan_versions,public.achievement_standards to authenticated;
grant insert on public.achievement_standards to authenticated;

create function private.teaching_reference(target uuid,year_id uuid,target_grade integer,target_semester integer,target_subject uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.curriculum_plans; amount numeric; school_year integer; ys integer; av integer; events jsonb; terms jsonb;
begin
 perform private.lock_workspace_grade_count(target);
 select year,version into school_year,ys from public.academic_years where id=year_id and workspace_id=target;
 if school_year is null then raise exception '학년도를 확인해 주세요.' using errcode='42501';end if;
 select * into p from public.curriculum_plans where workspace_id=target and cohort_year=school_year-target_grade+1;
 select sum(hours) into amount from public.curriculum_hours where plan_id=p.id and subject_id=target_subject and grade=target_grade and (target_semester=0 or semester=target_semester);
 select version into av from public.annual_academic_plans where academic_year_id=year_id and workspace_id=target;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version) order by id),'[]') into events from public.events where academic_year_id=year_id and workspace_id=target;
 select coalesce(jsonb_agg(jsonb_build_object('number',number,'start_date',start_date,'end_date',end_date) order by number),'[]') into terms from public.semesters where academic_year_id=year_id and workspace_id=target;
 return jsonb_build_object('curriculum',jsonb_build_object('plan_id',p.id,'version',p.version,'subject_id',target_subject,'amount',amount,'unit',coalesce(p.unit,'hours')),'calendar',jsonb_build_object('year_version',ys,'annual_version',coalesce(av,0),'events',events,'terms',terms));
end $$;
revoke all on function private.teaching_reference(uuid,uuid,integer,integer,uuid) from public,anon,authenticated;

create function private.teaching_as_draft(payload jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_set(jsonb_set(payload,'{lesson_status}','"작성 중"'),'{evaluations}',(select jsonb_agg(jsonb_set(e,'{status}','"작성 중"') order by ord) from jsonb_array_elements(payload->'evaluations') with ordinality as a(e,ord)))
$$;
revoke all on function private.teaching_as_draft(jsonb) from public,anon,authenticated;

create function private.teaching_record_revision(target_course uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.teaching_plan_versions(course_id,workspace_id,version,document,course_snapshot,action,actor_id,actor_name)
 select c.id,c.workspace_id,c.version,p.document,to_jsonb(c)||jsonb_build_object('classes',(select coalesce(jsonb_agg(jsonb_build_object('id',cl.id,'grade',cl.grade,'class_number',cl.class_number) order by cl.class_number),'[]') from public.teaching_course_classes cc join public.classes cl on cl.id=cc.class_id where cc.course_id=c.id)),reason,auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'사용자')
 from public.teaching_courses c join public.teaching_plans p on p.course_id=c.id where c.id=target_course;
 -- Do not reveal private course names through the workspace-wide activity log.
 insert into public.activity_log(workspace_id,actor_id,action,label) select workspace_id,auth.uid(),'save','수업·평가 자료 저장' from public.teaching_courses where id=target_course;
end $$;
revoke all on function private.teaching_record_revision(uuid,text) from public,anon,authenticated;

-- The document validator is appended below from the shared strict schema.

alter table public.teaching_plans add constraint teaching_document_schema check(extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"lesson_status":{"type":"string","enum":["작성 중","검토 중","확정"]},"units":{"maxItems":500,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"period":{"type":"string","maxLength":100},"start":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"end":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"title":{"type":"string","maxLength":200},"content":{"type":"string","maxLength":5000},"standard_ids":{"maxItems":50,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"lessons":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]},"method":{"type":"string","maxLength":1000},"alignment":{"type":"string","maxLength":2000},"note":{"type":"string","maxLength":2000}},"required":["id","period","start","end","title","content","standard_ids","lessons","method","alignment","note"],"additionalProperties":false}},"evaluations":{"minItems":1,"maxItems":2,"type":"array","items":{"type":"object","properties":{"semester":{"type":"integer","minimum":1,"maximum":2},"mode":{"type":"string","enum":["weighted","descriptive"]},"status":{"type":"string","enum":["작성 중","검토 중","확정"]},"notes":{"type":"string","maxLength":5000},"items":{"maxItems":200,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"type":{"type":"string","enum":["정기시험","수행평가","기타"]},"name":{"type":"string","maxLength":200},"element":{"type":"string","maxLength":3000},"standard_ids":{"maxItems":50,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"method":{"type":"string","maxLength":2000},"period":{"type":"string","maxLength":100},"start":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"end":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"count":{"anyOf":[{"type":"integer","minimum":1,"maximum":100},{"type":"null"}]},"ratio":{"anyOf":[{"type":"number","minimum":0,"maximum":100},{"type":"null"}]},"points":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]},"rubric":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"element":{"type":"string","maxLength":200},"points":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]},"levels":{"maxItems":50,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","maxLength":100},"description":{"type":"string","maxLength":3000},"points":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]}},"required":["id","label","description","points"],"additionalProperties":false}},"note":{"type":"string","maxLength":1000}},"required":["id","element","points","levels","note"],"additionalProperties":false}},"notes":{"type":"string","maxLength":3000}},"required":["id","type","name","element","standard_ids","method","period","start","end","count","ratio","points","rubric","notes"],"additionalProperties":false}}},"required":["semester","mode","status","notes","items"],"additionalProperties":false}}},"required":["lesson_status","units","evaluations"],"additionalProperties":false}$schema$::json,document));

create function private.validate_teaching_document(payload jsonb,target uuid,term integer) returns void language plpgsql security definer set search_path='' as $$
begin
if payload is null or octet_length(payload::text)>1500000 or not extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"lesson_status":{"type":"string","enum":["작성 중","검토 중","확정"]},"units":{"maxItems":500,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"period":{"type":"string","maxLength":100},"start":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"end":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"title":{"type":"string","maxLength":200},"content":{"type":"string","maxLength":5000},"standard_ids":{"maxItems":50,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"lessons":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]},"method":{"type":"string","maxLength":1000},"alignment":{"type":"string","maxLength":2000},"note":{"type":"string","maxLength":2000}},"required":["id","period","start","end","title","content","standard_ids","lessons","method","alignment","note"],"additionalProperties":false}},"evaluations":{"minItems":1,"maxItems":2,"type":"array","items":{"type":"object","properties":{"semester":{"type":"integer","minimum":1,"maximum":2},"mode":{"type":"string","enum":["weighted","descriptive"]},"status":{"type":"string","enum":["작성 중","검토 중","확정"]},"notes":{"type":"string","maxLength":5000},"items":{"maxItems":200,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"type":{"type":"string","enum":["정기시험","수행평가","기타"]},"name":{"type":"string","maxLength":200},"element":{"type":"string","maxLength":3000},"standard_ids":{"maxItems":50,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"method":{"type":"string","maxLength":2000},"period":{"type":"string","maxLength":100},"start":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"end":{"anyOf":[{"type":"string","const":""},{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}]},"count":{"anyOf":[{"type":"integer","minimum":1,"maximum":100},{"type":"null"}]},"ratio":{"anyOf":[{"type":"number","minimum":0,"maximum":100},{"type":"null"}]},"points":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]},"rubric":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"element":{"type":"string","maxLength":200},"points":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]},"levels":{"maxItems":50,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","maxLength":100},"description":{"type":"string","maxLength":3000},"points":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]}},"required":["id","label","description","points"],"additionalProperties":false}},"note":{"type":"string","maxLength":1000}},"required":["id","element","points","levels","note"],"additionalProperties":false}},"notes":{"type":"string","maxLength":3000}},"required":["id","type","name","element","standard_ids","method","period","start","end","count","ratio","points","rubric","notes"],"additionalProperties":false}}},"required":["semester","mode","status","notes","items"],"additionalProperties":false}}},"required":["lesson_status","units","evaluations"],"additionalProperties":false}$schema$::json,payload) then raise exception '계획 입력 형식과 크기를 확인해 주세요.';end if;
 if (term=0 and ((select count(distinct (e->>'semester')::integer) from jsonb_array_elements(payload->'evaluations') e)<>2))
 or (term<>0 and (jsonb_array_length(payload->'evaluations')<>1 or (payload->'evaluations'->0->>'semester')::integer<>term)) then raise exception '수업과 평가 학기를 확인해 주세요.';end if;
 if exists(select 1 from jsonb_array_elements(payload->'units') e group by e->>'id' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(payload->'evaluations') ev cross join lateral jsonb_array_elements(ev->'items') e group by e->>'id' having count(*)>1) then raise exception '단원·평가 항목 ID가 중복됩니다.';end if;
 if exists(select 1 from (
 select s.value::uuid id from jsonb_array_elements(payload->'units') u cross join lateral jsonb_array_elements_text(u->'standard_ids') s
 union select s.value::uuid from jsonb_array_elements(payload->'evaluations') ev cross join lateral jsonb_array_elements(ev->'items') a cross join lateral jsonb_array_elements_text(a->'standard_ids') s
 ) linked where not exists(select 1 from public.achievement_standards st where st.id=linked.id and st.workspace_id=target)) then raise exception '다른 작업공간의 성취기준을 연결할 수 없습니다.' using errcode='42501';end if;
end $$;
revoke all on function private.validate_teaching_document(jsonb,uuid,integer) from public,anon,authenticated;
create function private.teaching_replace_links(target_course uuid,target uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.teaching_standard_links where course_id=target_course;
 insert into public.teaching_standard_links(course_id,workspace_id,kind,entry_id,standard_id)
 select distinct target_course,target,'unit',(u->>'id')::uuid,s.value::uuid from jsonb_array_elements(payload->'units') u cross join lateral jsonb_array_elements_text(u->'standard_ids') s
 union select distinct target_course,target,'assessment',(a->>'id')::uuid,s.value::uuid from jsonb_array_elements(payload->'evaluations') ev cross join lateral jsonb_array_elements(ev->'items') a cross join lateral jsonb_array_elements_text(a->'standard_ids') s;
end $$;
revoke all on function private.teaching_replace_links(uuid,uuid,jsonb) from public,anon,authenticated;

create function private.save_teaching_course(target uuid,target_course uuid,expected_version integer,settings jsonb,copy_from uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses; cid uuid; yr uuid; g integer; sem integer; subj uuid; ref jsonb; doc jsonb; limit_grade integer; title text; initial_hours numeric;
begin
limit_grade:=private.lock_workspace_grade_count(target);
if settings is null or not extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"workspace_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"academic_year_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"grade":{"type":"integer","minimum":1,"maximum":6},"semester":{"type":"integer","minimum":0,"maximum":2},"subject_id":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"subject_name":{"type":"string","minLength":1,"maxLength":120},"teacher_name":{"type":"string","minLength":1,"maxLength":80},"class_ids":{"maxItems":30,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"visibility":{"type":"string","enum":["private","workspace"]},"manual_hours":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]}},"required":["workspace_id","academic_year_id","grade","semester","subject_id","subject_name","teacher_name","class_ids","visibility","manual_hours"],"additionalProperties":false}$schema$::json,settings) or settings->>'workspace_id' is distinct from target::text then raise exception '수업 설정을 확인해 주세요.';end if;
 yr:=(settings->>'academic_year_id')::uuid;g:=(settings->>'grade')::integer;sem:=(settings->>'semester')::integer;subj:=(settings->>'subject_id')::uuid;title:=trim(settings->>'subject_name');
 if g>limit_grade then raise exception '학교급에 맞는 학년을 선택해 주세요.';end if;
 if not exists(select 1 from public.academic_years where id=yr and workspace_id=target) then raise exception '학년도 범위를 확인해 주세요.' using errcode='42501';end if;
 if subj is not null then select name into title from public.subjects where id=subj and workspace_id=target;if title is null then raise exception '과목 범위를 확인해 주세요.' using errcode='42501';end if;end if;
 if exists(select 1 from jsonb_array_elements_text(settings->'class_ids') v where not exists(select 1 from public.classes cl where cl.id=v.value::uuid and cl.workspace_id=target and cl.academic_year_id=yr and cl.grade=g)) then raise exception '같은 학년도·학년의 학급을 선택해 주세요.' using errcode='42501';end if;
 if target_course is null then
  if expected_version is distinct from 0 then raise exception '새 수업 버전을 확인해 주세요.';end if;
  ref:=private.teaching_reference(target,yr,g,sem,subj);
  initial_hours:=case when ref->'curriculum'->>'amount' is not null then (ref->'curriculum'->>'amount')::numeric*(case when ref->'curriculum'->>'unit'='credits' then 16 else 1 end) else (settings->>'manual_hours')::numeric end;
  doc:=jsonb_build_object('lesson_status','작성 중','units','[]'::jsonb,'evaluations',(select jsonb_agg(jsonb_build_object('semester',n,'mode','weighted','status','작성 중','notes','','items','[]'::jsonb) order by n) from generate_series(1,2) n where sem=0 or n=sem));
  if copy_from is not null then
   if not private.teaching_access(copy_from,false) or not exists(select 1 from public.teaching_courses where id=copy_from and workspace_id=target and semester=sem) then raise exception '같은 작업공간·학기 범위의 계획만 복사할 수 있습니다.' using errcode='42501';end if;
   select private.teaching_as_draft(document) into doc from public.teaching_plans where course_id=copy_from;
  end if;
  perform private.validate_teaching_document(doc,target,sem);
  insert into public.teaching_courses(workspace_id,academic_year_id,grade,semester,subject_id,subject_name,teacher_name,visibility,manual_hours,expected_hours,reference_snapshot)
  values(target,yr,g,sem,subj,title,settings->>'teacher_name',settings->>'visibility',(settings->>'manual_hours')::numeric,initial_hours,ref) returning id into cid;
  insert into public.teaching_plans(course_id,workspace_id,academic_year_id,document) values(cid,target,yr,doc);
  perform private.teaching_replace_links(cid,target,doc);
 else
  if not private.teaching_access(target_course,true) then raise exception '이 수업의 편집 권한이 없습니다.' using errcode='42501';end if;
  select * into c from public.teaching_courses where id=target_course and workspace_id=target for update;
  if c.id is null or c.version is distinct from expected_version then raise exception '수업이 변경되었습니다. 새로고침 후 다시 확인해 주세요.';end if;
  if c.academic_year_id<>yr or c.grade<>g or c.semester<>sem or c.subject_id is distinct from subj then raise exception '학년도·학년·학기·연결 과목 변경은 새 수업에 계획을 복사해 주세요.';end if;
  cid:=c.id;
  update public.teaching_courses set subject_name=title,teacher_name=settings->>'teacher_name',visibility=settings->>'visibility',manual_hours=(settings->>'manual_hours')::numeric,
   expected_hours=case when c.reference_snapshot->'curriculum'->>'amount' is null then (settings->>'manual_hours')::numeric else c.expected_hours end,version=version+1,updated_at=now() where id=cid;
 end if;
 delete from public.teaching_course_classes where course_id=cid;
 insert into public.teaching_course_classes(course_id,workspace_id,academic_year_id,grade,class_id) select distinct cid,target,yr,g,value::uuid from jsonb_array_elements_text(settings->'class_ids');
 perform private.teaching_record_revision(cid,case when target_course is null then case when copy_from is null then '수업 생성' else '계획 복사' end else '수업 설정 변경' end);
 return cid;
end $$;
create function public.save_teaching_course(target uuid,target_course uuid,expected_version integer,settings jsonb,copy_from uuid default null) returns uuid language sql security invoker set search_path='' as $$select private.save_teaching_course(target,target_course,expected_version,settings,copy_from)$$;
revoke all on function private.save_teaching_course(uuid,uuid,integer,jsonb,uuid),public.save_teaching_course(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.save_teaching_course(uuid,uuid,integer,jsonb,uuid),public.save_teaching_course(uuid,uuid,integer,jsonb,uuid) to authenticated;

create function private.save_teaching_plan(target_course uuid,expected_version integer,payload jsonb,confirm_plan boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses; old_doc jsonb; doc jsonb:=payload;
begin
 if not private.teaching_access(target_course,true) then raise exception '이 계획의 편집 권한이 없습니다.' using errcode='42501';end if;
 select * into c from public.teaching_courses where id=target_course for update;
 if c.version is distinct from expected_version or c.archived then raise exception '계획이 변경되었거나 보관되었습니다. 새로고침 후 확인해 주세요.';end if;
 perform private.validate_teaching_document(payload,c.workspace_id,c.semester);
 select document into old_doc from public.teaching_plans where course_id=target_course;
 if not coalesce(confirm_plan,false) then
  if old_doc->>'lesson_status'='확정' and old_doc->'units' is distinct from doc->'units' then doc:=jsonb_set(doc,'{lesson_status}','"작성 중"');end if;
  doc:=jsonb_set(doc,'{evaluations}',(select jsonb_agg(case when exists(select 1 from jsonb_array_elements(old_doc->'evaluations') old where old->>'semester'=ev->>'semester' and old->>'status'='확정' and (old-'status') is distinct from (ev-'status')) then jsonb_set(ev,'{status}','"작성 중"') else ev end order by ord) from jsonb_array_elements(doc->'evaluations') with ordinality a(ev,ord)));
 end if;
 update public.teaching_plans set document=doc where course_id=target_course;
 perform private.teaching_replace_links(target_course,c.workspace_id,doc);
 update public.teaching_courses set version=version+1,updated_at=now() where id=target_course;
 perform private.teaching_record_revision(target_course,case when confirm_plan then '상태 확인 후 저장' else '계획 저장' end);
 return c.version+1;
end $$;
create function public.save_teaching_plan(target_course uuid,expected_version integer,payload jsonb,confirm_plan boolean default false) returns integer language sql security invoker set search_path='' as $$select private.save_teaching_plan(target_course,expected_version,payload,confirm_plan)$$;
revoke all on function private.save_teaching_plan(uuid,integer,jsonb,boolean),public.save_teaching_plan(uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function private.save_teaching_plan(uuid,integer,jsonb,boolean),public.save_teaching_plan(uuid,integer,jsonb,boolean) to authenticated;

create function private.restore_teaching_plan(target_course uuid,expected_version integer,revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare doc jsonb;v integer;
begin
 if not private.teaching_access(target_course,true) then raise exception '이 계획의 편집 권한이 없습니다.' using errcode='42501';end if;
 select private.teaching_as_draft(document) into doc from public.teaching_plan_versions where course_id=target_course and version=revision;
 if doc is null then raise exception '저장 이력을 찾을 수 없습니다.';end if;
 v:=private.save_teaching_plan(target_course,expected_version,doc,false);
 update public.teaching_plan_versions set action='v'||revision||' 계획 내용 복원' where course_id=target_course and version=v;
 return v;
end $$;
create function public.restore_teaching_plan(target_course uuid,expected_version integer,revision integer) returns integer language sql security invoker set search_path='' as $$select private.restore_teaching_plan(target_course,expected_version,revision)$$;
revoke all on function private.restore_teaching_plan(uuid,integer,integer),public.restore_teaching_plan(uuid,integer,integer) from public,anon,authenticated;
grant execute on function private.restore_teaching_plan(uuid,integer,integer),public.restore_teaching_plan(uuid,integer,integer) to authenticated;

create function private.refresh_teaching_reference(target_course uuid,expected_version integer) returns integer language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses;ref jsonb;
begin
 if not private.teaching_access(target_course,true) then raise exception '이 수업의 편집 권한이 없습니다.' using errcode='42501';end if;
 select * into c from public.teaching_courses where id=target_course for update;
 if c.version is distinct from expected_version then raise exception '수업이 변경되었습니다. 새로고침해 주세요.';end if;
 ref:=private.teaching_reference(c.workspace_id,c.academic_year_id,c.grade,c.semester,c.subject_id);
 update public.teaching_courses set reference_snapshot=ref,expected_hours=case when ref->'curriculum'->>'amount' is not null then (ref->'curriculum'->>'amount')::numeric*(case when ref->'curriculum'->>'unit'='credits' then 16 else 1 end) else c.expected_hours end,version=version+1,updated_at=now() where id=c.id;
 perform private.teaching_record_revision(c.id,'편성·학사 참고 기준 갱신 (계획 내용 유지)');return c.version+1;
end $$;
create function public.refresh_teaching_reference(target_course uuid,expected_version integer) returns integer language sql security invoker set search_path='' as $$select private.refresh_teaching_reference(target_course,expected_version)$$;
revoke all on function private.refresh_teaching_reference(uuid,integer),public.refresh_teaching_reference(uuid,integer) from public,anon,authenticated;
grant execute on function private.refresh_teaching_reference(uuid,integer),public.refresh_teaching_reference(uuid,integer) to authenticated;

create function private.archive_teaching_course(target_course uuid,expected_version integer,archived_value boolean) returns integer language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses;
begin
 if not private.teaching_access(target_course,true) then raise exception '이 수업의 편집 권한이 없습니다.' using errcode='42501';end if;
 select * into c from public.teaching_courses where id=target_course for update;
 if c.version is distinct from expected_version or archived_value is null then raise exception '수업 상태를 확인하고 새로고침해 주세요.';end if;
 update public.teaching_courses set archived=archived_value,version=version+1,updated_at=now() where id=c.id;
 perform private.teaching_record_revision(c.id,case when archived_value then '수업 보관' else '수업 보관 해제' end);return c.version+1;
end $$;
create function public.archive_teaching_course(target_course uuid,expected_version integer,archived_value boolean) returns integer language sql security invoker set search_path='' as $$select private.archive_teaching_course(target_course,expected_version,archived_value)$$;
revoke all on function private.archive_teaching_course(uuid,integer,boolean),public.archive_teaching_course(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function private.archive_teaching_course(uuid,integer,boolean),public.archive_teaching_course(uuid,integer,boolean) to authenticated;

create function private.teaching_grade_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.school_type<>'초등학교' and exists(select 1 from public.teaching_courses where workspace_id=new.id and grade>3) then raise exception '4~6학년 수업 자료가 있는 작업공간입니다. 학교급을 변경할 수 없습니다.';end if;return new;
end $$;
revoke all on function private.teaching_grade_guard() from public,anon,authenticated;
create trigger teaching_grade_guard before update of school_type on public.workspaces for each row when(old.school_type is distinct from new.school_type) execute function private.teaching_grade_guard();
