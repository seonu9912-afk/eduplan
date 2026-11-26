-- Capture the affected data in the same database before the cutover. The
-- restoration snapshot is owner-only and contains no auth or invitation secrets.
create table private.school_reform_backup (
  relation_name text primary key,
  captured_at timestamptz not null default statement_timestamp(),
  rows jsonb not null
);
alter table private.school_reform_backup enable row level security;
revoke all on private.school_reform_backup from public,anon,authenticated;
do $backup$
declare relation_name text;
begin
  foreach relation_name in array array[
    'workspaces','schools','profiles','workspace_members','academic_years','semesters','classes',
    'planning_permissions','annual_academic_plans','events','academic_day_operations','academic_grade_operations',
    'subjects','subject_groups','curriculum_plans','curriculum_hours','curriculum_design_documents',
    'curriculum_design_snapshots','curriculum_term_inputs','curriculum_term_adjustments',
    'timetable_documents','timetable_publications','timetable_effective_versions','timetable_entries',
    'teaching_courses','teaching_plans','teaching_plan_versions','staff_appointments'
  ] loop
    execute format('insert into private.school_reform_backup(relation_name,rows)
      select $1,coalesce(jsonb_agg(to_jsonb(t)),''[]'') from public.%I t',relation_name) using relation_name;
  end loop;
end $backup$;

-- Preserve personal records as a private export. New identities only get a profile.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),40),''),'선생님'));
  return new;
end $$;

create or replace function private.workspace_role(target uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m
  join public.schools s on s.id=m.workspace_id
  where m.workspace_id=target and m.user_id=(select auth.uid())
$$;

create or replace function private.validate_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.default_workspace_id is distinct from old.default_workspace_id
    and new.default_workspace_id is not null
    and private.workspace_role(new.default_workspace_id) is null then
    raise exception '소속 학교만 기본값으로 지정할 수 있습니다.' using errcode='42501';
  end if;
  return new;
end $$;

-- Account removal must never cascade through a school. Membership removal
-- transfers the founding pointer to a remaining administrator first.
create or replace function private.protect_workspace() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind is distinct from old.kind or new.id is distinct from old.id
    or (new.owner_id is distinct from old.owner_id and (
      old.kind<>'school' or private.workspace_role(old.id) is distinct from 'admin'
      or not exists(select 1 from public.workspace_members m
        where m.workspace_id=old.id and m.user_id=new.owner_id and m.role='admin')
    )) then
    raise exception '학교 식별자나 유형을 변경할 수 없습니다.' using errcode='42501';
  end if;
  return new;
end $$;
create function private.protect_school_on_account_removal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.workspaces where owner_id=old.id and kind='school') then
    raise exception '학교 관리자 이관을 완료한 뒤 계정을 탈퇴할 수 있습니다.' using errcode='23503';
  end if;
  return old;
end $$;
create trigger eduplan_keep_owned_school before delete on auth.users
  for each row execute function private.protect_school_on_account_removal();
revoke all on function private.protect_school_on_account_removal() from public,anon,authenticated;

