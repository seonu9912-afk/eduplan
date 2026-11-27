-- School-wide links and public-data connection settings are independent of the academic year.
create function private.valid_external_url(value text) returns boolean
language sql immutable strict set search_path='' as $$
  select char_length(value) <= 2048
    and value ~* '^https?://[^[:space:]/?#@]+([/?#].*)?$'
    and value !~ '[[:space:][:cntrl:]]'
    and strpos(value, chr(92)) = 0;
$$;

create function private.valid_external_resources(value jsonb) returns boolean
language sql immutable strict set search_path='' as $$
  select case when jsonb_typeof(value) <> 'array' then false
    when jsonb_array_length(value) > 5 then false
    else not exists (
      select 1 from jsonb_array_elements(value) as entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry->'name') is distinct from 'string'
        or char_length(btrim(entry->>'name')) not between 1 and 100
        or jsonb_typeof(entry->'url') is distinct from 'string'
        or not private.valid_external_url(entry->>'url')
    ) end;
$$;

create function private.valid_business_resources(document jsonb) returns boolean
language sql immutable strict set search_path='' as $$
  select not exists (
    select 1 from jsonb_path_query(document, '$.business[*].resources') as value
    where not private.valid_external_resources(value)
  );
$$;

revoke all on function private.valid_external_url(text),
  private.valid_external_resources(jsonb), private.valid_business_resources(jsonb)
  from public, anon;
grant execute on function private.valid_external_url(text),
  private.valid_external_resources(jsonb), private.valid_business_resources(jsonb)
  to authenticated;

create table public.school_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  url text not null check (private.valid_external_url(url)),
  category text not null check (category in ('common','school','documents','collection','teaching','other')),
  icon text not null check (icon in ('link','briefcase','school','folder','clipboard','book','globe')),
  position integer not null default 10 check (position between 0 and 9999)
);
create index school_links_order on public.school_links(workspace_id, position, id);
alter table public.school_links enable row level security;
revoke all on public.school_links from public, anon, authenticated;
grant select, insert, delete on public.school_links to authenticated;
grant update(name, url, category, icon, position) on public.school_links to authenticated;
create policy school_links_read on public.school_links for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);
create policy school_links_insert on public.school_links for insert to authenticated
  with check ((select private.workspace_role(workspace_id)) = 'admin');
create policy school_links_update on public.school_links for update to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin')
  with check ((select private.workspace_role(workspace_id)) = 'admin');
create policy school_links_delete on public.school_links for delete to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');

alter table public.schools
  add column neis_office_code text,
  add column neis_school_code text,
  add column road_address text check (char_length(road_address) <= 240),
  add column homepage_url text check (private.valid_external_url(homepage_url)),
  add column foundation_day date,
  add column weather_nx integer,
  add column weather_ny integer,
  add constraint school_neis_pair check (
    (neis_office_code is null and neis_school_code is null)
    or (neis_office_code is not null and neis_school_code is not null
      and neis_office_code ~ '^[A-Z][0-9]{2}$' and neis_school_code ~ '^[0-9]{7}$')
  ),
  add constraint school_weather_pair check (
    (weather_nx is null and weather_ny is null)
    or (weather_nx is not null and weather_ny is not null
      and weather_nx between 1 and 149 and weather_ny between 1 and 253)
  );
grant update(neis_office_code, neis_school_code, road_address, homepage_url, foundation_day, weather_nx, weather_ny)
  on public.schools to authenticated;

alter table public.events add column resources jsonb not null default '[]'
  check (private.valid_external_resources(resources));
alter table public.annual_academic_plans add constraint annual_business_resources
  check (private.valid_business_resources(document));

-- Persist event links in the same validated write as the event and its allocations.
create or replace function private.save_calendar_changes(target uuid, year_id uuid, changes jsonb, initial_document jsonb, operation text default '수정')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  saved public.annual_academic_plans;
  ev public.events;
  document jsonb;
  item jsonb;
  old_value jsonb;
  next_value jsonb;
  old_slots jsonb;
  before_slots jsonb;
  conflicts jsonb := '[]';
  history_rows jsonb := '[]';
  key text;
  kind text;
  event_id uuid;
  y integer;
  v integer;
