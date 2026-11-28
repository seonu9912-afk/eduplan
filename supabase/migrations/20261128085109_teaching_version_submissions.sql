-- A submission points at an immutable saved revision. No draft is made public.
create table private.teaching_submissions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  version integer not null,
  scope text not null check(scope in ('lesson','assessment_1','assessment_2')),
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check(status in ('submitted','reviewing','changes_requested','accepted','withdrawn')),
  reviewer_id uuid,
  reviewed_at timestamptz,
  review_note text not null default '' check(length(review_note)<=3000),
  events jsonb not null default '[]'::jsonb check(jsonb_typeof(events)='array'),
  foreign key(course_id,version) references public.teaching_plan_versions(course_id,version) on delete cascade
);
alter table private.teaching_submissions enable row level security;
revoke all on private.teaching_submissions from public,anon,authenticated;
create index teaching_submissions_course_scope on private.teaching_submissions(course_id,scope,submitted_at desc,id);
create unique index teaching_submissions_active on private.teaching_submissions(course_id,scope) where status in ('submitted','reviewing');

create function private.teaching_submission_author(target_course uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.teaching_courses c where c.id=target_course
      and (select auth.uid()) is not null and private.workspace_role(c.workspace_id) is not null
      and (c.owner_id=(select auth.uid()) or (c.visibility='workspace' and (
        exists(select 1 from public.teaching_course_editors e where e.course_id=c.id and e.user_id=(select auth.uid()))
        or exists(select 1 from public.staff_appointments a where a.id=c.teacher_id and a.workspace_id=c.workspace_id
          and a.academic_year_id=c.academic_year_id and a.user_id=(select auth.uid()))
      )))
  )
$$;
create function private.teaching_submission_reviewer(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and private.workspace_role(target) is not null
    and (private.workspace_role(target)='admin' or private.can_plan(target,'assessment'))
$$;

create function private.submit_teaching_version(target_course uuid,expected_version integer,scopes text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses; v public.teaching_plan_versions; part text; sid uuid; result jsonb:='[]'::jsonb;
begin
  select * into c from public.teaching_courses where id=target_course for update;
  if c.id is null or not private.teaching_submission_author(target_course) then raise exception '담당 교사만 계획을 제출할 수 있습니다.' using errcode='42501'; end if;
  if c.archived or c.version is distinct from expected_version then raise exception '현재 저장본을 다시 확인해 주세요.'; end if;
  if scopes is null or cardinality(scopes) not between 1 and 3 or exists(select 1 from unnest(scopes) s where s is null or s not in ('lesson','assessment_1','assessment_2')) or (select count(distinct s) from unnest(scopes) s)<>cardinality(scopes) then raise exception '제출할 계획 종류를 확인하세요.'; end if;
  select * into v from public.teaching_plan_versions where course_id=c.id and version=c.version;
  if v.course_id is null then raise exception '저장 이력을 찾지 못했습니다.'; end if;
  foreach part in array scopes loop
    if part='lesson' and not exists(select 1 from jsonb_array_elements(v.document->'units') u where btrim(coalesce(u->>'title',''))<>'') then raise exception '교수학습계획을 먼저 작성하세요.'; end if;
    if part<>'lesson' and not exists(select 1 from jsonb_array_elements(v.document->'evaluations') e where e->>'semester'=right(part,1) and jsonb_array_length(e->'items')>0) then raise exception '해당 학기 평가계획을 먼저 작성하세요.'; end if;
    if exists(select 1 from private.teaching_submissions s where s.course_id=c.id and s.scope=part and s.status in ('submitted','reviewing')) then raise exception '검토 중인 제출본이 있습니다. 먼저 제출을 철회하거나 검토 결과를 확인하세요.'; end if;
    if exists(select 1 from private.teaching_submissions s where s.course_id=c.id and s.scope=part and s.version=v.version and s.status='accepted') then raise exception '이미 검토 완료된 저장본입니다.'; end if;
    insert into private.teaching_submissions(course_id,version,scope,submitted_by,events)
    values(c.id,v.version,part,auth.uid(),jsonb_build_array(jsonb_build_object('status','submitted','at',now(),'actor',auth.uid())))
    returning id into sid;
    result:=result||jsonb_build_array(sid);
  end loop;
  return result;
end $$;

create function private.change_teaching_submission(target_submission uuid,expected_status text,next_status text,note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare s private.teaching_submissions; c public.teaching_courses; msg text:=btrim(coalesce(note,''));
begin
  select * into s from private.teaching_submissions where id=target_submission;
  select * into c from public.teaching_courses where id=s.course_id for update;
  if s.id is null or c.id is null or private.workspace_role(c.workspace_id) is null then raise exception '제출 기록 조회 권한이 없습니다.' using errcode='42501'; end if;
  select * into s from private.teaching_submissions where id=target_submission for update;
  if next_status='withdrawn' then
    if not private.teaching_submission_author(c.id) then raise exception '담당 교사만 제출을 철회할 수 있습니다.' using errcode='42501'; end if;
  elsif not private.teaching_submission_reviewer(c.workspace_id) then raise exception '제출 검토 권한이 없습니다.' using errcode='42501'; end if;
  if s.status is distinct from expected_status or s.status not in ('submitted','reviewing') or not (
    next_status in ('withdrawn','changes_requested','accepted') or (s.status='submitted' and next_status='reviewing')
  ) then raise exception '이미 변경된 제출 상태입니다. 다시 불러와 주세요.'; end if;
  if length(msg)>3000 or (next_status='changes_requested' and msg='') then raise exception '수정 요청 사유를 입력하세요.'; end if;
  update private.teaching_submissions set status=next_status,
    reviewer_id=case when next_status='withdrawn' then reviewer_id else auth.uid() end,
    reviewed_at=case when next_status='withdrawn' then reviewed_at else now() end,
    review_note=case when next_status='withdrawn' then review_note else msg end,
    events=events||jsonb_build_array(jsonb_build_object('status',next_status,'at',now(),'actor',auth.uid(),'note',msg))
    where id=s.id;
end $$;

create function private.list_teaching_submissions(target uuid,year_id uuid,target_course uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or private.workspace_role(target) is null then raise exception '제출 기록 조회 권한이 없습니다.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'course_id',s.course_id,'version',s.version,'scope',s.scope,'status',s.status,
      'submitted_at',s.submitted_at,'reviewed_at',s.reviewed_at,'review_note',s.review_note,
      'grade',v.course_snapshot->'grade','semester',v.course_snapshot->'semester',
      'subject_name',v.course_snapshot->'subject_name','teacher_name',v.course_snapshot->'teacher_name',
      'current_version',case when private.teaching_submission_author(c.id) then c.version else null end,
      'can_submit',private.teaching_submission_author(c.id)
    ) order by s.submitted_at desc,s.id desc)
    from private.teaching_submissions s join public.teaching_courses c on c.id=s.course_id
    join public.teaching_plan_versions v on v.course_id=s.course_id and v.version=s.version
    where c.workspace_id=target and c.academic_year_id=year_id and (target_course is null or c.id=target_course)
    and (private.teaching_submission_author(c.id) or private.teaching_submission_reviewer(target))), '[]'::jsonb);