create or replace function private.manage_member(target uuid, member_id uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare existing text; successor uuid;
begin
  perform 1 from public.workspaces where id=target for update;
  if private.workspace_role(target) is distinct from 'admin' then
    raise exception '관리자 권한이 필요합니다.' using errcode='42501';
  end if;
  select role into existing from public.workspace_members
    where workspace_id=target and user_id=member_id;
  if existing is null then raise exception '소속 구성원을 찾을 수 없습니다.'; end if;
  if existing='admin' and new_role is distinct from 'admin' and not exists(
    select 1 from public.workspace_members where workspace_id=target and user_id<>member_id and role='admin'
  ) then raise exception '학교에 관리자가 한 명 이상 있어야 합니다.'; end if;
  if new_role is distinct from 'admin' and exists(
    select 1 from public.workspaces where id=target and owner_id=member_id
  ) then
    select user_id into successor from public.workspace_members
      where workspace_id=target and user_id<>member_id and role='admin'
      order by joined_at,user_id limit 1;
    if successor is null then raise exception '관리자를 먼저 지정해 주세요.'; end if;
    update public.workspaces set owner_id=successor where id=target;
  end if;
  if new_role is null then delete from public.workspace_members where workspace_id=target and user_id=member_id;
  elsif new_role in ('admin','editor','viewer') then
    update public.workspace_members set role=new_role where workspace_id=target and user_id=member_id;
  else raise exception '올바르지 않은 역할입니다.'; end if;
end $$;

create or replace function private.create_school(school_name text,school_region text,school_type text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; name_key text; region_key text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  if school_type is null or school_type not in ('초등학교','중학교','고등학교') then raise exception '학교급을 선택해 주세요.'; end if;
  name_key := regexp_replace(lower(btrim(school_name)), '[[:space:]]+', '', 'g');
  region_key := regexp_replace(lower(btrim(school_region)), '[[:space:]]+', '', 'g');
  if coalesce(name_key,'')='' or coalesce(region_key,'')='' then
    raise exception '학교명과 지역을 입력해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 49));
  perform pg_advisory_xact_lock(hashtextextended(name_key||':'||region_key||':'||school_type, 51));
  if exists (
    select 1 from public.schools s join public.workspaces w on w.id=s.id
    where regexp_replace(lower(w.name), '[[:space:]]+', '', 'g')=name_key
      and regexp_replace(lower(s.region), '[[:space:]]+', '', 'g')=region_key
      and w.school_type=create_school.school_type
  ) then raise exception '같은 학교명과 지역으로 개설된 학교가 있습니다. 학교 관리자에게 초대를 요청하세요.'; end if;
  result:=private.create_school(school_name,school_region);
  perform private.set_school_type(result,school_type);
  update public.profiles set default_workspace_id=result
    where id=auth.uid() and private.workspace_role(default_workspace_id) is null;
  return result;
end $$;
-- The implementation is used internally by the three-argument school creation RPC.
revoke execute on function private.create_school(text,text) from public,anon,authenticated;

create function private.ensure_school_year(target uuid, school_year integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if private.workspace_role(target) is null then
    raise exception '학교 구성원만 학년도를 조회할 수 있습니다.' using errcode='42501';
  end if;
  if school_year is null or school_year not between 2000 and 2100 then
    raise exception '2000~2100 사이의 학년도를 선택하세요.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text||':'||school_year::text,0));
  select id into result from public.academic_years where workspace_id=target and year=school_year;
  if result is null then
    insert into public.academic_years(workspace_id,year) values(target,school_year) returning id into result;
  end if;
  return result;
end $$;
create function public.ensure_school_year(target uuid, school_year integer) returns uuid
language sql security invoker set search_path='' as $$
  select private.ensure_school_year(target,school_year)
$$;

create function private.personal_archive() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare archived uuid; relations text; rows jsonb; bundle jsonb := '{}'::jsonb;
begin
  select w.id into archived from public.workspaces w where w.kind='personal' and w.owner_id=auth.uid();
  if archived is null then return null; end if;
  select jsonb_build_object('workspace',to_jsonb(w)) into bundle from public.workspaces w where w.id=archived;
  for relations in select c.table_name from information_schema.columns c
    join information_schema.tables t using(table_schema,table_name)
    where c.table_schema='public' and t.table_type='BASE TABLE' and c.column_name='workspace_id'
      and c.table_name not in ('workspace_members','invitations','lesson_push_subscriptions','operation_push_subscriptions')
    order by c.table_name
  loop
    execute format('select jsonb_agg(to_jsonb(t)) from public.%I t where workspace_id=$1',relations)
      into rows using archived;
    if rows is not null then bundle:=bundle||jsonb_build_object(relations,rows); end if;
  end loop;
  select jsonb_agg(to_jsonb(a)) into rows from public.curriculum_term_adjustments a
    join public.curriculum_plans p on p.id=a.plan_id where p.workspace_id=archived;
  if rows is not null then bundle:=bundle||jsonb_build_object('curriculum_term_adjustments',rows); end if;
  return bundle;
end $$;
create function public.personal_archive() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.personal_archive() $$;
revoke all on function private.ensure_school_year(uuid,integer),public.ensure_school_year(uuid,integer),
  private.personal_archive(),public.personal_archive() from public,anon,authenticated;
grant execute on function private.ensure_school_year(uuid,integer),public.ensure_school_year(uuid,integer),
  private.personal_archive(),public.personal_archive() to authenticated;

create function private.has_personal_archive() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspaces where kind='personal' and owner_id=(select auth.uid()))
$$;
create function public.has_personal_archive() returns boolean
language sql stable security invoker set search_path='' as $$ select private.has_personal_archive() $$;
revoke all on function private.has_personal_archive(),public.has_personal_archive() from public,anon,authenticated;
grant execute on function private.has_personal_archive(),public.has_personal_archive() to authenticated;

-- Immutable snapshots with effective dates; keep old confirmations and drafts in their source tables.
create table public.school_plan_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  academic_year_id uuid not null,
  domain text not null check(domain in ('calendar','plans')),
  source_version integer not null,
  starts_on date not null,
  published_at timestamptz not null default statement_timestamp(),
  published_by uuid references auth.users(id) on delete set null,
  change_note text not null default '' check(length(change_note)<=500),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  foreign key(academic_year_id,workspace_id) references public.academic_years(id,workspace_id),
  unique(academic_year_id,domain,starts_on,source_version)
);
create index school_plan_publications_lookup on public.school_plan_publications
  (workspace_id,academic_year_id,domain,starts_on desc,published_at desc);
alter table public.school_plan_publications enable row level security;
revoke all on public.school_plan_publications from public,anon,authenticated;
grant select on public.school_plan_publications to authenticated;
create policy school_publication_read on public.school_plan_publications for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);