begin
  if auth.uid() is null or not private.can_plan(target,'calendar') then
    raise exception '학사일정 담당 권한이 필요합니다.' using errcode='42501';
  end if;
  perform private.lock_workspace_grade_count(target);
  select year into y from public.academic_years where id=year_id and workspace_id=target;
  if y is null then raise exception '학년도를 확인해 주세요.' using errcode='42501'; end if;
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) not between 1 and 366
    or length(operation)>40 then raise exception '변경 항목을 확인해 주세요.'; end if;
  if exists(select 1 from jsonb_array_elements(changes) x group by x->>'kind', coalesce(x->>'date',x->>'id','') having count(*)>1)
    then raise exception '같은 항목은 한 번에 저장해 주세요.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(year_id::text,2));
  select * into saved from public.annual_academic_plans where workspace_id=target and academic_year_id=year_id for update;
  document := coalesce(saved.document,initial_document);
  for item in select value from jsonb_array_elements(changes) loop
    kind := item->>'kind';
    if kind='day' then
      key := 'day:'||(item->>'date');
      if (item->>'date')::date < make_date(y,3,1) or (item->>'date')::date >= make_date(y+1,3,1) then raise exception '학년도 안의 날짜를 선택해 주세요.'; end if;
      old_value := coalesce(document->'days'->(item->>'date'),'null');
      next_value := item->'value';
      if old_value is distinct from item->'before' then
        conflicts := conflicts||jsonb_build_array(jsonb_build_object('key',key,'saved',old_value,'incoming',next_value));
      end if;
      if next_value='null'::jsonb then document := jsonb_set(document,'{days}',(document->'days')-(item->>'date'));
      else document := jsonb_set(document,array['days',item->>'date'],next_value); end if;
    elsif kind='holidays' then
      key := 'holidays'; old_value := document->'holidays'; next_value := item->'value';
      if old_value is distinct from item->'before' then conflicts := conflicts||jsonb_build_array(jsonb_build_object('key',key,'saved',old_value,'incoming',next_value)); end if;
      document := jsonb_set(document,'{holidays}',next_value);
    elsif kind='event' then
      event_id := (item->>'id')::uuid; key := 'event:'||event_id;
      select * into ev from public.events where id=event_id and workspace_id=target and academic_year_id=year_id for update;
      select coalesce(jsonb_agg(a order by a->>'id'),'[]') into old_slots from jsonb_array_elements(document->'allocations') a where a->>'eventId'=event_id::text;
      select coalesce(jsonb_agg(a order by a->>'id'),'[]') into before_slots from jsonb_array_elements(item->'beforeAllocations') a;
      old_value := jsonb_build_object('event',case when ev.id is null then null else to_jsonb(ev) end,'allocations',old_slots);
      next_value := jsonb_build_object('event',item->'value','allocations',item->'allocations');
      if coalesce(ev.version,0) is distinct from (item->>'version')::integer or old_slots is distinct from before_slots then
        conflicts := conflicts||jsonb_build_array(jsonb_build_object('key',key,'saved',old_value,'incoming',next_value));
      end if;
      if jsonb_typeof(item->'allocations') is distinct from 'array' or exists(
        select 1 from jsonb_array_elements(item->'allocations') a
        where a->>'eventId' is distinct from event_id::text
          or (a->>'date')::date < make_date(y,3,1) or (a->>'date')::date >= make_date(y+1,3,1)
      ) then raise exception '행사 교시의 연결을 확인해 주세요.'; end if;
      if item->'value' <> 'null'::jsonb and exists (
        select 1 from jsonb_array_elements(item->'allocations') a
        where (a->>'date')::date < (item->'value'->>'start_date')::date
          or (a->>'date')::date > (item->'value'->>'end_date')::date
          or exists(select 1 from jsonb_object_keys(a->'areas') g where not (item->'value'->'target_grades' @> to_jsonb(g::integer)))
      ) then raise exception '배정 날짜와 학년이 행사 대상과 다릅니다.'; end if;
      document := jsonb_set(document,'{allocations}',
        (select coalesce(jsonb_agg(a),'[]') from jsonb_array_elements(document->'allocations') a where a->>'eventId' is distinct from event_id::text)||(item->'allocations'));
    else raise exception '저장 항목의 유형을 확인해 주세요.'; end if;
    history_rows := history_rows||jsonb_build_array(jsonb_build_object('key',key,'before',old_value,'after',next_value));
  end loop;
  -- No writes have happened yet. Every item in a range is checked before applying any.
  if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts); end if;
  for item in select value from jsonb_array_elements(changes) where value->>'kind'='event' loop
    event_id := (item->>'id')::uuid;
    next_value := item->'value';
    if next_value='null'::jsonb then
      if jsonb_array_length(item->'allocations')<>0 then raise exception '삭제 행사에 교시를 배정할 수 없습니다.'; end if;
      delete from public.events where id=event_id and workspace_id=target and academic_year_id=year_id;
    elsif (item->>'version')::integer=0 then
      insert into public.events(id,workspace_id,academic_year_id,title,start_date,end_date,event_type,target_grades,department,description,activity_area,target_class_ids,resources)
      values(event_id,target,year_id,next_value->>'title',(next_value->>'start_date')::date,(next_value->>'end_date')::date,next_value->>'event_type',
        array(select jsonb_array_elements_text(next_value->'target_grades'))::smallint[],next_value->>'department',next_value->>'description',next_value->>'activity_area',
        array(select jsonb_array_elements_text(next_value->'target_class_ids'))::uuid[],coalesce(next_value->'resources','[]'));
    else
      update public.events set title=next_value->>'title',start_date=(next_value->>'start_date')::date,end_date=(next_value->>'end_date')::date,
        event_type=next_value->>'event_type',target_grades=array(select jsonb_array_elements_text(next_value->'target_grades'))::smallint[],
        department=next_value->>'department',description=next_value->>'description',activity_area=next_value->>'activity_area',
        target_class_ids=array(select jsonb_array_elements_text(next_value->'target_class_ids'))::uuid[],
        resources=coalesce(next_value->'resources',resources)
      where id=event_id and workspace_id=target and academic_year_id=year_id;
    end if;
  end loop;
  v := private.save_annual_plan(target,year_id,coalesce(saved.version,0),document);
  insert into public.calendar_item_history(workspace_id,academic_year_id,item_key,before_value,after_value,operation)
    select target,year_id,h->>'key',h->'before',h->'after',operation from jsonb_array_elements(history_rows) h
    where h->'before' is distinct from h->'after';
  return jsonb_build_object('ok',true,'version',v);
end $$;
