alter table public.teaching_courses add column teacher_id uuid;
alter table public.teaching_courses add column link_reason text not null default '' check(length(link_reason)<=500);
alter table public.teaching_courses add foreign key(workspace_id,academic_year_id,teacher_id) references public.staff_appointments(workspace_id,academic_year_id,id);
create index teaching_teacher_idx on public.teaching_courses(workspace_id,academic_year_id,teacher_id);
-- Preserve the existing validated implementation; change only the specified contract/guard.
do $patch$
declare definition text:=pg_get_functiondef('private.save_teaching_course(uuid,uuid,integer,jsonb,uuid)'::regprocedure);schema_text text;
begin
 schema_text:=(regexp_match(definition,$re$\$schema\$(.*?)\$schema\$$re$,'s'))[1];
 if schema_text is null then raise exception 'Expected course schema not found';end if;
 definition:=replace(definition,schema_text,jsonb_set(schema_text::jsonb,'{properties}',(schema_text::jsonb->'properties')||$props${"teacher_id":{"type":["string","null"],"format":"uuid"},"link_reason":{"type":"string","maxLength":500}}$props$::jsonb)::text);
 if strpos(definition,$old0$ yr:=(settings->>'academic_year_id')::uuid;g:=(settings->>'grade')::integer;sem:=(settings->>'semester')::integer;subj:=(settings->>'subject_id')::uuid;title:=trim(settings->>'subject_name');
$old0$)=0 then raise exception 'Existing save_teaching_course contract differs; review before migrating';end if;
 definition:=replace(definition,$old0$ yr:=(settings->>'academic_year_id')::uuid;g:=(settings->>'grade')::integer;sem:=(settings->>'semester')::integer;subj:=(settings->>'subject_id')::uuid;title:=trim(settings->>'subject_name');
$old0$,$new0$ yr:=(settings->>'academic_year_id')::uuid;g:=(settings->>'grade')::integer;sem:=(settings->>'semester')::integer;subj:=(settings->>'subject_id')::uuid;title:=trim(settings->>'subject_name');
 if subj is null and length(btrim(coalesce(settings->>'link_reason','')))=0 and target_course is null then raise exception '공통 과목을 선택하거나 특색 교육과정의 미연결 사유를 입력하세요.'; end if;
 if subj is not null then select name into title from public.subjects where workspace_id=target and id=subj; end if;
 if nullif(settings->>'teacher_id','') is not null then
  if not exists(select 1 from public.staff_appointments where workspace_id=target and academic_year_id=yr and id=(settings->>'teacher_id')::uuid) then raise exception '같은 학년도의 교원을 연결하세요.'; end if;
  settings:=settings||jsonb_build_object('teacher_name',(select display_name from public.staff_appointments where id=(settings->>'teacher_id')::uuid));
 elsif length(btrim(coalesce(settings->>'link_reason','')))=0 and target_course is null then raise exception '담당 교원을 연결하거나 미연결 사유를 입력하세요.'; end if;

$new0$);
 if strpos(definition,$old1$  perform private.validate_teaching_document(doc,target,sem);
  insert into public.teaching_courses(workspace_id,academic_year_id,grade,semester,subject_id,subject_name,teacher_name,visibility,manual_hours,expected_hours,reference_snapshot)
  values(target,yr,g,sem,subj,title,settings->>'teacher_name',settings->>'visibility',(settings->>'manual_hours')::numeric,initial_hours,ref) returning id into cid;
$old1$)=0 then raise exception 'Existing save_teaching_course contract differs; review before migrating';end if;
 definition:=replace(definition,$old1$  perform private.validate_teaching_document(doc,target,sem);
  insert into public.teaching_courses(workspace_id,academic_year_id,grade,semester,subject_id,subject_name,teacher_name,visibility,manual_hours,expected_hours,reference_snapshot)
  values(target,yr,g,sem,subj,title,settings->>'teacher_name',settings->>'visibility',(settings->>'manual_hours')::numeric,initial_hours,ref) returning id into cid;
$old1$,$new1$  perform private.validate_teaching_document(doc,target,sem);
  insert into public.teaching_courses(workspace_id,academic_year_id,grade,semester,subject_id,subject_name,teacher_name,visibility,manual_hours,expected_hours,reference_snapshot,teacher_id,link_reason)
  values(target,yr,g,sem,subj,title,settings->>'teacher_name',settings->>'visibility',(settings->>'manual_hours')::numeric,initial_hours,ref,(settings->>'teacher_id')::uuid,coalesce(settings->>'link_reason','')) returning id into cid;
$new1$);
 if strpos(definition,$old2$  if c.id is null or c.version is distinct from expected_version then raise exception '수업이 변경되었습니다. 새로고침 후 다시 확인해 주세요.';end if;
  if c.academic_year_id<>yr or c.grade<>g or c.semester<>sem or c.subject_id is distinct from subj then raise exception '학년도·학년·학기·연결 과목 변경은 새 수업에 계획을 복사해 주세요.';end if;
$old2$)=0 then raise exception 'Existing save_teaching_course contract differs; review before migrating';end if;
 definition:=replace(definition,$old2$  if c.id is null or c.version is distinct from expected_version then raise exception '수업이 변경되었습니다. 새로고침 후 다시 확인해 주세요.';end if;
  if c.academic_year_id<>yr or c.grade<>g or c.semester<>sem or c.subject_id is distinct from subj then raise exception '학년도·학년·학기·연결 과목 변경은 새 수업에 계획을 복사해 주세요.';end if;
$old2$,$new2$  if c.id is null or c.version is distinct from expected_version then raise exception '수업이 변경되었습니다. 새로고침 후 다시 확인해 주세요.';end if;
  if c.academic_year_id<>yr or c.grade<>g or c.semester<>sem or (c.subject_id is not null and c.subject_id is distinct from subj) then raise exception '학년도·학년·학기·연결 과목 변경은 새 수업에 계획을 복사해 주세요.';end if;
  if c.subject_id is distinct from subj and exists(select 1 from public.teaching_plans where course_id=c.id and (document->>'lesson_status'='확정' or exists(select 1 from jsonb_array_elements(document->'evaluations') e where e->>'status'='확정'))) then raise exception '확정본의 과목 연결은 변경할 수 없습니다. 새 수업에 계획을 복사하세요.'; end if;
$new2$);
 if strpos(definition,$old3$  ref:=private.teaching_reference(target,yr,g,sem,subj);
  update public.teaching_courses set subject_name=title,teacher_name=settings->>'teacher_name',visibility=settings->>'visibility',manual_hours=(settings->>'manual_hours')::numeric,
   expected_hours=case when ref->'curriculum'->>'amount' is null then (settings->>'manual_hours')::numeric else c.expected_hours end,version=version+1,updated_at=now() where id=cid;
$old3$)=0 then raise exception 'Existing save_teaching_course contract differs; review before migrating';end if;
 definition:=replace(definition,$old3$  ref:=private.teaching_reference(target,yr,g,sem,subj);
  update public.teaching_courses set subject_name=title,teacher_name=settings->>'teacher_name',visibility=settings->>'visibility',manual_hours=(settings->>'manual_hours')::numeric,
   expected_hours=case when ref->'curriculum'->>'amount' is null then (settings->>'manual_hours')::numeric else c.expected_hours end,version=version+1,updated_at=now() where id=cid;
$old3$,$new3$  ref:=private.teaching_reference(target,yr,g,sem,subj);
  update public.teaching_courses set subject_id=subj,teacher_id=case when settings ? 'teacher_id' then (settings->>'teacher_id')::uuid else c.teacher_id end,link_reason=coalesce(settings->>'link_reason',c.link_reason),subject_name=title,teacher_name=settings->>'teacher_name',visibility=settings->>'visibility',manual_hours=(settings->>'manual_hours')::numeric,
   expected_hours=case when ref->'curriculum'->>'amount' is null then (settings->>'manual_hours')::numeric when c.subject_id is distinct from subj then (ref->'curriculum'->>'amount')::numeric*(case when ref->'curriculum'->>'unit'='credits' then 16 else 1 end) else c.expected_hours end,version=version+1,updated_at=now() where id=cid;
$new3$);
 execute definition;
end $patch$;

