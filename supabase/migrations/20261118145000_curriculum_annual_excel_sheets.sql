-- Additive storage for the teacher's faithful 2026 operating-year A:Z Excel sheet.
-- Independently persists cell overrides so source totals/blanks remain unchanged
-- until an authorized editor explicitly edits a cell. Does not modify curriculum
-- designs, plans, hours, academic calendars or timetables.
create table public.curriculum_annual_excel_sheets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  academic_year integer not null check(academic_year between 2000 and 2100),
  edits jsonb not null default '{}'::jsonb,
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(workspace_id,academic_year),
  constraint curriculum_annual_excel_sheets_edits_check
    check(jsonb_typeof(edits)='object' and octet_length(edits::text)<100000)
);
alter table public.curriculum_annual_excel_sheets enable row level security;
revoke all on public.curriculum_annual_excel_sheets from anon,authenticated;
grant select on public.curriculum_annual_excel_sheets to authenticated;
create policy curriculum_annual_excel_sheets_member_read
  on public.curriculum_annual_excel_sheets
  for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);

create function private.write_curriculum_annual_excel_sheet(
  target uuid, target_year integer, expected_version integer, next_edits jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_row public.curriculum_annual_excel_sheets%rowtype;
  next_version integer;
begin
  if (select auth.uid()) is null
     or coalesce(private.workspace_role(target),'') not in ('admin','editor') then
    raise exception '이 작업공간의 교육과정 편집 권한이 없습니다.' using errcode='42501';
  end if;
  if target_year not between 2000 and 2100 or expected_version is null or expected_version<0
    or jsonb_typeof(next_edits) is distinct from 'object'
    or octet_length(next_edits::text)>99000 then
    raise exception '편성표 또는 저장 버전을 확인해 주세요.';
  end if;
  if exists(select 1 from jsonb_each(next_edits) as e(k,v)
    where e.k !~ '^[A-Za-z][A-Za-z0-9]*:([4-9]|1[0-9]|2[0-6])$'
      or jsonb_typeof(e.v) <> 'string'
      or length(e.v #>> '{}') > 48) then
    raise exception '수정한 셀의 위치 또는 값을 확인해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text||':'||target_year::text,6));
  select * into current_row from public.curriculum_annual_excel_sheets
    where workspace_id=target and academic_year=target_year for update;
  if not found then
    if expected_version<>0 then
      return jsonb_build_object('ok',false,'version',0);
    end if;
    insert into public.curriculum_annual_excel_sheets
      (workspace_id,academic_year,edits,version,updated_by)
    values(target,target_year,next_edits,1,auth.uid());
    next_version:=1;
  else
    if current_row.version<>expected_version then
      return jsonb_build_object('ok',false,'version',current_row.version);
    end if;
    update public.curriculum_annual_excel_sheets
       set edits=next_edits,version=version+1,updated_at=now(),updated_by=auth.uid()
       where workspace_id=target and academic_year=target_year
       returning version into next_version;
  end if;
  return jsonb_build_object('ok',true,'version',next_version);
end $$;
create function public.save_curriculum_annual_excel_sheet(
  target uuid, target_year integer, expected_version integer, next_edits jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.write_curriculum_annual_excel_sheet(target,target_year,expected_version,next_edits)
$$;
revoke all on function private.write_curriculum_annual_excel_sheet(uuid,integer,integer,jsonb),
  public.save_curriculum_annual_excel_sheet(uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function private.write_curriculum_annual_excel_sheet(uuid,integer,integer,jsonb),
  public.save_curriculum_annual_excel_sheet(uuid,integer,integer,jsonb) to authenticated;