create function private.school_calendar_payload(confirmation jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'document', (confirmation->'document') - 'business' - 'departments' - 'workSettings',
    'events', coalesce(confirmation->'source'->'events','[]'),
    'semesters', coalesce(confirmation->'source'->'semesters','[]'),
    'classes', coalesce(confirmation->'source'->'classes','[]')
  )
$$;

insert into public.school_plan_publications
  (workspace_id,academic_year_id,domain,source_version,starts_on,published_at,change_note,payload)
select a.workspace_id,a.academic_year_id,'calendar',(a.calendar_confirmation->>'version')::integer,
  make_date(y.year,3,1),(a.calendar_confirmation->>'at')::timestamptz,
  '기존 확정본',private.school_calendar_payload(a.calendar_confirmation)
from public.annual_academic_plans a join public.academic_years y on y.id=a.academic_year_id
join public.schools s on s.id=a.workspace_id
where a.calendar_confirmation->'document' is not null
  and a.calendar_confirmation->>'at' is not null and a.calendar_confirmation->>'version' is not null;

create function private.publish_school_plan(target uuid,year_id uuid,plan_domain text,
  expected_version integer,effective_date date,note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare sy integer; saved public.annual_academic_plans; contents jsonb; output uuid;
begin
  if plan_domain is null or plan_domain not in ('calendar','plans') or not private.can_plan(target,plan_domain) then
    raise exception '이 계획을 공개할 권한이 없습니다.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(year_id::text,2));
  select year into sy from public.academic_years where id=year_id and workspace_id=target;
  if sy is null or effective_date is null or effective_date<make_date(sy,3,1)
    or effective_date>=make_date(sy+1,3,1) then
    raise exception '적용 시작일을 해당 학년도 안에서 지정하세요.' using errcode='22023';
  end if;
  select * into saved from public.annual_academic_plans
    where academic_year_id=year_id and workspace_id=target for update;
  if saved.version is null or saved.version is distinct from expected_version then
    raise exception '저장본이 변경되었습니다. 새로 불러온 뒤 공개해 주세요.' using errcode='40001';
  end if;
  select id into output from public.school_plan_publications
    where academic_year_id=year_id and domain=plan_domain and starts_on=effective_date and source_version=expected_version;
  if output is not null then return output; end if;
  if plan_domain='calendar' then
    perform private.confirm_academic_calendar(target,year_id,expected_version);
    select private.school_calendar_payload(calendar_confirmation) into contents
      from public.annual_academic_plans where academic_year_id=year_id;
  else
    contents:=jsonb_build_object('business',saved.document->'business',
      'departments',saved.document->'departments','workSettings',saved.document->'workSettings');
  end if;
  insert into public.school_plan_publications(workspace_id,academic_year_id,domain,
    source_version,starts_on,published_by,change_note,payload)
  values(target,year_id,plan_domain,expected_version,effective_date,auth.uid(),coalesce(btrim(note),''),contents)
  returning id into output;
  return output;
end $$;
create function public.publish_school_plan(target uuid,year_id uuid,plan_domain text,
  expected_version integer,effective_date date,note text) returns uuid
language sql security invoker set search_path='' as $$
  select private.publish_school_plan(target,year_id,plan_domain,expected_version,effective_date,note)
$$;

-- Effective timetable projections carry release metadata and reference only snapshots.
create or replace function public.effective_timetables(target uuid,year_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('starts_on',a.starts_on,'id',p.id,
    'published_at',p.published_at,'document',p.document) order by a.starts_on),'[]')
  from public.timetable_effective_versions a join public.timetable_publications p on p.id=a.publication_id
  where a.workspace_id=target and a.academic_year_id=year_id
