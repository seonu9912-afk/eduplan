-- Grade-specific dates and class exceptions extend the saved JSON format.
-- Previous plans and confirmations are valid without the optional fields.
alter table public.annual_academic_plans drop constraint annual_document_schema;
alter table public.annual_academic_plans add constraint annual_document_schema check (
  extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"vacations":{"maxItems":12,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":60},"start":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"end":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}},"required":["name","start","end"],"additionalProperties":false}},"days":{"type":"object","propertyNames":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"additionalProperties":{"type":"object","properties":{"type":{"type":"string","enum":["instructional","weekend","holiday","vacation","discretionary","swap"]},"name":{"type":"string","maxLength":100},"enabled":{"type":"boolean"},"weekday":{"type":"integer","minimum":1,"maximum":5},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12},"gradePeriods":{"type":"object","propertyNames":{"pattern":"^[1-6]$"},"additionalProperties":{"type":"object","properties":{"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12}},"required":["start","end"],"additionalProperties":false}}},"required":["type","name","enabled","weekday"],"additionalProperties":false}},"holidays":{"type":"object","propertyNames":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"additionalProperties":{"type":"string","maxLength":100}},"timetable":{"maxItems":30,"type":"array","items":{"type":"object","properties":{"grade":{"type":"integer","minimum":1,"maximum":6},"weekday":{"type":"integer","minimum":1,"maximum":5},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12}},"required":["grade","weekday","start","end"],"additionalProperties":false}},"recurring":{"maxItems":300,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":80},"name":{"type":"string","minLength":1,"maxLength":100},"area":{"type":"string","enum":["교과","자율","자율·자치","동아리","진로","봉사","학교자율시간","없음"]},"grade":{"type":"integer","minimum":1,"maximum":6},"semester":{"type":"integer","minimum":1,"maximum":2},"weekday":{"type":"integer","minimum":1,"maximum":5},"exclude":{"maxItems":366,"type":"array","items":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12}},"required":["id","name","area","grade","semester","weekday","exclude","start","end"],"additionalProperties":false}},"allocations":{"maxItems":1500,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":80},"eventId":{"type":"string","maxLength":80},"date":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"title":{"type":"string","minLength":1,"maxLength":100},"department":{"type":"string","maxLength":60},"areas":{"type":"object","propertyNames":{"type":"string","pattern":"^[1-6]$"},"additionalProperties":{"type":"string","enum":["교과","자율","자율·자치","동아리","진로","봉사","학교자율시간","없음"]}},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12},"classId":{"type":"string","format":"uuid","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}},"required":["id","date","title","department","areas","start","end"],"additionalProperties":false}},"departments":{"minItems":1,"maxItems":20,"type":"array","items":{"type":"string","minLength":1,"maxLength":60}},"business":{"maxItems":3000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":80},"date":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"department":{"type":"string","maxLength":60},"kind":{"type":"string","enum":["업무","출장","당직","협의사항"]},"text":{"type":"string","minLength":1,"maxLength":2000},"time":{"type":"string","maxLength":120},"location":{"type":"string","maxLength":120},"participants":{"type":"string","maxLength":120}},"required":["id","date","department","kind","text"],"additionalProperties":false}},"weather":{"type":"object","properties":{"nx":{"type":"integer","minimum":1,"maximum":149},"ny":{"type":"integer","minimum":1,"maximum":253},"landCode":{"type":"string","pattern":"^[A-Z0-9]{8}$"},"tempCode":{"type":"string","pattern":"^[A-Z0-9]{8}$"}},"required":["nx","ny","landCode","tempCode"],"additionalProperties":false},"workSettings":{"type":"object","properties":{"dutyEnabled":{"type":"boolean"}},"required":["dutyEnabled"],"additionalProperties":false}},"required":["vacations","days","holidays","timetable","recurring","allocations","departments","business","weather"],"additionalProperties":false}$schema$::json, document)
);

-- An editor may initialize an empty work plan; the older six-period default
-- remains accepted for preview rollback and existing clients.
create or replace function private.guard_calendar_document() returns trigger
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
    and (new.document->'timetable' = '[]'::jsonb or (
      jsonb_array_length(new.document->'timetable') = 5 * (
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
    ))) then
    return new;
  end if;
  raise exception '학사일정은 관리자만 수정할 수 있습니다.' using errcode = '42501';
end $$;

create function private.validate_academic_exceptions() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  max_grade integer;
  slot jsonb;
  previous_allocations jsonb := '[]'::jsonb;
begin
  select case when w.school_type = '초등학교' then 6 else 3 end into max_grade
  from public.workspaces w where w.id = new.workspace_id;
  if exists (
    select 1 from jsonb_each(new.document->'days') as d
    where (d.value ? 'start') <> (d.value ? 'end')
      or (d.value->>'start')::integer > (d.value->>'end')::integer
  ) or exists (
    select 1 from jsonb_each(new.document->'days') as d
    cross join lateral jsonb_each(d.value->'gradePeriods') as g
    where g.key::integer not between 1 and max_grade
      or (g.value->>'start')::integer > (g.value->>'end')::integer
  ) then
    raise exception '학년과 운영 교시 범위를 확인해 주세요.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    previous_allocations := old.document->'allocations';
  end if;
  for slot in select current.value from jsonb_array_elements(new.document->'allocations') as current
    where current.value ? 'classId' and not exists (
      select 1 from jsonb_array_elements(previous_allocations) as previous
      where previous.value = current.value
    )
  loop
    if not exists (
      select 1 from public.classes c join public.events e
        on e.workspace_id = c.workspace_id and e.academic_year_id = c.academic_year_id
      where c.id::text = slot->>'classId' and e.id::text = slot->>'eventId'
        and c.workspace_id = new.workspace_id and c.academic_year_id = new.academic_year_id
        and (slot->>'date')::date between e.start_date and e.end_date
        and (cardinality(e.target_grades) = 0 or c.grade = any(e.target_grades))
        and slot->'areas' ? c.grade::text
        and not exists (select 1 from jsonb_object_keys(slot->'areas') as grade(key)
          where grade.key <> c.grade::text)
    ) then
      raise exception '행사와 같은 학년도의 대상 학급을 선택해 주세요.' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.validate_academic_exceptions() from public, anon, authenticated;
create trigger validate_academic_exceptions
  before insert or update of document on public.annual_academic_plans
  for each row execute function private.validate_academic_exceptions();

alter table public.annual_academic_plans add column updated_by uuid;
create function private.stamp_annual_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.version = old.version then return new; end if;
    if old.updated_by is not null and (new.history->0->>'version')::integer = old.version then
      new.history := jsonb_set(new.history, '{0,actorId}', to_jsonb(old.updated_by));
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;
revoke all on function private.stamp_annual_history() from public, anon, authenticated;
create trigger stamp_annual_history
  before insert or update of version on public.annual_academic_plans
  for each row execute function private.stamp_annual_history();

-- A confirmation includes the class labels used by its exports.
create or replace function private.confirm_academic_calendar(target uuid, year_id uuid, expected_version integer)
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
        'classes', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.id, 'grade', c.grade, 'class_number', c.class_number) order by c.grade, c.class_number), '[]')
          from public.classes c where c.academic_year_id = year_id and c.workspace_id = target),
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