end $$;

create function private.read_teaching_submission(target_submission uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s private.teaching_submissions; c public.teaching_courses; v public.teaching_plan_versions;
begin
  select * into s from private.teaching_submissions where id=target_submission;
  select * into c from public.teaching_courses where id=s.course_id;
  if c.id is null or not (private.teaching_submission_author(c.id) or private.teaching_submission_reviewer(c.workspace_id)) then raise exception '제출본 조회 권한이 없습니다.' using errcode='42501'; end if;
  select * into v from public.teaching_plan_versions where course_id=s.course_id and version=s.version;
  return jsonb_build_object('id',s.id,'version',s.version,'scope',s.scope,'status',s.status,'events',s.events,
    'course',jsonb_build_object('grade',v.course_snapshot->'grade','semester',v.course_snapshot->'semester','subject_name',v.course_snapshot->'subject_name','teacher_name',v.course_snapshot->'teacher_name','classes',v.course_snapshot->'classes'),
    'report',v.document->'report',
    'content',case when s.scope='lesson' then v.document->'units' else (select e from jsonb_array_elements(v.document->'evaluations') e where e->>'semester'=right(s.scope,1)) end);
end $$;

create function public.submit_teaching_version(target_course uuid,expected_version integer,scopes text[]) returns jsonb
language sql security invoker set search_path='' as $$ select private.submit_teaching_version(target_course,expected_version,scopes) $$;
create function public.change_teaching_submission(target_submission uuid,expected_status text,next_status text,note text default '') returns void
language sql security invoker set search_path='' as $$ select private.change_teaching_submission(target_submission,expected_status,next_status,note) $$;
create function public.list_teaching_submissions(target uuid,year_id uuid,target_course uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.list_teaching_submissions(target,year_id,target_course) $$;
create function public.read_teaching_submission(target_submission uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_teaching_submission(target_submission) $$;

revoke all on function private.teaching_submission_author(uuid),private.teaching_submission_reviewer(uuid),
  private.submit_teaching_version(uuid,integer,text[]),public.submit_teaching_version(uuid,integer,text[]),
  private.change_teaching_submission(uuid,text,text,text),public.change_teaching_submission(uuid,text,text,text),
  private.list_teaching_submissions(uuid,uuid,uuid),public.list_teaching_submissions(uuid,uuid,uuid),
  private.read_teaching_submission(uuid),public.read_teaching_submission(uuid) from public,anon,authenticated;
grant execute on function private.submit_teaching_version(uuid,integer,text[]),public.submit_teaching_version(uuid,integer,text[]),
  private.change_teaching_submission(uuid,text,text,text),public.change_teaching_submission(uuid,text,text,text),
  private.list_teaching_submissions(uuid,uuid,uuid),public.list_teaching_submissions(uuid,uuid,uuid),
  private.read_teaching_submission(uuid),public.read_teaching_submission(uuid) to authenticated;
