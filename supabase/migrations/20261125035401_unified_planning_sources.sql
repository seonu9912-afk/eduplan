-- Additive transition: old documents remain recoverable; no name-based merges.
-- Public RPCs are invokers. All write paths check membership inside private functions.
create table public.school_teachers (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 created_at timestamptz not null default now(), unique(workspace_id,id)
);
alter table public.school_teachers enable row level security;
grant select on public.school_teachers to authenticated;
create policy teacher_identity_read on public.school_teachers for select to authenticated
 using ((select private.workspace_role(workspace_id)) is not null);
alter table public.staff_appointments add column teacher_id uuid not null default gen_random_uuid();
insert into public.school_teachers(id,workspace_id) select teacher_id,workspace_id from public.staff_appointments;
alter table public.staff_appointments alter column teacher_id drop default;
alter table public.staff_appointments alter column teacher_id set not null;
alter table public.staff_appointments add foreign key(workspace_id,teacher_id) references public.school_teachers(workspace_id,id);
alter table public.staff_appointments add unique(academic_year_id,teacher_id);
alter table public.staff_appointments add unique(workspace_id,academic_year_id,id);
create function private.assign_teacher_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.teacher_id is null then select teacher_id into new.teacher_id from public.staff_appointments where id=new.id and workspace_id=new.workspace_id; end if;
 if new.teacher_id is null then
  insert into public.school_teachers(workspace_id) values(new.workspace_id) returning id into new.teacher_id;
 end if;
 return new;
