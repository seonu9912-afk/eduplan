-- Additive completion of the common planning model; existing operational grants are not changed automatically.
create table public.planning_permissions (
 workspace_id uuid not null,user_id uuid not null,domain text not null check(domain in ('curriculum','calendar','timetable','assessment','staffing','plans')),
 can_edit boolean not null,version integer not null default 1,updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),
 primary key(workspace_id,user_id,domain),foreign key(workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade
);
alter table public.planning_permissions enable row level security;
grant select on public.planning_permissions to authenticated;
create policy permissions_read on public.planning_permissions for select to authenticated using ((select private.workspace_role(workspace_id))='admin' or user_id=(select auth.uid()));
create function private.can_plan(target uuid,area text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case when private.workspace_role(target)='admin' then true
 when private.workspace_role(target)='editor' then coalesce((select p.can_edit from public.planning_permissions p where p.workspace_id=target and p.user_id=auth.uid() and p.domain=area),area<>'calendar') else false end),false)
$$;
create function public.planning_access(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_object_agg(area,private.can_plan(target,area)) from unnest(array['curriculum','calendar','timetable','assessment','staffing','plans']) area
$$;
create function private.save_planning_permission(target uuid,member uuid,area text,allowed boolean,expected integer) returns void language plpgsql security definer set search_path='' as $$
declare old_version integer;
begin
 if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then raise exception '업무 권한은 관리자만 변경할 수 있습니다.'; end if;
 if (select role from public.workspace_members where workspace_id=target and user_id=member) is distinct from 'editor' then raise exception '편집 구성원의 업무 권한을 설정하세요. 관리자와 조회 구성원의 기본 역할은 구성원 설정에서 관리합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||member::text,41));
 select version into old_version from public.planning_permissions where workspace_id=target and user_id=member and domain=area;
 if coalesce(old_version,0) is distinct from expected then raise exception '권한이 변경되었습니다. 새로 불러와 주세요.'; end if;
 insert into public.planning_permissions values(target,member,area,allowed,coalesce(old_version,0)+1,auth.uid(),now())
 on conflict(workspace_id,user_id,domain) do update set can_edit=excluded.can_edit,version=excluded.version,updated_by=auth.uid(),updated_at=now();
end $$;
create function public.save_planning_permission(target uuid,member uuid,area text,allowed boolean,expected integer) returns void language sql security invoker set search_path='' as $$ select private.save_planning_permission(target,member,area,allowed,expected) $$;
create function private.guard_planning_domain() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; area text:=tg_argv[0];
begin
 if auth.uid() is null then return coalesce(new,old); end if;
 target:=coalesce(new.workspace_id,old.workspace_id);
 if tg_table_name='annual_academic_plans' and tg_op='INSERT' and private.can_plan(target,'plans') then return new; end if;
 if tg_table_name='annual_academic_plans' and tg_op='UPDATE' and new.calendar_confirmation is not distinct from old.calendar_confirmation and (new.document-'business'-'departments'-'workSettings')=(old.document-'business'-'departments'-'workSettings') then area:='plans'; end if;
 if not private.can_plan(target,area) then raise exception '이 계획의 업무별 수정 권한이 없습니다.' using errcode='42501'; end if;
 return coalesce(new,old);
end $$;
create trigger planning_domain before insert or update or delete on public.annual_academic_plans for each row execute function private.guard_planning_domain('calendar');
create trigger planning_domain before insert or update or delete on public.events for each row execute function private.guard_planning_domain('calendar');
create trigger planning_domain before insert or update or delete on public.timetable_documents for each row execute function private.guard_planning_domain('timetable');
create trigger planning_domain before insert or update or delete on public.bell_schedules for each row execute function private.guard_planning_domain('timetable');
create trigger planning_domain before insert or update or delete on public.bell_applications for each row execute function private.guard_planning_domain('timetable');
create trigger planning_domain before insert or update or delete on public.timetable_effective_versions for each row execute function private.guard_planning_domain('timetable');
create trigger planning_domain before insert or update or delete on public.curriculum_plans for each row execute function private.guard_planning_domain('curriculum');
create trigger planning_domain before insert or update or delete on public.curriculum_hours for each row execute function private.guard_planning_domain('curriculum');
create trigger planning_domain before insert or update or delete on public.curriculum_design_documents for each row execute function private.guard_planning_domain('curriculum');
create trigger planning_domain before insert or update or delete on public.curriculum_design_snapshots for each row execute function private.guard_planning_domain('curriculum');
create trigger planning_domain before insert or update or delete on public.staffing_scenarios for each row execute function private.guard_planning_domain('staffing');
create trigger planning_domain before insert or update or delete on public.teaching_courses for each row execute function private.guard_planning_domain('assessment');
create trigger planning_domain before insert or update or delete on public.teaching_plans for each row execute function private.guard_planning_domain('assessment');
-- Preserve the existing validated implementation; change only the specified contract/guard.
do $patch$
declare definition text:=pg_get_functiondef('private.save_calendar_changes(uuid,uuid,jsonb,jsonb,text)'::regprocedure);schema_text text;
begin
 if strpos(definition,$old0$begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then
    raise exception '학사일정은 관리자만 수정할 수 있습니다.' using errcode='42501';
$old0$)=0 then raise exception 'Existing save_calendar_changes contract differs; review before migrating';end if;
 definition:=replace(definition,$old0$begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then
    raise exception '학사일정은 관리자만 수정할 수 있습니다.' using errcode='42501';
$old0$,$new0$begin
  if auth.uid() is null or not private.can_plan(target,'calendar') then
    raise exception '학사일정 담당 권한이 필요합니다.' using errcode='42501';
$new0$);
 execute definition;
end $patch$;

-- Structured curriculum inputs; document.cells is now a transactional compatibility projection.
revoke all on function private.guard_planning_domain() from public,anon,authenticated;
revoke all on function private.can_plan(uuid,text),public.planning_access(uuid),private.save_planning_permission(uuid,uuid,text,boolean,integer),public.save_planning_permission(uuid,uuid,text,boolean,integer) from public,anon;
grant execute on function private.can_plan(uuid,text),public.planning_access(uuid),private.save_planning_permission(uuid,uuid,text,boolean,integer),public.save_planning_permission(uuid,uuid,text,boolean,integer) to authenticated;
-- Preserve the existing validated implementation; change only the specified contract/guard.
do $patch$
declare definition text:=pg_get_functiondef('private.guard_calendar_document()'::regprocedure);schema_text text;
begin
 if strpos(definition,$old0$begin
  if auth.uid() is null or private.workspace_role(new.workspace_id) = 'admin' then
$old0$)=0 then raise exception 'Existing guard_calendar_document contract differs; review before migrating';end if;
 definition:=replace(definition,$old0$begin
  if auth.uid() is null or private.workspace_role(new.workspace_id) = 'admin' then
$old0$,$new0$begin
  if auth.uid() is null or private.can_plan(new.workspace_id,'calendar') then
$new0$);
 if strpos(definition,$old1$  end if;
  raise exception '학사일정은 관리자만 수정할 수 있습니다.' using errcode = '42501';
$old1$)=0 then raise exception 'Existing guard_calendar_document contract differs; review before migrating';end if;
 definition:=replace(definition,$old1$  end if;
  raise exception '학사일정은 관리자만 수정할 수 있습니다.' using errcode = '42501';
$old1$,$new1$  end if;
  raise exception '학사일정은 학사일정 담당자만 수정할 수 있습니다.' using errcode = '42501';
$new1$);
 execute definition;
end $patch$;

-- Preserve the existing validated implementation; change only the specified contract/guard.
do $patch$
declare definition text:=pg_get_functiondef('private.confirm_academic_calendar(uuid,uuid,integer)'::regprocedure);schema_text text;
begin
 if strpos(definition,$old0$begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then
    raise exception '학사일정 확정은 관리자만 가능합니다.' using errcode = '42501';
$old0$)=0 then raise exception 'Existing confirm_academic_calendar contract differs; review before migrating';end if;
 definition:=replace(definition,$old0$begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then
    raise exception '학사일정 확정은 관리자만 가능합니다.' using errcode = '42501';
$old0$,$new0$begin
  if auth.uid() is null or not private.can_plan(target,'calendar') then
    raise exception '학사일정 확정은 학사일정 담당자만 가능합니다.' using errcode = '42501';
$new0$);
 execute definition;
end $patch$;

alter policy staff_authorized_read on public.staff_appointments using (private.can_plan(workspace_id,'staffing') or ((select private.workspace_role(workspace_id)) is not null and user_id=(select auth.uid())));
alter policy staff_history_read on public.staff_appointment_history using (private.can_plan(workspace_id,'staffing'));
alter policy scenario_read on public.staffing_scenarios using (private.can_plan(workspace_id,'staffing'));
alter policy scenario_create on public.staffing_scenarios with check (private.can_plan(workspace_id,'staffing') and created_by=(select auth.uid()));
create trigger planning_domain before insert or update or delete on public.subjects for each row execute function private.guard_planning_domain('curriculum');
create trigger planning_domain before insert or update or delete on public.subject_groups for each row execute function private.guard_planning_domain('curriculum');

create trigger planning_domain before insert or update or delete on public.school_rooms for each row execute function private.guard_planning_domain('timetable');
