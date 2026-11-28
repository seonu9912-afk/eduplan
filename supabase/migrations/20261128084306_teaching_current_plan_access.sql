-- Separate current teaching plans from publication snapshots.
create or replace function private.teaching_history_access(target_course uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.teaching_courses c where c.id=target_course
    and (select auth.uid()) is not null and private.workspace_role(c.workspace_id) is not null
    and (c.owner_id=(select auth.uid()) or (c.visibility='workspace' and (
      private.can_plan(c.workspace_id,'assessment') or private.workspace_role(c.workspace_id)='admin'
      or exists(select 1 from public.teaching_course_editors e where e.course_id=c.id and e.user_id=(select auth.uid()))
      or exists(select 1 from public.staff_appointments a where a.id=c.teacher_id and a.workspace_id=c.workspace_id
        and a.academic_year_id=c.academic_year_id and a.user_id=(select auth.uid()))
    )))
  )
$$;
revoke all on function private.teaching_history_access(uuid) from public,anon,authenticated;
grant execute on function private.teaching_history_access(uuid) to authenticated;
alter policy teaching_versions_read on public.teaching_plan_versions using (private.teaching_history_access(course_id));
alter policy teaching_course_editors_read on public.teaching_course_editors using (private.teaching_history_access(course_id));

create or replace function private.teaching_access(target_course uuid,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.teaching_courses c where c.id=target_course
    and (select auth.uid()) is not null and private.workspace_role(c.workspace_id) is not null
    and (c.owner_id=(select auth.uid()) or (c.visibility='workspace' and (
      not writing or private.can_plan(c.workspace_id,'assessment')
    )))
  )
$$;

create or replace function private.assessment_calendar(target uuid,year_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if private.workspace_role(target) is null then raise exception '평가 일정 조회 권한이 없습니다.' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('courseId',c.id,'grade',c.grade,
      'name',item->>'name','start',item->>'start','end',item->>'end',
      'classIds',coalesce((select jsonb_agg(cls.class_id order by cls.class_id) from public.teaching_course_classes cls
        where cls.course_id=c.id and cls.workspace_id=target),'[]'::jsonb))
      order by c.id, assessment->>'semester', item->>'start',item->>'id')
    from public.teaching_courses c
    join public.teaching_plans p on p.course_id=c.id and p.workspace_id=c.workspace_id and p.academic_year_id=c.academic_year_id
    cross join lateral jsonb_array_elements(p.document->'evaluations') assessment
    cross join lateral jsonb_array_elements(assessment->'items') item
    where c.workspace_id=target and c.academic_year_id=year_id and c.visibility='workspace'
      and not c.archived and assessment->>'status'='확정'
  ),'[]'::jsonb);
end $$;

create or replace function private.planning_source_stamp(target uuid,year_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if private.workspace_role(target) is null then raise exception '학교 계획 조회 권한이 없습니다.' using errcode='42501'; end if;
  return md5(jsonb_build_object(
    'draft',case when private.can_plan(target,'calendar') then
      (select version from public.annual_academic_plans where workspace_id=target and academic_year_id=year_id) end,
    'calendar',(select jsonb_agg(id order by id) from public.school_plan_publications
      where workspace_id=target and academic_year_id=year_id and domain='calendar'),
    'staff',(select jsonb_agg(jsonb_build_array(id,version) order by id)
      from public.staff_appointments where workspace_id=target and academic_year_id=year_id),
    'timetable',public.effective_timetables(target,year_id),
    'assessment',private.assessment_calendar(target,year_id)
  )::text);
end $$;