end $$;
create trigger staff_identity before insert on public.staff_appointments for each row execute function private.assign_teacher_identity();
-- Keep the existing save's permission, account approval, qualification and version checks.
alter function private.save_staff_appointment(uuid,uuid,uuid,integer,jsonb) rename to save_staff_appointment_v1;
create or replace function private.save_staff_appointment_v1(target uuid, year_id uuid, appointment_id uuid, expected_version integer, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.staff_appointments%rowtype; saved public.staff_appointments%rowtype;
  account uuid; home_class uuid; primary_subject uuid; qualifications uuid[];
begin
  if auth.uid() is null or coalesce(private.workspace_role(target),'')<>'admin' then
    raise exception '교원 명부 및 계정 연결은 관리자만 변경할 수 있습니다.' using errcode='42501';
  end if;
  if expected_version is null or expected_version<0 or jsonb_typeof(payload) is distinct from 'object' then
    raise exception '교원 입력 또는 버전을 확인하세요.';
  end if;
  perform 1 from public.academic_years where workspace_id=target and id=year_id for update;
  if not found then raise exception '학년도 접근 권한이 없습니다.' using errcode='42501'; end if;
  if jsonb_typeof(payload->'subject_ids') is distinct from 'array' or jsonb_array_length(payload->'subject_ids')>30 then
    raise exception '지도 가능 과목 목록을 확인하세요.';
  end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into qualifications from jsonb_array_elements_text(payload->'subject_ids');
  account:=nullif(payload->>'user_id','')::uuid;
  home_class:=nullif(payload->>'homeroom_class_id','')::uuid;
  primary_subject:=nullif(payload->>'primary_subject_id','')::uuid;
  if account is not null and not exists(select 1 from public.workspace_members where workspace_id=target and user_id=account) then
    raise exception '학교에 가입한 구성원만 연결할 수 있습니다.' using errcode='42501';
  end if;
  if home_class is not null and not exists(select 1 from public.classes where workspace_id=target and academic_year_id=year_id and id=home_class) then
    raise exception '담임 학급은 같은 학년도의 학급이어야 합니다.';
  end if;
  if exists(select 1 from unnest(qualifications) q where not exists(select 1 from public.subjects where workspace_id=target and id=q))
    or cardinality(qualifications)<>(select count(distinct q) from unnest(qualifications) q)
    or (primary_subject is not null and not primary_subject=any(qualifications)) then
    raise exception '학교의 지도 가능 과목과 주 담당 과목을 확인하세요.';
  end if;
  if appointment_id is not null then
    select * into old from public.staff_appointments where id=appointment_id and workspace_id=target and academic_year_id=year_id for update;
    if not found or old.version<>expected_version then raise exception '교원 명부가 변경되었습니다. 최신 자료를 불러와 비교해 주세요.'; end if;
  elsif expected_version<>0 then raise exception '신규 교원 버전을 확인하세요.'; end if;
  insert into public.staff_appointments(id,workspace_id,academic_year_id,teacher_id,user_id,display_name,subject_ids,primary_subject_id,
    department,duties,homeroom_class_id,employment,status,target_hours,reduction_hours,version)
  values(coalesce(appointment_id,gen_random_uuid()),target,year_id,nullif(payload->>'teacher_id','')::uuid,account,payload->>'display_name',qualifications,primary_subject,
    payload->>'department',payload->>'duties',home_class,payload->>'employment',payload->>'status',
    (payload->>'target_hours')::numeric,(payload->>'reduction_hours')::numeric,coalesce(old.version,0)+1)
  on conflict(id) do update set user_id=excluded.user_id,display_name=excluded.display_name,subject_ids=excluded.subject_ids,
    primary_subject_id=excluded.primary_subject_id,department=excluded.department,duties=excluded.duties,homeroom_class_id=excluded.homeroom_class_id,
    employment=excluded.employment,status=excluded.status,target_hours=excluded.target_hours,reduction_hours=excluded.reduction_hours,
    version=excluded.version,updated_at=now() returning * into saved;
  insert into public.staff_appointment_history(workspace_id,appointment_id,document,changed_by)
    values(target,saved.id,to_jsonb(saved),auth.uid());
  return to_jsonb(saved);
end $$;
create function private.save_staff_appointment(target uuid,year_id uuid,appointment_id uuid,expected_version integer,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb; identity_id uuid:=nullif(payload->>'teacher_id','')::uuid; existing_identity uuid;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'')<>'admin' then raise exception '교원 명부 변경 권한이 없습니다.'; end if;
 if identity_id is not null and not exists(select 1 from public.school_teachers where workspace_id=target and id=identity_id) then
  raise exception '같은 학교의 교원만 학년도 배치에 연결할 수 있습니다.';
 end if;
 if appointment_id is not null then
  select teacher_id into existing_identity from public.staff_appointments where id=appointment_id and workspace_id=target and academic_year_id=year_id;
  if identity_id is not null and identity_id is distinct from existing_identity then raise exception '기존 교원의 식별자는 변경할 수 없습니다.'; end if;
 end if;
 saved:=private.save_staff_appointment_v1(target,year_id,appointment_id,expected_version,payload);
 return saved;
end $$;
-- Rebind SQL wrapper after renaming (SQL bodies may retain OID dependencies).
create or replace function public.save_staff_appointment(target uuid,year_id uuid,appointment_id uuid,expected_version integer,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.save_staff_appointment(target,year_id,appointment_id,expected_version,payload) $$;
revoke all on function private.save_staff_appointment_v1(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function private.save_staff_appointment(uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function private.save_staff_appointment(uuid,uuid,uuid,integer,jsonb) to authenticated;

-- Daily operating overrides have one transactional writer: the academic calendar.
-- annual_academic_plans.document.days becomes its compatibility projection.
create table public.academic_day_operations (
 workspace_id uuid not null, academic_year_id uuid not null, date date not null,
 operation_type text not null check(operation_type in ('instructional','weekend','holiday','vacation','discretionary','swap')),
 name text not null default '', enabled boolean not null, timetable_weekday integer check(timetable_weekday between 1 and 5),
 start_period integer check(start_period between 1 and 12), end_period integer check(end_period between 1 and 12),
 source_version integer not null, primary key(academic_year_id,date),
 foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id),
 check(start_period is null or end_period is null or start_period<=end_period)
);
create table public.academic_grade_operations (
 academic_year_id uuid not null, date date not null, grade integer not null check(grade between 1 and 6),
 start_period integer not null check(start_period between 1 and 12),end_period integer not null check(end_period between 0 and 12),
 primary key(academic_year_id,date,grade),
 foreign key(academic_year_id,date) references public.academic_day_operations on delete cascade,
 check(end_period=0 or start_period<=end_period)
);
alter table public.academic_day_operations enable row level security;
alter table public.academic_grade_operations enable row level security;
grant select on public.academic_day_operations,public.academic_grade_operations to authenticated;
create policy day_read on public.academic_day_operations for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create policy grade_day_read on public.academic_grade_operations for select to authenticated using (exists(select 1 from public.academic_years y where y.id=academic_year_id and private.workspace_role(y.workspace_id) is not null));
create function private.project_academic_days() returns trigger language plpgsql security definer set search_path='' as $$
declare d record; g record; school_year integer;
begin
 select year into school_year from public.academic_years where id=new.academic_year_id and workspace_id=new.workspace_id;
 delete from public.academic_day_operations where academic_year_id=new.academic_year_id;
 for d in select key,value from jsonb_each(coalesce(new.document->'days','{}')) loop
  if d.key::date<make_date(school_year,3,1) or d.key::date>=make_date(school_year+1,3,1) then raise exception '학사 운영 날짜가 학년도 범위를 벗어납니다.'; end if;
  insert into public.academic_day_operations values(new.workspace_id,new.academic_year_id,d.key::date,d.value->>'type',coalesce(d.value->>'name',''),
   (d.value->>'enabled')::boolean,nullif(d.value->>'weekday','')::integer,(d.value->>'start')::integer,(d.value->>'end')::integer,new.version);
  for g in select key,value from jsonb_each(coalesce(d.value->'gradePeriods','{}')) loop
   insert into public.academic_grade_operations values(new.academic_year_id,d.key::date,g.key::integer,(g.value->>'start')::integer,(g.value->>'end')::integer);
  end loop;
 end loop;
 return new;
end $$;
create trigger project_academic_days after insert or update of document on public.annual_academic_plans for each row execute function private.project_academic_days();
-- Preserve the original as-is; a failed conversion rolls the entire migration back.
create table public.planning_source_archives (
 id bigint generated always as identity primary key,workspace_id uuid not null references public.workspaces(id),
 academic_year_id uuid not null, source_kind text not null, source_version integer not null, document jsonb not null,
 archived_at timestamptz not null default now(), unique(academic_year_id,source_kind,source_version),
 foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id)
);
alter table public.planning_source_archives enable row level security;
grant select on public.planning_source_archives to authenticated;
create policy archive_read on public.planning_source_archives for select to authenticated using ((select private.workspace_role(workspace_id)) in ('admin','editor'));
insert into public.planning_source_archives(workspace_id,academic_year_id,source_kind,source_version,document)
 select workspace_id,academic_year_id,'academic-calendar-before-normalization',version,document from public.annual_academic_plans;
-- Backfill NEW tables only. Do not rewrite annual documents, versions or timestamps.
insert into public.academic_day_operations
 select a.workspace_id,a.academic_year_id,d.key::date,d.value->>'type',coalesce(d.value->>'name',''),
 (d.value->>'enabled')::boolean,(d.value->>'weekday')::integer,(d.value->>'start')::integer,(d.value->>'end')::integer,a.version
 from public.annual_academic_plans a cross join lateral jsonb_each(coalesce(a.document->'days','{}')) d;
insert into public.academic_grade_operations
 select a.academic_year_id,d.key::date,g.key::integer,(g.value->>'start')::integer,(g.value->>'end')::integer
 from public.annual_academic_plans a cross join lateral jsonb_each(coalesce(a.document->'days','{}')) d
 cross join lateral jsonb_each(coalesce(d.value->'gradePeriods','{}')) g;
create function public.academic_days_document(target uuid,year_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(d.date::text,jsonb_strip_nulls(jsonb_build_object('type',d.operation_type,'name',d.name,'enabled',d.enabled,
 'weekday',d.timetable_weekday,'start',d.start_period,'end',d.end_period,'gradePeriods',
 (select jsonb_object_agg(g.grade::text,jsonb_build_object('start',g.start_period,'end',g.end_period)) from public.academic_grade_operations g where g.academic_year_id=d.academic_year_id and g.date=d.date)))),'{}')
 from public.academic_day_operations d where d.workspace_id=target and d.academic_year_id=year_id
$$;

-- Stable common rooms. A room name change never rewrites lesson references.
create table public.school_rooms (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(btrim(name)) between 1 and 70),unique(workspace_id,id),unique(workspace_id,name)
);
alter table public.school_rooms enable row level security;
grant select on public.school_rooms to authenticated;
create policy rooms_read on public.school_rooms for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create function private.save_school_room(target uuid,room_id uuid,room_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '특별실 관리 권한이 없습니다.'; end if;
 if room_id is null then insert into public.school_rooms(workspace_id,name) values(target,btrim(room_name)) returning id into result;
 else update public.school_rooms set name=btrim(room_name) where workspace_id=target and id=room_id returning id into result;
 end if;
 if result is null then raise exception '학교의 특별실을 찾을 수 없습니다.'; end if;
 return result;
end $$;
create function public.save_school_room(target uuid,room_id uuid,room_name text) returns uuid language sql security invoker set search_path='' as $$ select private.save_school_room(target,room_id,room_name) $$;

create table public.timetable_reference_links (
 workspace_id uuid not null,academic_year_id uuid not null,kind text not null check(kind in ('subject','teacher','room')),
 legacy_id text not null,subject_id uuid,teacher_id uuid,room_id uuid,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(academic_year_id,kind,legacy_id),foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id),
 foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id),
 foreign key(workspace_id,academic_year_id,teacher_id) references public.staff_appointments(workspace_id,academic_year_id,id),
 foreign key(workspace_id,room_id) references public.school_rooms(workspace_id,id),
 check((kind='subject' and subject_id is not null and teacher_id is null and room_id is null) or
 (kind='teacher' and teacher_id is not null and subject_id is null and room_id is null) or
 (kind='room' and room_id is not null and subject_id is null and teacher_id is null))
);
alter table public.timetable_reference_links enable row level security;
grant select on public.timetable_reference_links to authenticated;
create policy links_read on public.timetable_reference_links for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create table public.timetable_groups (
 workspace_id uuid not null, academic_year_id uuid not null,id text not null,label text not null,
 primary key(academic_year_id,id),foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id)
);
alter table public.classes add unique(workspace_id,academic_year_id,id);
create table public.timetable_group_classes (
 workspace_id uuid not null,academic_year_id uuid not null,group_id text not null,class_id uuid not null,
 primary key(academic_year_id,group_id,class_id),foreign key(academic_year_id,group_id) references public.timetable_groups on delete cascade,
 foreign key(workspace_id,academic_year_id,class_id) references public.classes(workspace_id,academic_year_id,id)
);
create table public.timetable_entries (
 workspace_id uuid not null,academic_year_id uuid not null,kind text not null check(kind in ('weekly','assignment','change')),
 id text not null,subject_id uuid,teacher_id uuid,room_id uuid,class_id uuid,group_id text,
 weekday integer check(weekday between 1 and 5),period integer check(period between 1 and 12),date date,
 weekly_hours numeric check(weekly_hours between 0 and 40),action text check(action in ('replace','cancel')),
 settings jsonb not null default '{}',source_version integer not null,
 primary key(academic_year_id,kind,id),
 foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id),
 foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id),
 foreign key(workspace_id,academic_year_id,teacher_id) references public.staff_appointments(workspace_id,academic_year_id,id),
 foreign key(workspace_id,room_id) references public.school_rooms(workspace_id,id),
 foreign key(workspace_id,academic_year_id,class_id) references public.classes(workspace_id,academic_year_id,id),
 foreign key(academic_year_id,group_id) references public.timetable_groups(academic_year_id,id),
 check(num_nonnulls(class_id,group_id)=1),
 check((kind='weekly' and weekday is not null and period is not null and subject_id is not null and date is null) or
 (kind='assignment' and weekly_hours is not null and subject_id is not null and date is null) or
 (kind='change' and date is not null and period is not null and action is not null and (action='cancel' or subject_id is not null)))
);
create unique index timetable_change_class_unique on public.timetable_entries(academic_year_id,date,class_id,period) where kind='change' and class_id is not null;
create unique index timetable_change_group_unique on public.timetable_entries(academic_year_id,date,group_id,period) where kind='change' and group_id is not null;
create index timetable_entries_subject_idx on public.timetable_entries(workspace_id,subject_id);
create index timetable_entries_teacher_idx on public.timetable_entries(workspace_id,academic_year_id,teacher_id);
create index timetable_entries_room_idx on public.timetable_entries(workspace_id,room_id);
create index timetable_entries_class_idx on public.timetable_entries(workspace_id,academic_year_id,class_id);
create index timetable_entries_group_idx on public.timetable_entries(academic_year_id,group_id);
-- One normalized entry can cover several classes; group membership stays relational.
do $$ declare t text; begin
 foreach t in array array['timetable_groups','timetable_group_classes','timetable_entries'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using ((select private.workspace_role(workspace_id)) is not null)',t);
 end loop;
end $$;

-- Security advisor remediation: preserve function body and permissions in private schema.
alter function public.reorder_curriculum_subjects_v4(uuid,uuid,uuid[]) set schema private;
create function public.reorder_curriculum_subjects_v4(p_workspace uuid,p_group uuid,p_order uuid[]) returns integer language sql security invoker set search_path='' as $$
 select private.reorder_curriculum_subjects_v4(p_workspace,p_group,p_order) $$;
alter function public.save_curriculum_operating_v4(uuid,integer,integer,jsonb,text) set schema private;
create function public.save_curriculum_operating_v4(p_workspace uuid,p_year integer,p_expected_version integer,p_document jsonb,p_action text default 'save') returns jsonb language sql security invoker set search_path='' as $$
 select private.save_curriculum_operating_v4(p_workspace,p_year,p_expected_version,p_document,p_action) $$;


revoke all on function private.assign_teacher_identity(),private.project_academic_days() from public,anon,authenticated;
revoke all on function private.save_school_room(uuid,uuid,text),public.save_school_room(uuid,uuid,text),public.academic_days_document(uuid,uuid),public.reorder_curriculum_subjects_v4(uuid,uuid,uuid[]),public.save_curriculum_operating_v4(uuid,integer,integer,jsonb,text) from public,anon;
grant execute on function private.save_school_room(uuid,uuid,text),public.save_school_room(uuid,uuid,text),public.academic_days_document(uuid,uuid),public.reorder_curriculum_subjects_v4(uuid,uuid,uuid[]),public.save_curriculum_operating_v4(uuid,integer,integer,jsonb,text) to authenticated;
