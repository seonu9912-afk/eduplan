-- Delete a workspace-wide subject and its hours atomically. Keep direct table
-- deletion unavailable so plan versions and the activity log cannot be skipped.
create function private.delete_subject(target uuid, target_subject uuid, expected_plans jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare subject_name text; current_plans jsonb;
begin
  if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then
    raise exception '편집 권한이 없습니다.' using errcode='42501';
  end if;
  -- Curriculum saves and plan inserts take a shared workspace lock first.
  -- This exclusive lock serializes deletion with both, in the same lock order.
  perform 1 from public.workspaces where id=target for update;
  select name into subject_name from public.subjects where id=target_subject and workspace_id=target for update;
  if subject_name is null then raise exception '과목이 이미 삭제되었거나 이 작업공간에 속하지 않습니다.'; end if;
  if jsonb_typeof(expected_plans) is distinct from 'array' then raise exception '편성표 정보를 확인해 주세요.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version) order by id),'[]') into current_plans
    from public.curriculum_plans where workspace_id=target;
  if current_plans is distinct from (select coalesce(jsonb_agg(e order by e->>'id'),'[]') from jsonb_array_elements(expected_plans) e) then
    raise exception '편성표가 변경되었습니다. 새로고침한 뒤 삭제할 시수를 다시 확인해 주세요.';
  end if;
  delete from public.curriculum_hours where workspace_id=target and subject_id=target_subject;
  delete from public.subjects where workspace_id=target and id=target_subject;
  update public.curriculum_plans set version=version+1,updated_at=now() where workspace_id=target;
  insert into public.activity_log(workspace_id,actor_id,action,label)
    values(target,auth.uid(),'delete',subject_name||' 과목 및 연결된 편성 시수 삭제');
end $$;
create function public.delete_subject(target uuid,target_subject uuid,expected_plans jsonb)
returns void language sql security invoker set search_path='' as $$
  select private.delete_subject(target,target_subject,expected_plans)
$$;
revoke all on function private.delete_subject(uuid,uuid,jsonb),public.delete_subject(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.delete_subject(uuid,uuid,jsonb),public.delete_subject(uuid,uuid,jsonb) to authenticated;
