-- EduPlan MVP. No student records, service-role client, or statutory hour constants.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create extension if not exists pgcrypto with schema extensions;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal','school')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index one_personal_workspace on public.workspaces(owner_id) where kind = 'personal';
create index workspace_owner on public.workspaces(owner_id);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '선생님' check (char_length(trim(display_name)) between 1 and 40),
  default_workspace_id uuid references public.workspaces(id) on delete set null
);
create index profile_default_workspace on public.profiles(default_workspace_id);
create table public.schools (
  id uuid primary key references public.workspaces(id) on delete cascade,
  region text not null default '' check (char_length(region) <= 40),
  school_type text not null default '중학교' check (school_type = '중학교')
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index memberships_by_user on public.workspace_members(user_id,workspace_id);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.schools(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(trim(email))),
  role text not null check (role in ('editor','viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index invitations_workspace on public.invitations(workspace_id,created_at desc);
create index invitations_creator on public.invitations(created_by);
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  version integer not null default 1,
  unique (workspace_id,year), unique(id,workspace_id)
);
create index years_school on public.academic_years(school_id);
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  school_id uuid references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  number smallint not null check (number in (1,2)),
  start_date date not null, end_date date not null,
  check (end_date >= start_date),
  foreign key (academic_year_id,workspace_id) references public.academic_years(id,workspace_id) on delete cascade,
  unique(academic_year_id,number)
);
create index semesters_workspace on public.semesters(workspace_id);
create index semesters_school on public.semesters(school_id);
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  school_id uuid references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  grade smallint not null check (grade between 1 and 3),
  class_number smallint not null check (class_number between 1 and 30),
  foreign key (academic_year_id,workspace_id) references public.academic_years(id,workspace_id) on delete cascade,
  unique(academic_year_id,grade,class_number), unique(id,workspace_id)
);
create index classes_workspace on public.classes(workspace_id);
create index classes_school on public.classes(school_id);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  school_id uuid references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  start_date date not null, end_date date not null,
  event_type text not null check (event_type in ('school','exam','holiday','department','other')),
  target_grades smallint[] not null default '{1,2,3}' check (cardinality(target_grades) between 1 and 3 and target_grades <@ array[1,2,3]::smallint[]),
  department text not null default '' check (char_length(department) <= 60),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid not null default auth.uid() references auth.users(id),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (academic_year_id,workspace_id) references public.academic_years(id,workspace_id) on delete cascade,
  unique(id,workspace_id)
);
create index events_calendar on public.events(workspace_id,academic_year_id,start_date,end_date);
create index events_year_fk on public.events(academic_year_id,workspace_id);
create index events_school on public.events(school_id);
create index events_creator on public.events(created_by);
create table public.subject_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  unique(workspace_id,name), unique(id,workspace_id)
);
create index groups_school on public.subject_groups(school_id);
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  group_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 60),
  foreign key(group_id,workspace_id) references public.subject_groups(id,workspace_id),
  unique(workspace_id,name), unique(id,workspace_id)
);
create index subjects_group on public.subjects(group_id,workspace_id);
create index subjects_school on public.subjects(school_id);
create table public.curriculum_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  cohort_year integer not null check (cohort_year between 2000 and 2100),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique(workspace_id,cohort_year), unique(id,workspace_id)
);
create index plans_school on public.curriculum_plans(school_id);
create table public.curriculum_hours (
  workspace_id uuid not null,
  school_id uuid references public.schools(id) on delete cascade,
  plan_id uuid not null,
  subject_id uuid not null,
  grade smallint not null check (grade between 1 and 3),
  semester smallint not null check (semester in (1,2)),
  hours integer not null check (hours between 0 and 2000),
  primary key(plan_id,subject_id,grade,semester),
  foreign key(plan_id,workspace_id) references public.curriculum_plans(id,workspace_id) on delete cascade,
  foreign key(subject_id,workspace_id) references public.subjects(id,workspace_id)
);
create index hours_workspace on public.curriculum_hours(workspace_id);
create index hours_subject on public.curriculum_hours(subject_id,workspace_id);
create index hours_school on public.curriculum_hours(school_id);
create table public.activity_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  label text not null,
  created_at timestamptz not null default now()
);
create index activity_workspace_date on public.activity_log(workspace_id,created_at desc);
create index activity_actor on public.activity_log(actor_id);

