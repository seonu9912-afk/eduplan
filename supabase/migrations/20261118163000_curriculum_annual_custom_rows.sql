-- Extend the isolated 2026 Excel-reproduction sheet with in-table subject rows.
-- Existing cell overrides and curriculum/timetable data are preserved.
alter table public.curriculum_annual_excel_sheets
  add column if not exists custom_rows jsonb not null default '[]'::jsonb;

alter table public.curriculum_annual_excel_sheets
  add constraint curriculum_annual_excel_custom_rows_check
  check(jsonb_typeof(custom_rows)='array' and octet_length(custom_rows::text)<50000);

create function private.write_curriculum_annual_excel_sheet_v2(
  target uuid, target_year integer, expected_version integer,
  next_edits jsonb, next_custom_rows jsonb
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
    or octet_length(next_edits::text)>99000
    or jsonb_typeof(next_custom_rows) is distinct from 'array'
    or jsonb_array_length(next_custom_rows)>100
    or octet_length(next_custom_rows::text)>49000 then
    raise exception '편성표나 저장 버전의 범위를 확인해 주세요.';
  end if;
  if exists(select 1 from jsonb_each(next_edits) as e(k,v)
    where e.k !~ '^[A-Za-z][A-Za-z0-9]*:([4-9]|1[0-9]|2[0-6])$'
      or jsonb_typeof(e.v) <> 'string'
      or length(e.v #>> '{}') > 48) then
    raise exception '수정한 셀의 위치 또는 값을 확인해 주세요.';
  end if;
  if exists(select 1 from jsonb_array_elements(next_custom_rows) as e(v)
    where jsonb_typeof(e.v)<>'object'
      or (e.v->>'id') !~ '^extra[a-f0-9]{32}$'
      or (e.v->>'afterId') !~ '^[A-Za-z][A-Za-z0-9]*$'
      or (e.v->>'section') not in ('subject','creative','free')
      or length(e.v->>'group')>60 or length(e.v->>'subject')>60
      or nullif(trim(e.v->>'group'),'') is null
      or nullif(trim(e.v->>'subject'),'') is null) then
    raise exception '추가한 과목 정보를 확인해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text||':'||target_year::text,6));
  select * into current_row from public.curriculum_annual_excel_sheets
    where workspace_id=target and academic_year=target_year for update;
  if not found then
    if expected_version<>0 then
      return jsonb_build_object('ok',false,'version',0);
    end if;
    insert into public.curriculum_annual_excel_sheets
      (workspace_id,academic_year,edits,custom_rows,version,updated_by)
    values(target,target_year,next_edits,next_custom_rows,1,auth.uid());
    next_version:=1;
  else
    if current_row.version<>expected_version then
      return jsonb_build_object('ok',false,'version',current_row.version);
    end if;
    update public.curriculum_annual_excel_sheets
       set edits=next_edits,custom_rows=next_custom_rows,version=version+1,
         updated_at=now(),updated_by=auth.uid()
       where workspace_id=target and academic_year=target_year
       returning version into next_version;
  end if;
  return jsonb_build_object('ok',true,'version',next_version);
end $$;
create function public.save_curriculum_annual_excel_sheet_v2(
  target uuid,target_year integer,expected_version integer,next_edits jsonb,next_custom_rows jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.write_curriculum_annual_excel_sheet_v2(
    target,target_year,expected_version,next_edits,next_custom_rows
  )
$$;
revoke all on function private.write_curriculum_annual_excel_sheet_v2(uuid,integer,integer,jsonb,jsonb),
  public.save_curriculum_annual_excel_sheet_v2(uuid,integer,integer,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function private.write_curriculum_annual_excel_sheet_v2(uuid,integer,integer,jsonb,jsonb),
  public.save_curriculum_annual_excel_sheet_v2(uuid,integer,integer,jsonb,jsonb)
  to authenticated;
