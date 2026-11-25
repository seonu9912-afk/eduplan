-- Reusable immutable bell templates, with explicit date ranges. No rewrite of default bells.
create table public.bell_schedules (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(btrim(name)) between 1 and 100),kind text not null check(kind in ('shortened','exam','event','vacation','temporary')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(workspace_id,id)
);
create table public.bell_periods (
 schedule_id uuid not null references public.bell_schedules(id),position integer not null,period integer check(period between 1 and 12),
 kind text not null check(kind in ('lesson','lunch','break','other')),label text not null,
 starts_at time not null,ends_at time not null,primary key(schedule_id,position),unique(schedule_id,period),check(starts_at<ends_at)
);
create table public.bell_applications (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,academic_year_id uuid not null,schedule_id uuid not null,
 starts_on date not null,ends_on date not null,reason text not null check(length(btrim(reason)) between 1 and 300),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id),
 foreign key(workspace_id,schedule_id) references public.bell_schedules(workspace_id,id),check(starts_on<=ends_on)
);
create index bell_applications_dates_idx on public.bell_applications(academic_year_id,starts_on,ends_on);
create index bell_applications_schedule_idx on public.bell_applications(workspace_id,schedule_id);
alter table public.bell_schedules enable row level security;
alter table public.bell_periods enable row level security;
alter table public.bell_applications enable row level security;
grant select on public.bell_schedules,public.bell_periods,public.bell_applications to authenticated;
create policy bells_read on public.bell_schedules for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create policy bell_rows_read on public.bell_periods for select to authenticated using (exists(select 1 from public.bell_schedules s where s.id=schedule_id));
create policy bell_apply_read on public.bell_applications for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create function private.save_bell_schedule(target uuid,label text,schedule_kind text,rows jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; r jsonb; last_end time; seq integer:=0;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '시정표 관리 권한이 없습니다.'; end if;
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 40 then raise exception '시정표 교시 목록을 확인하세요.'; end if;
 if not exists(select 1 from jsonb_array_elements(rows) r where r->>'type'='lesson') then raise exception '수업 교시가 필요합니다.'; end if;
 insert into public.bell_schedules(workspace_id,name,kind,created_by) values(target,btrim(label),schedule_kind,auth.uid()) returning id into new_id;
 for r in select value from jsonb_array_elements(rows) loop
  if coalesce(r->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(r->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or (r->>'start')::time<last_end then raise exception '시정표 시각이 잘못되었거나 겹칩니다.'; end if;
  if r->>'type'='lesson' and (r->>'period') is null then raise exception '수업 교시를 지정하세요.'; end if;
  insert into public.bell_periods values(new_id,seq,case when r->>'type'='lesson' then (r->>'period')::integer end,r->>'type',coalesce(r->>'label',''),(r->>'start')::time,(r->>'end')::time);
  seq:=seq+1;last_end:=(r->>'end')::time;
 end loop;
 return new_id;
end $$;
create function public.save_bell_schedule(target uuid,label text,schedule_kind text,rows jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.save_bell_schedule(target,label,schedule_kind,rows) $$;
create function private.apply_bell_schedule(target uuid,year_id uuid,schedule uuid,first_date date,last_date date,note text) returns uuid language plpgsql security definer set search_path='' as $$
declare sy integer; result uuid;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '시정표 적용 권한이 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,7));
 select year into sy from public.academic_years where id=year_id and workspace_id=target;
 if sy is null or first_date<make_date(sy,3,1) or last_date>=make_date(sy+1,3,1) then raise exception '시정표 적용 기간이 학년도 범위를 벗어납니다.'; end if;
 if exists(select 1 from public.bell_applications where academic_year_id=year_id and starts_on<=last_date and ends_on>=first_date) then raise exception '같은 날짜에 적용된 특별 시정표가 있습니다. 기존 적용을 해제한 뒤 다시 지정하세요.'; end if;
 insert into public.bell_applications(workspace_id,academic_year_id,schedule_id,starts_on,ends_on,reason,created_by)
 values(target,year_id,schedule,first_date,last_date,btrim(note),auth.uid()) returning id into result;
 return result;
end $$;
create function public.apply_bell_schedule(target uuid,year_id uuid,schedule uuid,first_date date,last_date date,note text) returns uuid language sql security invoker set search_path='' as $$ select private.apply_bell_schedule(target,year_id,schedule,first_date,last_date,note) $$;
create function private.remove_bell_application(target uuid,application uuid) returns void language plpgsql security definer set search_path='' as $$
declare y uuid;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '시정표 적용 권한이 없습니다.'; end if;
 select academic_year_id into y from public.bell_applications where id=application and workspace_id=target;
 perform pg_advisory_xact_lock(hashtextextended(y::text,7));
 insert into public.planning_source_archives(workspace_id,academic_year_id,source_kind,source_version,document)
 select workspace_id,academic_year_id,'bell-application-cancelled:'||id,1,to_jsonb(bell_applications.*) from public.bell_applications where id=application and workspace_id=target;
 delete from public.bell_applications where id=application and workspace_id=target;
 if not found then raise exception '이미 해제되었거나 접근할 수 없는 시정표입니다.'; end if;
end $$;
create function public.remove_bell_application(target uuid,application uuid) returns void language sql security invoker set search_path='' as $$ select private.remove_bell_application(target,application) $$;
create function public.planning_resources(target uuid,year_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('rooms',coalesce((select jsonb_agg(to_jsonb(r)) from public.school_rooms r where workspace_id=target),'[]'),
 'links',coalesce((select jsonb_agg(to_jsonb(l)) from public.timetable_reference_links l where workspace_id=target and academic_year_id=year_id),'[]'),
 'bells',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('rows',(select jsonb_agg(jsonb_build_object('type',p.kind,'period',p.period,'label',p.label,'start',to_char(p.starts_at,'HH24:MI'),'end',to_char(p.ends_at,'HH24:MI')) order by position) from public.bell_periods p where p.schedule_id=s.id))) from public.bell_schedules s where workspace_id=target),'[]'),
 'applications',coalesce((select jsonb_agg(to_jsonb(a)) from public.bell_applications a where workspace_id=target and academic_year_id=year_id),'[]'))
$$;

-- Least privilege on every new callable; trigger/internal helpers are never RPCs.
revoke all on function private.assign_teacher_identity(),private.project_academic_days(),private.resolve_timetable_ref(uuid,uuid,text,text) from public,anon,authenticated;
do $$ declare signature text; begin
 foreach signature in array array[
 'save_school_room(uuid,uuid,text)','save_timetable_document(uuid,uuid,integer,jsonb)','read_timetable_document(uuid,uuid)',
 'publish_timetable(uuid,uuid,integer)','save_bell_schedule(uuid,text,text,jsonb)','apply_bell_schedule(uuid,uuid,uuid,date,date,text)',
 'remove_bell_application(uuid,uuid)','reorder_curriculum_subjects_v4(uuid,uuid,uuid[])','save_curriculum_operating_v4(uuid,integer,integer,jsonb,text)'] loop
 execute 'revoke all on function public.'||signature||',private.'||signature||' from public,anon,authenticated';
 execute 'grant execute on function public.'||signature||',private.'||signature||' to authenticated';
 end loop;
end $$;
revoke all on function public.academic_days_document(uuid,uuid),public.planning_resources(uuid,uuid) from public,anon;
grant execute on function public.academic_days_document(uuid,uuid),public.planning_resources(uuid,uuid) to authenticated;

