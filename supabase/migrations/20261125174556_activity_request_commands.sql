create function private.planning_source_stamp(target uuid,year_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.workspace_role(target) is null then raise exception '학교 계획 조회 권한이 없습니다.'; end if;
 return md5(jsonb_build_object('annual',(select version from public.annual_academic_plans where workspace_id=target and academic_year_id=year_id),
 'events',(select jsonb_agg(jsonb_build_array(id,version) order by id) from public.events where workspace_id=target and academic_year_id=year_id),
 'terms',(select jsonb_agg(to_jsonb(s) order by number) from public.semesters s where workspace_id=target and academic_year_id=year_id),
 'classes',(select jsonb_agg(to_jsonb(s) order by id) from public.classes s where workspace_id=target and academic_year_id=year_id),
 'staff',(select jsonb_agg(jsonb_build_array(id,version) order by id) from public.staff_appointments where workspace_id=target and academic_year_id=year_id),
 'timetable',(select jsonb_agg(to_jsonb(s) order by starts_on) from public.timetable_effective_versions s where workspace_id=target and academic_year_id=year_id),
 'bells',(select jsonb_agg(to_jsonb(s) order by id) from public.bell_applications s where workspace_id=target and academic_year_id=year_id),
 'assessment',(select jsonb_agg(jsonb_build_array(id,version) order by id) from public.teaching_courses where workspace_id=target and academic_year_id=year_id))::text);
end $$;
create function public.planning_source_stamp(target uuid,year_id uuid) returns text language sql stable security invoker set search_path='' as $$select private.planning_source_stamp(target,year_id)$$;
create function private.assessment_calendar(target uuid,year_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.workspace_role(target) is null then raise exception '평가 일정 조회 권한이 없습니다.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('courseId',c.id,'grade',c.grade,'name',a->>'name','start',a->>'start','end',a->>'end','classIds',coalesce((select jsonb_agg(class_id) from public.teaching_course_classes where course_id=c.id),'[]')))
 from public.teaching_courses c join public.teaching_plans p on p.course_id=c.id cross join lateral jsonb_array_elements(p.document->'evaluations') ev cross join lateral jsonb_array_elements(ev->'items') a
 where c.workspace_id=target and c.academic_year_id=year_id and not c.archived and ev->>'status'='확정'),'[]');
end $$;
create function public.assessment_calendar(target uuid,year_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.assessment_calendar(target,year_id)$$;
revoke all on function private.planning_source_stamp(uuid,uuid),public.planning_source_stamp(uuid,uuid) from public,anon,authenticated;
grant execute on function private.planning_source_stamp(uuid,uuid),public.planning_source_stamp(uuid,uuid) to authenticated;
revoke all on function private.assessment_calendar(uuid,uuid),public.assessment_calendar(uuid,uuid) from public,anon,authenticated;
grant execute on function private.assessment_calendar(uuid,uuid),public.assessment_calendar(uuid,uuid) to authenticated;