$$;
create function private.freeze_timetable_resources() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.document:=new.document||jsonb_build_object('publishedResources',
    public.planning_resources(new.workspace_id,new.academic_year_id));
  return new;
end $$;
create trigger freeze_timetable_resources before insert on public.timetable_publications
  for each row execute function private.freeze_timetable_resources();

revoke all on function private.school_calendar_payload(jsonb),private.freeze_timetable_resources(),
  private.publish_school_plan(uuid,uuid,text,integer,date,text),
  public.publish_school_plan(uuid,uuid,text,integer,date,text) from public,anon,authenticated;
grant execute on function private.publish_school_plan(uuid,uuid,text,integer,date,text),
  public.publish_school_plan(uuid,uuid,text,integer,date,text) to authenticated;

-- School administration and plan edit privileges are independent. Keep only explicit grants.
create or replace function private.can_plan(target uuid,area text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.planning_permissions p join public.schools s on s.id=p.workspace_id
    where p.workspace_id=target and p.user_id=(select auth.uid()) and p.domain=area and p.can_edit)
$$;
create or replace function private.save_planning_permission(target uuid,member uuid,area text,allowed boolean,expected integer) returns void
language plpgsql security definer set search_path='' as $$
declare old_version integer;
begin
  perform 1 from public.workspaces where id=target for update;
  if private.workspace_role(target) is distinct from 'admin' then
    raise exception '업무 권한은 학교 관리자만 변경할 수 있습니다.' using errcode='42501';
  end if;
  if not exists(select 1 from public.workspace_members where workspace_id=target and user_id=member) then
    raise exception '같은 학교 구성원을 선택하세요.' using errcode='42501';
  end if;
  select version into old_version from public.planning_permissions where workspace_id=target and user_id=member and domain=area;
  if coalesce(old_version,0) is distinct from expected then
    raise exception '권한이 변경되었습니다. 새로 불러와 주세요.' using errcode='40001';
  end if;
  insert into public.planning_permissions values(target,member,area,allowed,coalesce(old_version,0)+1,auth.uid(),now())
  on conflict(workspace_id,user_id,domain) do update
    set can_edit=excluded.can_edit,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
create function private.can_review_plan(target uuid,area text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.workspace_role(target)='admin',false) or private.can_plan(target,area)
    or case area
      when 'curriculum' then private.can_plan(target,'timetable') or private.can_plan(target,'staffing')
        or private.can_plan(target,'assessment') or private.can_plan(target,'calendar')
      when 'calendar' then private.can_plan(target,'plans') or private.can_plan(target,'timetable')
        or private.can_plan(target,'assessment')
      when 'timetable' then private.can_plan(target,'staffing')
      else false end
$$;
revoke all on function private.can_review_plan(uuid,text) from public,anon,authenticated;
grant execute on function private.can_review_plan(uuid,text) to authenticated;

do $policies$
declare entry record;
begin
  for entry in select * from (values
    ('annual_academic_plans','calendar'),('events','calendar'),
    ('academic_day_operations','calendar'),('calendar_item_history','calendar'),
    ('curriculum_plans','curriculum'),('curriculum_hours','curriculum'),
    ('curriculum_design_documents','curriculum'),('curriculum_design_locks','curriculum'),
    ('curriculum_design_revisions','curriculum'),('curriculum_term_inputs','curriculum'),
    ('curriculum_annual_excel_sheets','curriculum'),('curriculum_import_batches','curriculum'),
    ('curriculum_operating_sheets','curriculum'),('curriculum_operating_history','curriculum'),
    ('timetable_documents','timetable'),('timetable_entries','timetable'),
    ('timetable_groups','timetable'),('timetable_reference_links','timetable'),
    ('bell_schedules','timetable'),('bell_applications','timetable')
  ) p(table_name,area)
  loop
    execute format('create policy draft_read_scope on public.%I as restrictive for select to authenticated using (private.can_review_plan(workspace_id,%L))',entry.table_name,entry.area);
  end loop;
