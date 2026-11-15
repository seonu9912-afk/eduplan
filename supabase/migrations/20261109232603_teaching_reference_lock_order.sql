-- Match subject deletion/settings: lock workspace before the course row.
create or replace function private.refresh_teaching_reference(target_course uuid,expected_version integer) returns integer language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses;ref jsonb; scope_id uuid;
begin
 if not private.teaching_access(target_course,true) then raise exception '이 수업의 편집 권한이 없습니다.' using errcode='42501';end if;
 select workspace_id into scope_id from public.teaching_courses where id=target_course;
 perform private.lock_workspace_grade_count(scope_id);
 select * into c from public.teaching_courses where id=target_course for update;
 if c.version is distinct from expected_version then raise exception '수업이 변경되었습니다. 새로고침해 주세요.';end if;
 ref:=private.teaching_reference(c.workspace_id,c.academic_year_id,c.grade,c.semester,c.subject_id);
 update public.teaching_courses set reference_snapshot=ref,expected_hours=case when ref->'curriculum'->>'amount' is not null then (ref->'curriculum'->>'amount')::numeric*(case when ref->'curriculum'->>'unit'='credits' then 16 else 1 end) else c.expected_hours end,version=version+1,updated_at=now() where id=c.id;
 perform private.teaching_record_revision(c.id,'편성·학사 참고 기준 갱신 (계획 내용 유지)');return c.version+1;
end $$;
