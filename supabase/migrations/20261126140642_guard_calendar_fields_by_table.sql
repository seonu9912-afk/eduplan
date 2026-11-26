-- The trigger is shared with tables that have no calendar_confirmation or document column.
-- A separate PL/pgSQL branch keeps those field references out of other tables' plans.
create or replace function private.guard_planning_domain() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  target uuid;
  area text := tg_argv[0];
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  target := coalesce(new.workspace_id, old.workspace_id);

  if tg_table_name = 'annual_academic_plans' then
    if tg_op = 'INSERT' and private.can_plan(target, 'plans') then
      return new;
    end if;
    if tg_op = 'UPDATE' then
      if new.calendar_confirmation is not distinct from old.calendar_confirmation
        and (new.document - 'business' - 'departments' - 'workSettings')
          = (old.document - 'business' - 'departments' - 'workSettings') then
        area := 'plans';
      end if;
    end if;
  end if;

  if not private.can_plan(target, area) then
    raise exception '이 계획의 업무별 수정 권한이 없습니다.' using errcode='42501';
  end if;
  return coalesce(new, old);
end
$$;