end $policies$;
alter policy grade_day_read on public.academic_grade_operations using (
  exists(select 1 from public.academic_years y where y.id=academic_year_id and private.can_review_plan(y.workspace_id,'calendar'))
);
create policy group_class_draft_scope on public.timetable_group_classes as restrictive for select to authenticated
  using (private.can_review_plan(workspace_id,'timetable'));
create policy timetable_publication_only on public.timetable_publications as restrictive for select to authenticated
  using (private.can_review_plan(workspace_id,'timetable') or exists (
    select 1 from public.timetable_effective_versions a where a.publication_id=timetable_publications.id
  ));
alter policy editor_insert on public.events with check (private.can_plan(workspace_id,'calendar'));
alter policy event_update on public.events using (private.can_plan(workspace_id,'calendar')) with check (private.can_plan(workspace_id,'calendar'));
alter policy event_delete on public.events using (private.can_plan(workspace_id,'calendar'));
alter policy editor_insert on public.curriculum_plans with check (private.can_plan(workspace_id,'curriculum'));
alter policy editor_insert on public.subject_groups with check (private.can_plan(workspace_id,'curriculum'));
alter policy editor_insert on public.subjects with check (private.can_plan(workspace_id,'curriculum'));
alter policy archive_read on public.planning_source_archives using (private.workspace_role(workspace_id)='admin');
create trigger planning_domain before insert or update or delete on public.curriculum_operating_sheets
  for each row execute function private.guard_planning_domain('curriculum');
create trigger planning_domain before insert or update or delete on public.curriculum_annual_excel_sheets
  for each row execute function private.guard_planning_domain('curriculum');
create trigger planning_domain before insert or update or delete on public.curriculum_import_batches
  for each row execute function private.guard_planning_domain('curriculum');


-- Reuse validated writers with their exact domain at the existing early checks.
do $scope$
declare entry record; definition text; before_edit text;
begin
  for entry in select * from (values
    ('private.lock_workspace_grade_count(uuid)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')', 'private.workspace_role(target) is null'),
    ('private.read_timetable_document(uuid,uuid)', 'private.workspace_role(target) is null','not private.can_review_plan(target,''timetable'')'),
    ('private.publish_timetable_from(uuid,uuid,integer,date)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.publish_timetable(uuid,uuid,integer)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.publish_timetable_v1(uuid,uuid,integer)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.save_timetable_document(uuid,uuid,integer,jsonb)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.save_timetable_document_v1(uuid,uuid,integer,jsonb)', 'coalesce(private.workspace_role(target), '''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.curriculum_design_acquire(uuid,boolean)', 'coalesce(actor_role,'''') not in (''admin'',''editor'')','not private.can_plan(p.workspace_id,''curriculum'')'),
    ('private.curriculum_design_confirm_version(uuid,integer,integer)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''curriculum'')'),
    ('private.curriculum_design_confirm(uuid)', 'coalesce(private.workspace_role(p.workspace_id),'''') not in (''admin'',''editor'')','not private.can_plan(p.workspace_id,''curriculum'')'),
    ('private.curriculum_design_save(uuid,integer,integer,jsonb)', 'coalesce(private.workspace_role(p.workspace_id),'''') not in (''admin'',''editor'')','not private.can_plan(p.workspace_id,''curriculum'')'),
    ('private.delete_subject(uuid,uuid,jsonb)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''curriculum'')'),
    ('private.save_school_room(uuid,uuid,text)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.save_bell_schedule(uuid,text,text,jsonb)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.apply_bell_schedule(uuid,uuid,uuid,date,date,text)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.remove_bell_application(uuid,uuid)', 'coalesce(private.workspace_role(target),'''') not in (''admin'',''editor'')','not private.can_plan(target,''timetable'')'),
    ('private.save_semesters(uuid,uuid,integer,jsonb)', 'private.workspace_role(target) is distinct from ''admin''','not private.can_plan(target,''calendar'')')
  ) p(signature,old_check,new_check)
  loop
    definition:=pg_get_functiondef(entry.signature::regprocedure);
    before_edit:=definition;
    definition:=replace(definition,entry.old_check,entry.new_check);
    if before_edit=definition then raise exception 'Permission contract changed in %',entry.signature; end if;
    execute definition;
  end loop;
end $scope$;

-- Published curriculum rows are read through their frozen snapshot. Draft plans and
-- cohort versions are never needed to retrieve these rows.
create function private.school_curriculum_publications(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.cohort_year desc),'[]')
  from (
    select distinct on (p.cohort_year) s.id,p.cohort_year,s.confirmed_at,s.version,s.hours
    from public.curriculum_design_snapshots s
    join public.curriculum_plans p on p.id=s.plan_id and p.workspace_id=s.workspace_id
    where s.workspace_id=target and private.workspace_role(target) is not null
    order by p.cohort_year desc,s.confirmed_at desc,s.version desc,s.id
  ) rows