-- Membership is read from the database, not from mutable or stale JWT metadata.
create function private.workspace_role(target uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m
  join public.workspaces w on w.id=m.workspace_id
  where m.workspace_id=target and m.user_id=(select auth.uid())
    and (select auth.uid()) is not null
    and (w.kind='school' or w.owner_id=(select auth.uid()))
$$;

create function private.scope_record() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.workspace_id <> old.workspace_id then
    raise exception '작업공간을 변경할 수 없습니다.' using errcode='42501';
  end if;
  new.school_id := (select id from public.schools where id=new.workspace_id);
  return new;
end $$;

create function private.protect_workspace() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id <> old.owner_id or new.kind <> old.kind or new.id <> old.id then
    raise exception '작업공간 소유자와 유형을 변경할 수 없습니다.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger protect_workspace before update on public.workspaces for each row execute function private.protect_workspace();

create function private.validate_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.default_workspace_id is not null and private.workspace_role(new.default_workspace_id) is null then
    raise exception '가입한 작업공간만 기본값으로 지정할 수 있습니다.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger validate_profile before update on public.profiles for each row execute function private.validate_profile();

-- Trigger-only definer: auth creates the user before a JWT exists. Identity is NEW.id.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare personal_id uuid;
begin
  insert into public.workspaces(kind,name,owner_id) values('personal','내 작업공간',new.id) returning id into personal_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(personal_id,new.id,'admin');
  insert into public.profiles(id,display_name,default_workspace_id)
    values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),40),''),'선생님'),personal_id);
  return new;
