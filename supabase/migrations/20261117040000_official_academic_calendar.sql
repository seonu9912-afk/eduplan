-- Additive port of the Q1–Q55 editor. Existing plans/events/snapshots are unchanged.
alter table public.events add column target_class_ids uuid[] not null default '{}';

create table public.calendar_item_history (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  academic_year_id uuid not null,
  item_key text not null,
  before_value jsonb,
  after_value jsonb,
  actor_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  operation text not null default '수정',
  foreign key (academic_year_id, workspace_id) references public.academic_years(id, workspace_id) on delete cascade
);
create index calendar_item_history_year on public.calendar_item_history(workspace_id, academic_year_id, id desc);
alter table public.calendar_item_history enable row level security;
revoke all on public.calendar_item_history from anon, authenticated;
grant select on public.calendar_item_history to authenticated;
create policy calendar_history_read on public.calendar_item_history for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);

create function private.validate_calendar_event_classes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'UPDATE' and new.target_class_ids = old.target_class_ids and new.target_grades = old.target_grades then return new; end if;
  if exists(select 1 from unnest(new.target_class_ids) cid where not exists(
    select 1 from public.classes c where c.id=cid and c.workspace_id=new.workspace_id
      and c.academic_year_id=new.academic_year_id
      and (cardinality(new.target_grades)=0 or c.grade=any(new.target_grades))
  )) then raise exception '같은 학년도의 대상 학급을 선택해 주세요.' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function private.validate_calendar_event_classes() from public, anon, authenticated;
create trigger validate_calendar_event_classes before insert or update on public.events
  for each row execute function private.validate_calendar_event_classes();

create function private.save_calendar_changes(target uuid, year_id uuid, changes jsonb, initial_document jsonb, operation text default '수정')
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
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then
    raise exception '학사일정은 관리자만 수정할 수 있습니다.' using errcode='42501';
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
      insert into public.events(id,workspace_id,academic_year_id,title,start_date,end_date,event_type,target_grades,department,description,activity_area,target_class_ids)
      values(event_id,target,year_id,next_value->>'title',(next_value->>'start_date')::date,(next_value->>'end_date')::date,next_value->>'event_type',
        array(select jsonb_array_elements_text(next_value->'target_grades'))::smallint[],next_value->>'department',next_value->>'description',next_value->>'activity_area',
        array(select jsonb_array_elements_text(next_value->'target_class_ids'))::uuid[]);
    else
      update public.events set title=next_value->>'title',start_date=(next_value->>'start_date')::date,end_date=(next_value->>'end_date')::date,
        event_type=next_value->>'event_type',target_grades=array(select jsonb_array_elements_text(next_value->'target_grades'))::smallint[],
        department=next_value->>'department',description=next_value->>'description',activity_area=next_value->>'activity_area',
        target_class_ids=array(select jsonb_array_elements_text(next_value->'target_class_ids'))::uuid[]
      where id=event_id and workspace_id=target and academic_year_id=year_id;
    end if;
  end loop;
  v := private.save_annual_plan(target,year_id,coalesce(saved.version,0),document);
  insert into public.calendar_item_history(workspace_id,academic_year_id,item_key,before_value,after_value,operation)
    select target,year_id,h->>'key',h->'before',h->'after',operation from jsonb_array_elements(history_rows) h
    where h->'before' is distinct from h->'after';
  return jsonb_build_object('ok',true,'version',v);
end $$;
create function public.save_calendar_changes(target uuid, year_id uuid, changes jsonb, initial_document jsonb, operation text default '수정')
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_calendar_changes(target,year_id,changes,initial_document,operation)
$$;
revoke all on function private.save_calendar_changes(uuid,uuid,jsonb,jsonb,text),public.save_calendar_changes(uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function private.save_calendar_changes(uuid,uuid,jsonb,jsonb,text),public.save_calendar_changes(uuid,uuid,jsonb,jsonb,text) to authenticated;