$$;
create function public.school_curriculum_publications(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select private.school_curriculum_publications(target)
$$;
revoke all on function private.school_curriculum_publications(uuid),public.school_curriculum_publications(uuid) from public,anon,authenticated;
grant execute on function private.school_curriculum_publications(uuid),public.school_curriculum_publications(uuid) to authenticated;

-- Draft course access is restricted to its authors, assigned teacher and designated reviewers.
create or replace function private.teaching_access(target_course uuid,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.teaching_courses c where c.id=target_course
    and private.workspace_role(c.workspace_id) is not null
    and (
      c.owner_id=(select auth.uid())
      or (c.visibility='workspace' and (
        private.can_plan(c.workspace_id,'assessment')
        or (not writing and (
          private.workspace_role(c.workspace_id)='admin'
          or exists(select 1 from public.teaching_course_editors e where e.course_id=c.id and e.user_id=(select auth.uid()))
          or exists(select 1 from public.staff_appointments a where a.id=c.teacher_id and a.workspace_id=c.workspace_id
            and a.academic_year_id=c.academic_year_id and a.user_id=(select auth.uid()))
        ))
      ))
    )
  )
$$;
create or replace function private.teaching_plan_write_access(target_course uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.teaching_access(target_course,true) or exists (
    select 1 from public.teaching_courses c where c.id=target_course
      and c.visibility='workspace' and private.workspace_role(c.workspace_id) is not null
      and (
        exists(select 1 from public.teaching_course_editors e where e.course_id=c.id and e.user_id=(select auth.uid()))
        or exists(select 1 from public.staff_appointments a where a.id=c.teacher_id and a.workspace_id=c.workspace_id
          and a.academic_year_id=c.academic_year_id and a.user_id=(select auth.uid()))
      )
  )
$$;

-- All mutation RPCs already scope rows; these triggers also shield the older direct paths.
create function private.guard_teaching_writer() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  if tg_table_name='teaching_courses' then
    if tg_op='INSERT' then
      if private.can_plan(new.workspace_id,'assessment') then return new; end if;
    elsif tg_op='UPDATE' then
      if private.teaching_access(old.id,true) or (
        to_jsonb(new)-'version'-'updated_at'=to_jsonb(old)-'version'-'updated_at'
        and private.teaching_plan_write_access(old.id)
      ) then return new; end if;
    elsif private.teaching_access(old.id,true) then return old;
    end if;
  elsif private.teaching_plan_write_access(coalesce(new.course_id,old.course_id))
    or private.can_plan(coalesce(new.workspace_id,old.workspace_id),'assessment') then
    return coalesce(new,old);
  end if;
  raise exception '담당 수업과 평가계획만 편집할 수 있습니다.' using errcode='42501';
end $$;
create or replace trigger planning_domain before insert or update or delete on public.teaching_courses
  for each row execute function private.guard_teaching_writer();
create or replace trigger planning_domain before insert or update or delete on public.teaching_plans
  for each row execute function private.guard_teaching_writer();
revoke all on function private.guard_teaching_writer() from public,anon,authenticated;

-- These versions record an explicit confirmation operation. Only confirmed
-- portions are released. A private course is never published by this read.
create function private.school_teaching_publications(target uuid,year_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with confirmed as (
    select v.* from public.teaching_plan_versions v
    where v.workspace_id=target and private.workspace_role(target) is not null
      and v.course_snapshot->>'academic_year_id'=year_id::text
      and v.course_snapshot->>'visibility'='workspace'
      and v.action in ('상태 확인 후 저장','계획 확정')
      and (v.document->>'lesson_status'='확정' or exists (
        select 1 from jsonb_array_elements(v.document->'evaluations') e where e->>'status'='확정'
      ))
  ), latest as (
    select distinct on (v.course_id) v.* from confirmed v order by v.course_id,v.version desc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('course_id',h.course_id,'version',h.version,'published_at',h.created_at,
      'grade',h.course_snapshot->'grade','semester',h.course_snapshot->'semester',
      'subject_name',h.course_snapshot->'subject_name','teacher_name',h.course_snapshot->'teacher_name',
      'classes',coalesce(h.course_snapshot->'classes','[]'),
      'units',coalesce((select v.document->'units' from confirmed v where v.course_id=h.course_id
        and v.document->>'lesson_status'='확정' order by v.version desc limit 1),'[]'),
      'evaluations',coalesce((select jsonb_agg(p.item order by p.semester) from (
        select distinct on (e->>'semester') e->>'semester' semester,e item from confirmed v
        cross join lateral jsonb_array_elements(v.document->'evaluations') e
        where v.course_id=h.course_id and e->>'status'='확정'
        order by e->>'semester',v.version desc
      ) p),'[]'))
    order by h.created_at desc,h.course_id),'[]')
  from latest h
$$;
create function public.school_teaching_publications(target uuid,year_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select private.school_teaching_publications(target,year_id)
$$;
revoke all on function private.school_teaching_publications(uuid,uuid),public.school_teaching_publications(uuid,uuid)
  from public,anon,authenticated;
grant execute on function private.school_teaching_publications(uuid,uuid),public.school_teaching_publications(uuid,uuid)
  to authenticated;

create or replace function private.assessment_calendar(target uuid,year_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if private.workspace_role(target) is null then raise exception '평가 일정 조회 권한이 없습니다.' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('courseId',course->'course_id','grade',course->'grade',
      'name',item->>'name','start',item->>'start','end',item->>'end',
      'classIds',coalesce((select jsonb_agg(cls->'id') from jsonb_array_elements(course->'classes') cls),'[]')))
    from jsonb_array_elements(private.school_teaching_publications(target,year_id)) course
    cross join lateral jsonb_array_elements(course->'evaluations') assessment
    cross join lateral jsonb_array_elements(assessment->'items') item
  ),'[]');
end $$;

-- Keep ordinary teachers' individual records out of the shared draft data paths.
create policy activity_log_admin_only on public.activity_log as restrictive for select to authenticated
  using (private.workspace_role(workspace_id)='admin');
alter policy lesson_record_read on public.lesson_records using (
  private.can_review_plan(workspace_id,'timetable') or exists (
    select 1 from public.staff_appointments a where a.id=teacher_id and a.user_id=(select auth.uid())
  )
);

-- The worker already verifies its subscription with a service-role RPC.
-- Supply effective public plans, including the timing rules frozen at publication.
create or replace function public.push_source(subscription uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.lesson_push_subscriptions; y public.academic_years;
  a public.school_plan_publications; p public.timetable_publications;
  seoul_date date:=(now() at time zone 'Asia/Seoul')::date;
begin
  select * into s from public.lesson_push_subscriptions where id=subscription and enabled;
  if s.id is null or not exists(select 1 from public.workspace_members m join public.schools w on w.id=m.workspace_id
    where m.workspace_id=s.workspace_id and m.user_id=s.user_id) then return null; end if;
  select * into y from public.academic_years where workspace_id=s.workspace_id
    and year=extract(year from seoul_date)::integer-case when extract(month from seoul_date)<3 then 1 else 0 end;
  if y.id is null or not exists(select 1 from public.staff_appointments where workspace_id=s.workspace_id
    and academic_year_id=y.id and user_id=s.user_id and status='재직') then return null; end if;
  select * into a from public.school_plan_publications where workspace_id=s.workspace_id and academic_year_id=y.id
    and domain='calendar' and starts_on<=seoul_date order by starts_on desc,source_version desc,published_at desc limit 1;
  select t.* into p from public.timetable_effective_versions v join public.timetable_publications t on t.id=v.publication_id
    where v.workspace_id=s.workspace_id and v.academic_year_id=y.id and v.starts_on<=seoul_date order by v.starts_on desc limit 1;
  if a.id is null or p.id is null then return null; end if;
  return jsonb_build_object(
    'userId',s.user_id,
    'workspace',(select to_jsonb(w) from public.workspaces w where id=s.workspace_id),
    'year',to_jsonb(y),
    'annual',jsonb_build_object('document',a.payload->'document'||'{"departments":["교무부"],"business":[]}'::jsonb),
    'semesters',a.payload->'semesters',
    'classes',coalesce(nullif(a.payload->'classes','[]'::jsonb),(select jsonb_agg(to_jsonb(c)) from public.classes c where academic_year_id=y.id),'[]'),
    'subjects','[]'::jsonb,
    'events',a.payload->'events',
    'directory',coalesce((select jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'display_name',display_name,'status',status))
      from public.staff_appointments where academic_year_id=y.id),'[]'),
    'publication',to_jsonb(p),'effectiveTimetables',public.effective_timetables(s.workspace_id,y.id),
    'resources',coalesce(p.document->'publishedResources','{"rooms":[],"links":[],"bells":[],"applications":[]}'::jsonb));
