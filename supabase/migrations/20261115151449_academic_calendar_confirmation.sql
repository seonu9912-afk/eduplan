alter table public.annual_academic_plans
  add column calendar_confirmation jsonb
  check (calendar_confirmation is null or jsonb_typeof(calendar_confirmation) = 'object');

alter policy editor_insert on public.events
  with check ((select private.workspace_role(workspace_id)) = 'admin');
alter policy event_update on public.events
  using ((select private.workspace_role(workspace_id)) = 'admin')
  with check ((select private.workspace_role(workspace_id)) = 'admin');
alter policy event_delete on public.events
  using ((select private.workspace_role(workspace_id)) = 'admin');

create or replace function private.save_semesters(target uuid, year_id uuid, expected_version integer, terms jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare y integer; v integer; a date; b date; c date; d date;
begin
 if private.workspace_role(target) is distinct from 'admin' then
   raise exception '학기 설정은 관리자만 수정할 수 있습니다.' using errcode='42501';
 end if;
 perform private.lock_workspace_grade_count(target);
 select year,version into y,v from public.academic_years where id=year_id and workspace_id=target for update;
 if y is null then raise exception '학년도를 찾을 수 없습니다.' using errcode='42501'; end if;
 if expected_version is distinct from v then raise exception '학기 설정이 변경되었습니다. 새로고침 후 다시 확인해 주세요.'; end if;
 if jsonb_typeof(terms) is distinct from 'array' then raise exception '두 학기 날짜를 입력해 주세요.'; end if;
 if jsonb_array_length(terms)<>2 then raise exception '두 학기 날짜를 입력해 주세요.'; end if;
 a:=(terms->0->>'start_date')::date; b:=(terms->0->>'end_date')::date; c:=(terms->1->>'start_date')::date; d:=(terms->1->>'end_date')::date;
 if a is null or b is null or c is null or d is null or a>b or b>=c or c>d or a<make_date(y,3,1) or d>=make_date(y+1,3,1) then raise exception '학기는 겹칠 수 없으며 학년도 3월~다음 해 2월 안에 있어야 합니다.'; end if;
 insert into public.semesters(workspace_id,academic_year_id,number,start_date,end_date) values (target,year_id,1,a,b),(target,year_id,2,c,d)
 on conflict(academic_year_id,number) do update set start_date=excluded.start_date,end_date=excluded.end_date;
 update public.academic_years set version=version+1 where id=year_id;
 insert into public.activity_log(workspace_id,actor_id,action,label) values(target,auth.uid(),'save',y||'학년도 학사운영 학기 설정');
 return v+1;
end $$;

-- Preserve editors' existing school-work-plan access while guarding the calendar
-- even when a caller uses the older save_annual_plan RPC directly.
create function private.guard_calendar_document() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  work_fields constant text[] := array['business', 'departments', 'workSettings'];
begin
  if auth.uid() is null or private.workspace_role(new.workspace_id) = 'admin' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.document - work_fields is not distinct from old.document - work_fields
        and new.calendar_confirmation is not distinct from old.calendar_confirmation then
      return new;
    end if;
  elsif new.calendar_confirmation is null
    and new.document->'vacations' = '[]'::jsonb
    and new.document->'days' = '{}'::jsonb
    and new.document->'holidays' = '{}'::jsonb
    and new.document->'recurring' = '[]'::jsonb
    and new.document->'allocations' = '[]'::jsonb
    and new.document->'weather' = '{"nx":60,"ny":127,"landCode":"11B00000","tempCode":"11B10101"}'::jsonb
    and jsonb_array_length(new.document->'timetable') = 5 * (
      select case when w.school_type = '초등학교' then 6 else 3 end
      from public.workspaces w where w.id = new.workspace_id
    )
    and jsonb_array_length(new.document->'timetable') = (
      select count(distinct (item->>'grade', item->>'weekday'))
      from jsonb_array_elements(new.document->'timetable') as item
    )
    and not exists (
      select 1 from jsonb_array_elements(new.document->'timetable') as item
      where item->>'start' is distinct from '1' or item->>'end' is distinct from '6'
    ) then
    return new;
  end if;
  raise exception '학사일정은 관리자만 수정할 수 있습니다.' using errcode = '42501';
end $$;
revoke all on function private.guard_calendar_document() from public, anon, authenticated;
create trigger guard_calendar_document
  before insert or update on public.annual_academic_plans
  for each row execute function private.guard_calendar_document();

create function private.confirm_academic_calendar(target uuid, year_id uuid, expected_version integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  confirmed_at timestamptz := statement_timestamp();
begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then
    raise exception '학사일정 확정은 관리자만 가능합니다.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(year_id::text, 2));
  update public.annual_academic_plans a set calendar_confirmation =
    jsonb_build_object(
      'at', confirmed_at,
      'version', a.version,
      'document', a.document,
      'source', jsonb_build_object(
        'grades', (select to_jsonb(array_agg(g)) from generate_series(1,
          case when w.school_type = '초등학교' then 6 else 3 end) g),
        'semesters', (select coalesce(jsonb_agg(to_jsonb(s) order by s.number), '[]')
          from public.semesters s where academic_year_id = year_id and workspace_id = target),
        'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.start_date, e.id), '[]')
          from public.events e where academic_year_id = year_id and workspace_id = target),
        'plans', (select coalesce(jsonb_agg(to_jsonb(p) order by p.cohort_year), '[]')
          from public.curriculum_plans p where workspace_id = target),
        'hours', (select coalesce(jsonb_agg(to_jsonb(h) order by h.plan_id, h.subject_id, h.grade, h.semester), '[]')
          from public.curriculum_hours h join public.curriculum_plans p on p.id = h.plan_id
          where h.workspace_id = target and p.cohort_year = y.year - h.grade + 1),
        'subjects', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]')
          from public.subjects s where workspace_id = target),
        'groups', (select coalesce(jsonb_agg(to_jsonb(g) order by g.id), '[]')
          from public.subject_groups g where workspace_id = target)
      )
    )
    from public.workspaces w, public.academic_years y
    where a.workspace_id = target and a.academic_year_id = year_id
      and a.version = expected_version and w.id = target
      and y.workspace_id = target and y.id = year_id;
  if not found then
    raise exception '저장본이 변경되었습니다. 새로고침 후 다시 확정해 주세요.';
  end if;
  insert into public.activity_log(workspace_id, actor_id, action, label)
    values(target, auth.uid(), 'save', '학사일정 확정');
  return confirmed_at;
end $$;
create function public.confirm_academic_calendar(target uuid, year_id uuid, expected_version integer)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.confirm_academic_calendar(target, year_id, expected_version)
$$;
revoke all on function private.confirm_academic_calendar(uuid, uuid, integer),
  public.confirm_academic_calendar(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function private.confirm_academic_calendar(uuid, uuid, integer),
  public.confirm_academic_calendar(uuid, uuid, integer) to authenticated;