end $$;
create trigger eduplan_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.create_school(school_name text, school_region text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; caller uuid := auth.uid();
begin
  if caller is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  if (select count(*) from public.workspaces where owner_id=caller and kind='school') >= 20 then
    raise exception '개설 가능한 학교 수를 초과했습니다.';
  end if;
  insert into public.workspaces(kind,name,owner_id) values('school',trim(school_name),caller) returning id into new_id;
  insert into public.schools(id,region) values(new_id,trim(school_region));
  insert into public.workspace_members(workspace_id,user_id,role) values(new_id,caller,'admin');
  insert into public.activity_log(workspace_id,actor_id,action,label) values(new_id,caller,'create','학교 작업공간 개설');
  return new_id;
end $$;
create function public.create_school(school_name text, school_region text) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_school(school_name,school_region) $$;

create function private.create_invitation(target uuid, recipient text, member_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare token text; invite_id uuid;
begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if recipient !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception '이메일을 확인해 주세요.'; end if;
  token := encode(extensions.gen_random_bytes(32),'hex');
  -- Reissuing to an address revokes its previous open invitations.
  update public.invitations set revoked_at=now() where workspace_id=target and email=lower(trim(recipient)) and accepted_at is null and revoked_at is null;
  insert into public.invitations(workspace_id,email,role,token_hash,created_by)
    values(target,lower(trim(recipient)),member_role,encode(extensions.digest(token,'sha256'),'hex'),auth.uid()) returning id into invite_id;
  return jsonb_build_object('id',invite_id,'token',token);
end $$;
create function public.create_invitation(target uuid, recipient text, member_role text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.create_invitation(target,recipient,member_role) $$;
create function private.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations%rowtype; caller_email text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  select lower(email) into caller_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into inv from public.invitations where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
  if inv.id is null or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at <= now() or caller_email is distinct from inv.email then
    raise exception '초대가 만료·철회되었거나 초대 이메일과 계정이 다릅니다.' using errcode='42501';
  end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(inv.workspace_id,auth.uid(),inv.role) on conflict do nothing;
  update public.invitations set accepted_at=now() where id=inv.id;
  return inv.workspace_id;
end $$;
create function public.accept_invitation(token text) returns uuid
language sql security invoker set search_path = '' as $$ select private.accept_invitation(token) $$;
create function private.revoke_invitation(invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select workspace_id into target from public.invitations where id=invite_id;
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  update public.invitations set revoked_at=now() where id=invite_id and accepted_at is null;
end $$;
create function public.revoke_invitation(invite_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.revoke_invitation(invite_id) $$;
create function private.manage_member(target uuid, member_id uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if exists(select 1 from public.workspaces where id=target and (kind='personal' or owner_id=member_id)) then raise exception '소유자 권한은 변경할 수 없습니다.'; end if;
  if new_role is null then delete from public.workspace_members where workspace_id=target and user_id=member_id;
  elsif new_role in ('admin','editor','viewer') then update public.workspace_members set role=new_role where workspace_id=target and user_id=member_id;
  else raise exception '올바르지 않은 역할입니다.'; end if;
end $$;
create function public.manage_member(target uuid, member_id uuid, new_role text) returns void
language sql security invoker set search_path = '' as $$ select private.manage_member(target,member_id,new_role) $$;
create function private.list_members(target uuid) returns table(user_id uuid,display_name text,email text,role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.workspace_role(target) is null then raise exception '접근 권한이 없습니다.' using errcode='42501'; end if;
  return query select m.user_id,p.display_name,case when private.workspace_role(target)='admin' then u.email::text else ''::text end,m.role
  from public.workspace_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id where m.workspace_id=target order by m.joined_at;
end $$;
create function public.list_members(target uuid) returns table(user_id uuid,display_name text,email text,role text)
language sql security invoker set search_path = '' as $$ select * from private.list_members(target) $$;

create function private.save_academic_year(target uuid, school_year integer, expected_version integer, terms jsonb, class_counts integer[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare year_id uuid; current_version integer; first_start date; first_end date; second_start date; second_end date; g integer;
begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if cardinality(class_counts)<>3 or array_position(class_counts,null) is not null or exists(select 1 from unnest(class_counts) n where n<0 or n>30) then raise exception '학년별 학급 수는 0~30개입니다.'; end if;
  first_start := (terms->0->>'start_date')::date; first_end := (terms->0->>'end_date')::date;
  second_start := (terms->1->>'start_date')::date; second_end := (terms->1->>'end_date')::date;
  if first_start is null or first_end is null or second_start is null or second_end is null or first_start>first_end or first_end>=second_start or second_start>second_end
    or first_start<make_date(school_year,3,1) or second_end>=make_date(school_year+1,3,1) then raise exception '학기 날짜와 학년도 범위를 확인해 주세요.'; end if;
  -- Serialize creation as well as updates for one workspace/year.
  perform pg_advisory_xact_lock(hashtextextended(target::text||':'||school_year::text,0));
  select id,version into year_id,current_version from public.academic_years where workspace_id=target and year=school_year for update;
  if year_id is null then
    if expected_version<>0 then raise exception '다른 사용자가 학년도를 변경했습니다. 새로고침해 주세요.'; end if;
    insert into public.academic_years(workspace_id,year) values(target,school_year) returning id into year_id;
  else
    if expected_version is distinct from current_version then raise exception '다른 사용자가 학년도를 변경했습니다. 새로고침해 주세요.'; end if;
    update public.academic_years set version=version+1 where id=year_id;
  end if;
  insert into public.semesters(workspace_id,academic_year_id,number,start_date,end_date) values
    (target,year_id,1,first_start,first_end),(target,year_id,2,second_start,second_end)
    on conflict(academic_year_id,number) do update set start_date=excluded.start_date,end_date=excluded.end_date;
  for g in 1..3 loop
    delete from public.classes where academic_year_id=year_id and grade=g and class_number>class_counts[g];
    insert into public.classes(workspace_id,academic_year_id,grade,class_number)
      select target,year_id,g,n from generate_series(1,class_counts[g]) n on conflict do nothing;
  end loop;
  insert into public.activity_log(workspace_id,actor_id,action,label) values(target,auth.uid(),'save',school_year||'학년도 설정 저장');
  return year_id;
end $$;
create function public.save_academic_year(target uuid, school_year integer, expected_version integer, terms jsonb, class_counts integer[]) returns uuid
language sql security invoker set search_path = '' as $$ select private.save_academic_year(target,school_year,expected_version,terms,class_counts) $$;

create function private.validate_event() returns trigger language plpgsql set search_path = '' as $$
declare y integer;
begin
  select year into y from public.academic_years where id=new.academic_year_id and workspace_id=new.workspace_id;
  if y is null or new.start_date<make_date(y,3,1) or new.end_date>=make_date(y+1,3,1) then raise exception '일정은 선택한 학년도(3월~다음 해 2월)에 속해야 합니다.'; end if;
  if tg_op='UPDATE' then
    if new.created_by<>old.created_by or new.academic_year_id<>old.academic_year_id then raise exception '일정 소유 정보는 변경할 수 없습니다.'; end if;
    new.version:=old.version+1;
  else new.created_by:=auth.uid(); new.version:=1;
  end if;
  new.updated_at:=now(); return new;
end $$;
create trigger validate_event before insert or update on public.events for each row execute function private.validate_event();
create function private.log_event_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_op='DELETE' then
    insert into public.activity_log(workspace_id,actor_id,action,label) values(old.workspace_id,auth.uid(),'delete',old.title||' · 일정 삭제');
  else
    insert into public.activity_log(workspace_id,actor_id,action,label) values(new.workspace_id,auth.uid(),lower(tg_op),new.title||' · 일정 저장');
  end if;
  return null;
end $$;
create trigger log_event_change after insert or update or delete on public.events for each row execute function private.log_event_change();

create function private.save_curriculum(target_plan uuid, expected_version integer, entries jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare target uuid; current_version integer;
begin
  select workspace_id,version into target,current_version from public.curriculum_plans where id=target_plan for update;
  if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '편집 권한이 없습니다.' using errcode='42501'; end if;
  if current_version is distinct from expected_version then raise exception '다른 사용자가 편성표를 저장했습니다. 새로고침 후 다시 입력해 주세요.'; end if;
  if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>1800 then raise exception '편성표 입력 형식을 확인해 주세요.'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e where
    not (e ?& array['subject_id','grade','semester','hours'])
    or (e->>'hours') is null or (e->>'hours') !~ '^[0-9]+$'
    or not exists(select 1 from public.subjects s where s.id=(e->>'subject_id')::uuid and s.workspace_id=target)) then raise exception '과목 또는 시수 입력을 확인해 주세요.'; end if;
  delete from public.curriculum_hours where plan_id=target_plan;
  insert into public.curriculum_hours(workspace_id,plan_id,subject_id,grade,semester,hours)
  select target,target_plan,(e->>'subject_id')::uuid,(e->>'grade')::smallint,(e->>'semester')::smallint,(e->>'hours')::integer from jsonb_array_elements(entries) e;
  update public.curriculum_plans set version=version+1,updated_at=now() where id=target_plan;
  insert into public.activity_log(workspace_id,actor_id,action,label) select target,auth.uid(),'save',cohort_year||'학년도 입학생 편성표 저장' from public.curriculum_plans where id=target_plan;
  return current_version+1;
end $$;
create function public.save_curriculum(target_plan uuid, expected_version integer, entries jsonb) returns integer
language sql security invoker set search_path = '' as $$ select private.save_curriculum(target_plan,expected_version,entries) $$;

-- Explicit object privileges. No anonymous school data access.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update(display_name,default_workspace_id) on public.profiles to authenticated;
grant update(name) on public.workspaces to authenticated;
grant update(region) on public.schools to authenticated;
grant insert,update,delete on public.events to authenticated;
grant insert on public.subject_groups,public.subjects,public.curriculum_plans to authenticated;

alter table public.profiles enable row level security;
create policy profile_own on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using (id=(select auth.uid())) with check(id=(select auth.uid()));
alter table public.workspaces enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using ((select private.workspace_role(id)) is not null);
create policy workspace_update on public.workspaces for update to authenticated using ((select private.workspace_role(id))='admin') with check((select private.workspace_role(id))='admin');
alter table public.schools enable row level security;
create policy school_read on public.schools for select to authenticated using ((select private.workspace_role(id)) is not null);
create policy school_update on public.schools for update to authenticated using ((select private.workspace_role(id))='admin') with check((select private.workspace_role(id))='admin');
alter table public.workspace_members enable row level security;
create policy membership_read on public.workspace_members for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
alter table public.invitations enable row level security;
create policy invite_admin_read on public.invitations for select to authenticated using ((select private.workspace_role(workspace_id))='admin');

do $$ declare t text; begin
  foreach t in array array['academic_years','semesters','classes','events','subject_groups','subjects','curriculum_plans','curriculum_hours','activity_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy member_read on public.%I for select to authenticated using ((select private.workspace_role(workspace_id)) is not null)',t);
  end loop;
  foreach t in array array['events','subject_groups','subjects','curriculum_plans'] loop
    execute format('create policy editor_insert on public.%I for insert to authenticated with check ((select private.workspace_role(workspace_id)) in (''admin'',''editor''))',t);
  end loop;
  foreach t in array array['academic_years','semesters','classes','events','subject_groups','subjects','curriculum_plans','curriculum_hours'] loop
    execute format('create trigger scope_record before insert or update on public.%I for each row execute function private.scope_record()',t);
  end loop;
end $$;
create policy event_update on public.events for update to authenticated using ((select private.workspace_role(workspace_id)) in ('admin','editor')) with check ((select private.workspace_role(workspace_id)) in ('admin','editor'));
create policy event_delete on public.events for delete to authenticated using ((select private.workspace_role(workspace_id)) in ('admin','editor'));

revoke execute on all functions in schema private from public,anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function private.workspace_role(uuid) to authenticated;
-- Only explicitly exposed RPC implementations and wrappers are callable.
do $$ declare f record; begin
  for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('private','public') and p.proname in ('create_school','create_invitation','accept_invitation','revoke_invitation','manage_member','list_members','save_academic_year','save_curriculum') loop
    execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);
  end loop;
end $$;