end $$;

-- Use the same released calendar as the weekly display when validating a
-- lesson-record write from a direct RPC, even if the draft calendar changed.
do $ledger$
declare definition text:=pg_get_functiondef('private.save_lesson_records(uuid,uuid,text,jsonb)'::regprocedure);
  old_check text:=$before$  select case when operation_type='swap' then timetable_weekday else extract(dow from day)::integer end into weekday from public.academic_day_operations where academic_year_id=year_id and date=day;
  weekday:=coalesce(weekday,extract(dow from day)::integer);$before$;
begin
  if strpos(definition,old_check)=0 then raise exception 'Lesson record calendar contract changed'; end if;
  execute replace(definition,old_check,$after$
  weekday:=private.released_weekday(target,year_id,day);
  if weekday is null then raise exception '해당 날짜에 공개된 수업일이 없습니다.'; end if;$after$);
end $ledger$;

create function private.released_weekday(target uuid,year_id uuid,school_day date) returns integer
language plpgsql stable security definer set search_path='' as $$
declare doc jsonb; rule jsonb; published jsonb; weekday integer;
begin
  select payload into published from public.school_plan_publications
    where workspace_id=target and academic_year_id=year_id and domain='calendar' and starts_on<=school_day
    order by starts_on desc,source_version desc,published_at desc limit 1;
  if published is null then return null; end if;
  doc:=published->'document';
  rule:=doc->'days'->school_day::text;
  weekday:=extract(dow from school_day)::integer;
  if rule is not null then
    return case when rule->>'enabled'='true' and rule->>'type' in ('instructional','swap')
      then (rule->>'weekday')::integer else null end;
  end if;
  if weekday not between 1 and 5 or (doc->'holidays') ? school_day::text or exists(
    select 1 from jsonb_array_elements(doc->'vacations') v
    where school_day between (v->>'start')::date and (v->>'end')::date
  ) then return null; end if;
  return weekday;
