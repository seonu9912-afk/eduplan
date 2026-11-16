-- Assign existing workspace editors to a shared plan. Course settings and
-- archive/restore still use the existing owner/administrator rules.
create table public.teaching_course_editors (
  course_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  primary key (course_id, user_id),
  foreign key (course_id, workspace_id)
    references public.teaching_courses (id, workspace_id) on delete cascade,
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index teaching_course_editors_membership
  on public.teaching_course_editors (workspace_id, user_id);
alter table public.teaching_course_editors enable row level security;
revoke all on public.teaching_course_editors from public, anon, authenticated;
grant select on public.teaching_course_editors to authenticated;
create policy teaching_course_editors_read on public.teaching_course_editors
  for select to authenticated using (private.teaching_access(course_id, false));

create function private.teaching_plan_write_access(target_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.teaching_access(target_course, true) or exists (
    select 1 from public.teaching_course_editors e
    join public.teaching_courses c on c.id = e.course_id and c.workspace_id = e.workspace_id
    join public.workspace_members m on m.workspace_id = e.workspace_id and m.user_id = e.user_id
    where e.course_id = target_course and e.user_id = auth.uid()
      and m.role = 'editor' and c.visibility = 'workspace'
  );
$$;
revoke all on function private.teaching_plan_write_access(uuid) from public, anon, authenticated;

create function private.set_teaching_plan_editors(target_course uuid, expected_version integer, editors uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare current_course public.teaching_courses;
begin
  select * into current_course from public.teaching_courses where id = target_course for update;
  if not private.teaching_access(target_course, true)
    or current_course.visibility is distinct from 'workspace' then
    raise exception '공동작성 담당자는 학교 공유 계획의 소유자나 관리자만 지정할 수 있습니다.' using errcode = '42501';
  end if;
  if current_course.archived or current_course.version is distinct from expected_version then
    raise exception '계획이 변경되었거나 보관되었습니다. 새로고침 후 확인해 주세요.';
  end if;
  if editors is null or cardinality(editors) > 50 or exists (
    select 1 from unnest(editors) as candidate(id)
    where candidate.id is null or candidate.id = current_course.owner_id or not exists (
      select 1 from public.workspace_members m where m.workspace_id = current_course.workspace_id
        and m.user_id = candidate.id and m.role = 'editor'
    )
  ) then
    raise exception '같은 작업공간의 편집 권한이 있는 구성원을 선택해 주세요.' using errcode = '42501';
  end if;
  delete from public.teaching_course_editors e where e.course_id = target_course and e.user_id <> all(editors);
  insert into public.teaching_course_editors(course_id, workspace_id, user_id)
    select distinct target_course, current_course.workspace_id, id from unnest(editors) as candidate(id)
    on conflict do nothing;
  update public.teaching_courses set version = version + 1, updated_at = now() where id = target_course;
  perform private.teaching_record_revision(target_course, '공동작성 담당자 변경');
  return current_course.version + 1;
end $$;

create function public.set_teaching_plan_editors(target_course uuid, expected_version integer, editors uuid[])
returns integer language sql security invoker set search_path = '' as $$
  select private.set_teaching_plan_editors(target_course, expected_version, editors);
$$;
revoke all on function private.set_teaching_plan_editors(uuid, integer, uuid[]),
  public.set_teaching_plan_editors(uuid, integer, uuid[]) from public, anon, authenticated;
grant execute on function private.set_teaching_plan_editors(uuid, integer, uuid[]),
  public.set_teaching_plan_editors(uuid, integer, uuid[]) to authenticated;

create or replace function private.save_teaching_plan(target_course uuid,expected_version integer,payload jsonb,confirm_plan boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses; old_doc jsonb; doc jsonb:=payload;
begin
 select * into c from public.teaching_courses where id=target_course for update;
 if not private.teaching_plan_write_access(target_course) then
   raise exception '이 계획의 편집 권한이 없습니다.' using errcode='42501';
 end if;
 if c.version is distinct from expected_version or c.archived then raise exception '계획이 변경되었거나 보관되었습니다. 새로고침 후 확인해 주세요.';end if;
 perform private.validate_teaching_document(payload,c.workspace_id,c.semester);
 select document into old_doc from public.teaching_plans where course_id=target_course;
 if not coalesce(confirm_plan,false) then
  if old_doc->>'lesson_status'='확정' and (old_doc->'units' is distinct from doc->'units' or old_doc->'report' is distinct from doc->'report') then doc:=jsonb_set(doc,'{lesson_status}','"작성 중"');end if;
  doc:=jsonb_set(doc,'{evaluations}',(select jsonb_agg(case when exists(select 1 from jsonb_array_elements(old_doc->'evaluations') old where old->>'semester'=ev->>'semester' and old->>'status'='확정' and ((old-'status') is distinct from (ev-'status') or old_doc->'report' is distinct from doc->'report' or old_doc->'units' is distinct from doc->'units')) then jsonb_set(ev,'{status}','"작성 중"') else ev end order by ord) from jsonb_array_elements(doc->'evaluations') with ordinality a(ev,ord)));
 end if;
 update public.teaching_plans set document=doc where course_id=target_course;
 perform private.teaching_replace_links(target_course,c.workspace_id,doc);
 update public.teaching_courses set version=version+1,updated_at=now() where id=target_course;
 perform private.teaching_record_revision(target_course,case when confirm_plan then '상태 확인 후 저장' else '계획 저장' end);
 return c.version+1;
end $$;

create or replace function private.save_teaching_course(target uuid,target_course uuid,expected_version integer,settings jsonb,copy_from uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses; cid uuid; yr uuid; g integer; sem integer; subj uuid; ref jsonb; doc jsonb; limit_grade integer; title text; initial_hours numeric; empty_doc jsonb; copy_scope text := coalesce(settings->>'copy_scope','all');
begin
limit_grade:=private.lock_workspace_grade_count(target);
if settings is null or not extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"workspace_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"academic_year_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"grade":{"type":"integer","minimum":1,"maximum":6},"semester":{"type":"integer","minimum":0,"maximum":2},"subject_id":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"subject_name":{"type":"string","minLength":1,"maxLength":120},"teacher_name":{"type":"string","minLength":1,"maxLength":80},"class_ids":{"maxItems":30,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"visibility":{"type":"string","enum":["private","workspace"]},"copy_scope":{"type":"string","enum":["all","lesson","assessment"]},"manual_hours":{"anyOf":[{"type":"number","minimum":0,"maximum":10000},{"type":"null"}]}},"required":["workspace_id","academic_year_id","grade","semester","subject_id","subject_name","teacher_name","class_ids","visibility","manual_hours"],"additionalProperties":false}$schema$::json,settings) or settings->>'workspace_id' is distinct from target::text then raise exception '수업 설정을 확인해 주세요.';end if;
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
   empty_doc := doc;
   -- Serialize with visibility/content updates before checking the source.
   perform 1 from public.teaching_courses where id=copy_from for share;
   if not private.teaching_access(copy_from,false) or not exists(select 1 from public.teaching_courses where id=copy_from and workspace_id=target and semester=sem) then raise exception '같은 작업공간·학기 범위의 계획만 복사할 수 있습니다.' using errcode='42501';end if;
   select private.teaching_as_draft(document) into doc from public.teaching_plans where course_id=copy_from;
   if copy_scope = 'lesson' then
     doc := jsonb_set(doc, '{evaluations}', empty_doc->'evaluations');
     doc := jsonb_set(doc, '{units}', (select coalesce(jsonb_agg(value - 'assessment_links' order by ord), '[]'::jsonb)
       from jsonb_array_elements(doc->'units') with ordinality as unit(value, ord)));
   elsif copy_scope = 'assessment' then
     doc := jsonb_set(doc, '{units}', '[]'::jsonb);
   end if;
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
