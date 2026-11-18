-- Additive ordering metadata for spreadsheet-like subject rows.
alter table public.subjects add column if not exists curriculum_position integer;

create or replace function public.reorder_curriculum_subjects_v4(
  p_workspace uuid,p_group uuid,p_order uuid[]
) returns integer language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
  v_position integer:=0;
  v_total integer;
begin
  if v_user is null or not exists(select 1 from public.workspace_members m
    where m.workspace_id=p_workspace and m.user_id=v_user and m.role in ('admin','editor'))
  then raise exception '과목 순서 변경 권한이 없습니다.' using errcode='42501'; end if;
  if not exists(select 1 from public.subject_groups g where g.id=p_group and g.workspace_id=p_workspace)
  then raise exception '교과군을 찾지 못했습니다.'; end if;
  if array_length(p_order,1) is null or array_length(p_order,1)>250
   or exists(select 1 from unnest(p_order) x group by x having count(*)>1)
  then raise exception '중복되거나 비어 있는 과목 순서입니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||':subjectgroup:'||p_group::text,13));
  select count(*) into v_total from public.subjects s
    where s.workspace_id=p_workspace and s.group_id=p_group;
  if v_total<>cardinality(p_order) or exists(
    select 1 from unnest(p_order) u
    where not exists(select 1 from public.subjects s
      where s.id=u and s.workspace_id=p_workspace and s.group_id=p_group)
  ) then raise exception '등록된 교과군 과목과 순서가 일치하지 않습니다.'; end if;
  foreach v_id in array p_order loop
    v_position:=v_position+1;
    update public.subjects
      set curriculum_position=v_position
      where id=v_id and workspace_id=p_workspace and group_id=p_group;
  end loop;
  return v_position;
end $$;
revoke all on function public.reorder_curriculum_subjects_v4(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.reorder_curriculum_subjects_v4(uuid,uuid,uuid[]) to authenticated;
