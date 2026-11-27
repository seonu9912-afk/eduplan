-- External calendar feeds are opt-in, token-scoped, and never expose raw publications.
create table private.calendar_feed_schools (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false
);
create table private.calendar_feed_tokens (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  token_hash bytea not null unique,
  include_calendar boolean not null,
  include_plans boolean not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id,academic_year_id),
  check(include_calendar or include_plans)
);
alter table private.calendar_feed_schools enable row level security;
alter table private.calendar_feed_tokens enable row level security;
revoke all on private.calendar_feed_schools,private.calendar_feed_tokens from public,anon,authenticated;

create function private.calendar_feed_manage(target uuid, year_id uuid, op text, hash_value text, calendar boolean, plans boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role text; allowed boolean; active boolean;
begin
  select role into member_role from public.workspace_members where workspace_id=target and user_id=auth.uid();
  if auth.uid() is null or member_role is null or not exists(select 1 from public.schools where id=target)
    or not exists(select 1 from public.academic_years where id=year_id and workspace_id=target) then
    raise exception '접근 권한이 없습니다.' using errcode='42501';
  end if;
  if op in ('enable','disable') then
    if member_role<>'admin' then raise exception '학교 관리자만 설정할 수 있습니다.' using errcode='42501'; end if;
    insert into private.calendar_feed_schools(workspace_id,enabled) values(target,op='enable')
      on conflict(workspace_id) do update set enabled=excluded.enabled;
    if op='disable' then delete from private.calendar_feed_tokens where workspace_id=target; end if;
  end if;
  select coalesce((select enabled from private.calendar_feed_schools where workspace_id=target),false) into allowed;
  if op='issue' then
    if not allowed or not (calendar or plans) or hash_value is null or hash_value !~ '^[0-9a-f]{64}$' then
      raise exception '학교 외부 연동 설정과 구독 범위를 확인하세요.' using errcode='22023';
    end if;
    insert into private.calendar_feed_tokens(workspace_id,user_id,academic_year_id,token_hash,include_calendar,include_plans)
      values(target,auth.uid(),year_id,decode(hash_value,'hex'),calendar,plans)
      on conflict(workspace_id,user_id,academic_year_id) do update set token_hash=excluded.token_hash,include_calendar=excluded.include_calendar,include_plans=excluded.include_plans,created_at=now();
  elsif op='revoke' then
    delete from private.calendar_feed_tokens where workspace_id=target and user_id=auth.uid() and academic_year_id=year_id;
  elsif op not in ('status','enable','disable') then raise exception '잘못된 요청입니다.'; end if;
  select exists(select 1 from private.calendar_feed_tokens where workspace_id=target and user_id=auth.uid() and academic_year_id=year_id) into active;
  return jsonb_build_object('enabled',allowed,'active',active,'admin',member_role='admin');
end $$;
create function public.calendar_feed_manage(target uuid,year_id uuid,op text,hash_value text,calendar boolean,plans boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select private.calendar_feed_manage(target,year_id,op,hash_value,calendar,plans)
$$;

create function private.calendar_feed_read(token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s private.calendar_feed_tokens; school_year integer; school_name text; items jsonb;
begin
  if token is null or token !~ '^[0-9a-f]{64}$' then return null; end if;
  select t.* into s from private.calendar_feed_tokens t
    join private.calendar_feed_schools f on f.workspace_id=t.workspace_id and f.enabled
    join public.workspace_members m on m.workspace_id=t.workspace_id and m.user_id=t.user_id
    where t.token_hash=sha256(convert_to(token,'UTF8'));
  if not found then return null; end if;
  select y.year,w.name into school_year,school_name from public.academic_years y join public.workspaces w on w.id=y.workspace_id
    where y.id=s.academic_year_id and y.workspace_id=s.workspace_id;
  if school_year is null then return null; end if;
  with versions as (
    select distinct on(domain,starts_on) domain,starts_on,payload
    from public.school_plan_publications
    where workspace_id=s.workspace_id and academic_year_id=s.academic_year_id
      and ((domain='calendar' and s.include_calendar) or (domain='plans' and s.include_plans))
    order by domain,starts_on,source_version desc,published_at desc
  ), spans as (
    select *,lead(starts_on,1,make_date(school_year+1,3,1)) over(partition by domain order by starts_on) as until_date from versions
  ), raw as (
    select 'calendar:event:'||(e->>'id') as id,e->>'title' as title,(e->>'start_date')::date as first_day,(e->>'end_date')::date as last_day,starts_on,until_date from spans cross join lateral jsonb_array_elements(coalesce(payload->'events','[]')) e where domain='calendar'
    union all
    select 'calendar:vacation:'||(e->>'name'),e->>'name',(e->>'start')::date,(e->>'end')::date,starts_on,until_date from spans cross join lateral jsonb_array_elements(coalesce(payload->'document'->'vacations','[]')) e where domain='calendar'
    union all
    select 'calendar:holiday:'||e.key,e.value,e.key::date,e.key::date,starts_on,until_date from spans cross join lateral jsonb_each_text(coalesce(payload->'document'->'holidays','{}')) e where domain='calendar'
    union all
    select 'calendar:day:'||e.key,coalesce(nullif(e.value->>'name',''),case when e.value->>'type'='swap' then '대체 요일 운영' else '재량휴업일' end),e.key::date,e.key::date,starts_on,until_date from spans cross join lateral jsonb_each(coalesce(payload->'document'->'days','{}')) e where domain='calendar' and e.value->>'type' in ('discretionary','swap') and coalesce(e.value->>'enabled','true')='true'
    union all
    select 'calendar:term-start:'||(e->>'number'),(e->>'number')||'학기 시작',(e->>'start_date')::date,(e->>'start_date')::date,starts_on,until_date from spans cross join lateral jsonb_array_elements(coalesce(payload->'semesters','[]')) e where domain='calendar'
    union all
    select 'calendar:term-end:'||(e->>'number'),(e->>'number')||'학기 종료',(e->>'end_date')::date,(e->>'end_date')::date,starts_on,until_date from spans cross join lateral jsonb_array_elements(coalesce(payload->'semesters','[]')) e where domain='calendar'
    union all
    select 'plans:'||(e->>'id'),e->>'text',(e->>'date')::date,(e->>'date')::date,starts_on,until_date from spans cross join lateral jsonb_array_elements(coalesce(payload->'business','[]')) e where domain='plans' and e->>'kind'='업무'
  ), clipped as (
    select id,title,greatest(first_day,starts_on,make_date(school_year,3,1)) as first_day,least(last_day,until_date-1,make_date(school_year+1,3,1)-1) as last_day from raw
    where id is not null and title is not null and first_day is not null and last_day is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'start',first_day,'end',last_day) order by first_day,id),'[]') into items
  from clipped where first_day<=last_day;
  return jsonb_build_object('name',school_name||' '||school_year||'학년도','items',items);
end $$;
create function public.calendar_feed_read(token text) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.calendar_feed_read(token)
$$;
revoke all on function private.calendar_feed_manage(uuid,uuid,text,text,boolean,boolean),public.calendar_feed_manage(uuid,uuid,text,text,boolean,boolean),private.calendar_feed_read(text),public.calendar_feed_read(text) from public,anon,authenticated;
grant execute on function private.calendar_feed_manage(uuid,uuid,text,text,boolean,boolean),public.calendar_feed_manage(uuid,uuid,text,text,boolean,boolean) to authenticated;
grant execute on function private.calendar_feed_read(text),public.calendar_feed_read(text) to anon,authenticated;
