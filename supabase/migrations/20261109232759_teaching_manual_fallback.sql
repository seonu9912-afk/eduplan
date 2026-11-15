-- Preserve plans after subject deletion, allowing a new manual hours baseline.
create or replace function private.save_teaching_course(target uuid,target_course uuid,expected_version integer,settings jsonb,copy_from uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses; cid uuid; yr uuid; g integer; sem integer; subj uuid; ref jsonb; doc jsonb; limit_grade integer; title text; initial_hours numeric;
begin
limit_grade:=private.lock_workspace_grade_count(target);
if settings is null or not extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"workspace_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"academic_year_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"grade":{"type":"integer","minimum":1,"maximum":6},"semester":{"type":"integer","minimum":0,"maximum":2},"subject_id":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"subject_name":{"type":"string","minLength":1,"maxLength":120},"teacher_name":{"type":"string","minLength":1,"maxLength":80},"class_ids":{"maxItems":30,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"visibility":{"type":"string","enum":["private","workspace"]},"manual_hours":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]}},"required":["workspace_id","academic_year_id","grade","semester","subject_id","subject_name","teacher_name","class_ids","visibility","manual_hours"],"additionalProperties":false}$schema$::json,settings) or settings->>'workspace_id' is distinct from target::text then raise exception '수업 설정을 확인해 주세요.';end if;
 yr:=(settings->>'academic_year_id')::uuid;g:=(settings->>'grade')::integer;sem:=(settings->>'semester')::integer;subj:=(settings->>'subject_id')::uuid;title:=trim(settings->>'subject_name');
 if g>limit_grade then raise exception '학교급에 맞는 학년을 선택해 주세요.';end if;
 if not exists(select 1 from public.academic_years where id=yr and workspace_id=target) then raise exception '학년도 범위를 확인해 주세요.' using errcode='42501';end if;
 if subj is not null then select name into title from public.subjects where id=subj and workspace_id=target;if title is null then raise exception '과목 범위를 확인해 주세요.' using errcode='42501';end if;end if;
 if exists(select 1 from jsonb_array_elements_text(settings->'class_ids') v where not exists(select 1 from public.classes cl where cl.id=v.value::uuid and cl.workspace_id=target and cl.academic_year_id=yr and cl.grade=g)) then raise exception '같은 학년도·학년의 학급을 선택해 주세요.' using errcode='42501';end if;
 if target_course is null then
  if expected_version is distinct from 0 then raise exception '새 수업 버전을 확인해 주세요.';end if;
  ref:=private.teaching_reference(target,yr,g,sem,subj);
  initial_hours:=case when ref->'curriculum'->>'amount' is not null then (ref->'curriculum'->>'amount')::numeric*(case when ref->'curriculum'->>'unit'='credits' then 16 else 1 end) else (settings->>'manual_hours')::numeric end;
  doc:=jsonb_build_object('lesson_status','작성 중','units','[]'::jsonb,'evaluations',(select jsonb_agg(jsonb_build_object('semester',n,'mode','weighted','status','작성 중','notes','','items','[]'::jsonb) order by n) from generate_series(1,2) n where sem=0 or n=sem));
  if copy_from is not null then
   -- Serialize with visibility/content updates before checking the source.
   perform 1 from public.teaching_courses where id=copy_from for share;
   if not private.teaching_access(copy_from,false) or not exists(select 1 from public.teaching_courses where id=copy_from and workspace_id=target and semester=sem) then raise exception '같은 작업공간·학기 범위의 계획만 복사할 수 있습니다.' using errcode='42501';end if;
   select private.teaching_as_draft(document) into doc from public.teaching_plans where course_id=copy_from;
  end if;
  perform private.validate_teaching_document(doc,target,sem);
  insert into public.teaching_courses(workspace_id,academic_year_id,grade,semester,subject_id,subject_name,teacher_name,visibility,manual_hours,expected_hours,reference_snapshot)
  values(target,yr,g,sem,subj,title,settings->>'teacher_name',settings->>'visibility',(settings->>'manual_hours')::numeric,initial_hours,ref) returning id into cid;
  insert into public.teaching_plans(course_id,workspace_id,academic_year_id,document) values(cid,target,yr,doc);
  perform private.teaching_replace_links(cid,target,doc);
 else
  if not private.teaching_access(target_course,true) then raise exception '이 수업의 편집 권한이 없습니다.' using errcode='42501';end if;
  select * into c from public.teaching_courses where id=target_course and workspace_id=target for update;
  if c.id is null or c.version is distinct from expected_version then raise exception '수업이 변경되었습니다. 새로고침 후 다시 확인해 주세요.';end if;
  if c.academic_year_id<>yr or c.grade<>g or c.semester<>sem or c.subject_id is distinct from subj then raise exception '학년도·학년·학기·연결 과목 변경은 새 수업에 계획을 복사해 주세요.';end if;
  cid:=c.id;
  -- Manual hours are available when the current source has no hours, even if
  -- the saved baseline still records the earlier curriculum value.
  ref:=private.teaching_reference(target,yr,g,sem,subj);
  update public.teaching_courses set subject_name=title,teacher_name=settings->>'teacher_name',visibility=settings->>'visibility',manual_hours=(settings->>'manual_hours')::numeric,
   expected_hours=case when ref->'curriculum'->>'amount' is null then (settings->>'manual_hours')::numeric else c.expected_hours end,version=version+1,updated_at=now() where id=cid;
 end if;
 delete from public.teaching_course_classes where course_id=cid;
 insert into public.teaching_course_classes(course_id,workspace_id,academic_year_id,grade,class_id) select distinct cid,target,yr,g,value::uuid from jsonb_array_elements_text(settings->'class_ids');
 perform private.teaching_record_revision(cid,case when target_course is null then case when copy_from is null then '수업 생성' else '계획 복사' end else '수업 설정 변경' end);
 return cid;
end $$;