end $$;
revoke all on function private.released_weekday(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.planning_source_stamp(target uuid,year_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if private.workspace_role(target) is null then
    raise exception '학교 계획 조회 권한이 없습니다.' using errcode='42501';
  end if;
  return md5(jsonb_build_object(
    'draft',case when private.can_plan(target,'calendar') then
      (select version from public.annual_academic_plans where workspace_id=target and academic_year_id=year_id) end,
    'calendar',(select jsonb_agg(id order by id) from public.school_plan_publications
      where workspace_id=target and academic_year_id=year_id and domain='calendar'),
    'staff',(select jsonb_agg(jsonb_build_array(id,version) order by id)
      from public.staff_appointments where workspace_id=target and academic_year_id=year_id),
    'timetable',public.effective_timetables(target,year_id),
    'assessment',private.school_teaching_publications(target,year_id)
  )::text);
end $$;

-- Roster administration remains a school-level duty. Staffing analysts may
-- read the same roster without inheriting the administrator's write privilege.
alter policy staff_authorized_read on public.staff_appointments using (
  private.workspace_role(workspace_id)='admin' or private.can_plan(workspace_id,'staffing')
  or (private.workspace_role(workspace_id) is not null and user_id=(select auth.uid()))
);
alter policy staff_history_read on public.staff_appointment_history using (
  private.workspace_role(workspace_id)='admin' or private.can_plan(workspace_id,'staffing')
);
