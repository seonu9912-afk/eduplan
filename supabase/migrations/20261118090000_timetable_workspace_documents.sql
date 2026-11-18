-- Reintroduce the legacy EduPlan timetable as an additive, school-year scoped document.
-- Existing calendar and curriculum tables are untouched.
create table public.timetable_documents (
  academic_year_id uuid primary key,
  workspace_id uuid not null,
  document jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint timetable_documents_year_workspace_fk
    foreign key (workspace_id, academic_year_id)
    references public.academic_years(workspace_id, id) on delete cascade,
  constraint timetable_documents_json_check
    check (jsonb_typeof(document) = 'object' and octet_length(document::text) < 2400000)
);
create index timetable_documents_workspace_idx on public.timetable_documents(workspace_id);
alter table public.timetable_documents enable row level security;
revoke all on public.timetable_documents from anon, authenticated;
grant select on public.timetable_documents to authenticated;
create policy timetable_documents_member_read on public.timetable_documents
  for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);

-- Transactional compare-and-swap save: edits from different teachers cannot overwrite each other.
create function private.save_timetable_document(
  target uuid, year_id uuid, expected_version integer, next_document jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_doc public.timetable_documents%rowtype;
  next_version integer;
begin
  if auth.uid() is null or coalesce(private.workspace_role(target), '') not in ('admin','editor') then
    raise exception '시간표 편집 권한이 없습니다.' using errcode = '42501';
  end if;
  if expected_version < 0 or expected_version is null then
    raise exception '시간표 버전이 올바르지 않습니다.';
  end if;
  if jsonb_typeof(next_document) is distinct from 'object'
    or octet_length(next_document::text) >= 2400000
    or (next_document->>'year') is null then
    raise exception '시간표 데이터 형식 또는 크기를 확인해 주세요.';
  end if;
  if not exists (
    select 1 from public.academic_years
    where id = year_id and workspace_id = target
      and year = (next_document->>'year')::integer
  ) then
    raise exception '학년도와 작업공간이 일치하지 않습니다.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(year_id::text, 7));
  select * into current_doc from public.timetable_documents
   where academic_year_id = year_id and workspace_id = target for update;
  if not found then
    if expected_version <> 0 then
      return jsonb_build_object('ok', false, 'version', 0);
    end if;
    insert into public.timetable_documents (workspace_id, academic_year_id, document, version, updated_by)
    values (target, year_id, next_document, 1, auth.uid());
    next_version := 1;
  else
    if current_doc.version <> expected_version then
      return jsonb_build_object('ok', false, 'version', current_doc.version);
    end if;
    update public.timetable_documents
      set document = next_document, version = version + 1,
          updated_at = now(), updated_by = auth.uid()
    where academic_year_id = year_id and workspace_id = target
    returning version into next_version;
  end if;
  return jsonb_build_object('ok', true, 'version', next_version);
end $$;
create function public.save_timetable_document(
  target uuid, year_id uuid, expected_version integer, next_document jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.save_timetable_document(target, year_id, expected_version, next_document)
$$;
revoke all on function private.save_timetable_document(uuid,uuid,integer,jsonb),
  public.save_timetable_document(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function private.save_timetable_document(uuid,uuid,integer,jsonb),
  public.save_timetable_document(uuid,uuid,integer,jsonb) to authenticated;
