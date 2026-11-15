-- Editors cannot lock workspace rows through its admin-only UPDATE policy.
-- Resolve and lock the grade scope through an explicitly authorized helper.
create function private.lock_workspace_grade_count(target uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare grade_limit integer;
begin
  if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then
    raise exception '편집 권한이 없습니다.' using errcode='42501';
  end if;
  select case when school_type='초등학교' then 6 else 3 end into grade_limit from public.workspaces where id=target for share;
  if grade_limit is null then raise exception '작업공간을 찾을 수 없습니다.' using errcode='42501'; end if;
  return grade_limit;
end $$;
revoke all on function private.lock_workspace_grade_count(uuid) from public,anon,authenticated;
grant execute on function private.lock_workspace_grade_count(uuid) to authenticated;

create or replace function private.scope_record() returns trigger
language plpgsql security invoker set search_path='' as $$
declare grade_limit integer;
begin
  if tg_op='UPDATE' and new.workspace_id<>old.workspace_id then
    raise exception '작업공간을 변경할 수 없습니다.' using errcode='42501';
  end if;
  grade_limit := private.lock_workspace_grade_count(new.workspace_id);
  new.school_id := (select id from public.schools where id=new.workspace_id);
  if tg_table_name in ('classes','curriculum_hours') then
    if new.grade>grade_limit then raise exception '학교급에 맞는 학년을 선택해 주세요.' using errcode='23514'; end if;
  elsif tg_table_name='events' then
    if exists(select 1 from unnest(new.target_grades) g where g is null or g<1 or g>grade_limit)
      or cardinality(new.target_grades)<>(select count(distinct g) from unnest(new.target_grades) g) then
      raise exception '학교급에 맞는 대상 학년을 중복 없이 선택해 주세요.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
