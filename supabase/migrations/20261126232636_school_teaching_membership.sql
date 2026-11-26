-- Membership admits explicitly assigned co-authors. The legacy editor role
-- no longer grants a teaching privilege by itself.
do $scope$
declare definition text:=pg_get_functiondef('private.set_teaching_plan_editors(uuid,integer,uuid[])'::regprocedure);
  legacy constant text:='and m.user_id = candidate.id and m.role = ''editor''';
begin
  if strpos(definition,legacy)=0 then raise exception 'Teaching collaborator membership check changed'; end if;
  execute replace(
    replace(definition,legacy,'and m.user_id = candidate.id'),
    '같은 작업공간의 편집 권한이 있는 구성원을 선택해 주세요.',
    '같은 학교의 구성원을 선택해 주세요.'
  );
end $scope$;

-- Effective dates belong to the immutable published snapshot, not the draft.
alter table public.curriculum_design_snapshots add column starts_on date;
alter table public.curriculum_design_snapshots add column change_note text not null default '' check(length(change_note)<=500);
alter table public.curriculum_design_snapshots add column subject_names jsonb not null default '{}' check(jsonb_typeof(subject_names)='object');
alter table public.teaching_plan_versions add column starts_on date;
alter table public.teaching_plan_versions add column change_note text not null default '' check(length(change_note)<=500);

create policy curriculum_release_date on public.curriculum_design_snapshots
as restrictive for select to authenticated using (
  starts_on is null or starts_on<=(now() at time zone 'Asia/Seoul')::date
  or private.can_review_plan(workspace_id,'curriculum')
);

create function private.publish_curriculum_from(target_plan uuid,expected_plan_version integer,
  expected_doc_version integer,effective_date date,note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.curriculum_plans; end_year integer; snapshot jsonb;
begin
  select * into p from public.curriculum_plans where id=target_plan;
  if p.id is null or not private.can_plan(p.workspace_id,'curriculum') then
    raise exception '교육과정 공개 권한이 없습니다.' using errcode='42501';
  end if;
  end_year:=p.cohort_year+private.workspace_grade_count(p.workspace_id);
  if effective_date is null or effective_date<make_date(p.cohort_year,3,1) or effective_date>=make_date(end_year,3,1) then
    raise exception '해당 입학년도의 이수 기간 안에서 적용 시작일을 지정하세요.' using errcode='22023';
  end if;
  snapshot:=private.curriculum_design_confirm_version(target_plan,expected_plan_version,expected_doc_version);
  update public.curriculum_design_snapshots s
    set starts_on=effective_date,change_note=coalesce(btrim(note),''),
      subject_names=coalesce((select jsonb_object_agg(t.id,t.name) from public.subjects t
        where t.workspace_id=p.workspace_id and exists (
          select 1 from jsonb_array_elements(s.hours) h where h->>'subject_id'=t.id::text
        )), '{}'::jsonb)
    where s.id=(snapshot->>'id')::uuid and s.workspace_id=p.workspace_id and s.plan_id=p.id;
  if not found then raise exception '공개할 교육과정 버전을 찾지 못했습니다.'; end if;
  return snapshot;
end $$;

create function public.publish_curriculum_from(target_plan uuid,expected_plan_version integer,
  expected_doc_version integer,effective_date date,note text) returns jsonb
language sql security invoker set search_path='' as $$
  select private.publish_curriculum_from(target_plan,expected_plan_version,expected_doc_version,effective_date,note)
$$;

create function private.publish_teaching_from(target_course uuid,expected_version integer,payload jsonb,
  effective_date date,note text) returns integer
language plpgsql security definer set search_path='' as $$
declare c public.teaching_courses; sy integer; published_version integer;
begin
  select * into c from public.teaching_courses where id=target_course for update;
  if c.id is null or c.visibility<>'workspace' or not private.teaching_plan_write_access(target_course) then
    raise exception '공유 수업의 작성 담당자만 공개할 수 있습니다.' using errcode='42501';
  end if;
  select year into sy from public.academic_years where id=c.academic_year_id and workspace_id=c.workspace_id;
  if effective_date is null or effective_date<make_date(sy,3,1) or effective_date>=make_date(sy+1,3,1) then
    raise exception '적용 시작일을 해당 학년도 안에서 지정하세요.' using errcode='22023';
  end if;
  if payload->>'lesson_status' is distinct from '확정' and not exists (
    select 1 from jsonb_array_elements(payload->'evaluations') e where e->>'status'='확정'
  ) then raise exception '공개할 수업 또는 평가 계획을 확정 상태로 선택하세요.'; end if;
  published_version:=private.save_teaching_plan(target_course,expected_version,payload,true);
  update public.teaching_plan_versions v set starts_on=effective_date,change_note=coalesce(btrim(note),'')
    where v.course_id=target_course and v.version=published_version;
  if not found then raise exception '공개할 수업·평가 버전을 찾지 못했습니다.'; end if;
  return published_version;
end $$;

create function public.publish_teaching_from(target_course uuid,expected_version integer,payload jsonb,
  effective_date date,note text) returns integer
language sql security invoker set search_path='' as $$
  select private.publish_teaching_from(target_course,expected_version,payload,effective_date,note)
$$;

revoke all on function private.publish_curriculum_from(uuid,integer,integer,date,text),
  public.publish_curriculum_from(uuid,integer,integer,date,text),
  private.publish_teaching_from(uuid,integer,jsonb,date,text),
  public.publish_teaching_from(uuid,integer,jsonb,date,text) from public,anon,authenticated;
grant execute on function private.publish_curriculum_from(uuid,integer,integer,date,text),
  public.publish_curriculum_from(uuid,integer,integer,date,text),
  private.publish_teaching_from(uuid,integer,jsonb,date,text),
  public.publish_teaching_from(uuid,integer,jsonb,date,text) to authenticated;

create or replace function private.school_curriculum_publications(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.cohort_year desc,rows.applied_on desc,
    rows.confirmed_at desc,rows.version desc,rows.id),'[]')
  from (
    select s.id,p.cohort_year,s.confirmed_at,s.version,s.hours,s.starts_on,s.change_note,s.subject_names,
      coalesce(s.starts_on,(s.confirmed_at at time zone 'Asia/Seoul')::date) applied_on
    from public.curriculum_design_snapshots s
    join public.curriculum_plans p on p.id=s.plan_id and p.workspace_id=s.workspace_id
    where s.workspace_id=target and private.workspace_role(target) is not null
      and (s.starts_on is null or s.starts_on<=(now() at time zone 'Asia/Seoul')::date)
  ) rows
$$;

create or replace function private.school_teaching_publications(target uuid,year_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with confirmed as (
    select v.* from public.teaching_plan_versions v
    where v.workspace_id=target and private.workspace_role(target) is not null
      and v.course_snapshot->>'academic_year_id'=year_id::text
      and v.course_snapshot->>'visibility'='workspace'
      and v.action in ('상태 확인 후 저장','계획 확정')
      and (v.starts_on is null or v.starts_on<=(now() at time zone 'Asia/Seoul')::date)
      and (v.document->>'lesson_status'='확정' or exists (
        select 1 from jsonb_array_elements(v.document->'evaluations') e where e->>'status'='확정'
      ))
  ), latest as (
    select distinct on (v.course_id) v.* from confirmed v order by v.course_id,coalesce(v.starts_on,(v.created_at at time zone 'Asia/Seoul')::date) desc,v.version desc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('course_id',h.course_id,'version',h.version,'published_at',h.created_at,'starts_on',h.starts_on,'change_note',h.change_note,
      'grade',h.course_snapshot->'grade','semester',h.course_snapshot->'semester',
      'subject_name',h.course_snapshot->'subject_name','teacher_name',h.course_snapshot->'teacher_name',
      'classes',coalesce(h.course_snapshot->'classes','[]'),
      'units',coalesce((select v.document->'units' from confirmed v where v.course_id=h.course_id
        and v.document->>'lesson_status'='확정' order by coalesce(v.starts_on,(v.created_at at time zone 'Asia/Seoul')::date) desc,v.version desc limit 1),'[]'),
      'evaluations',coalesce((select jsonb_agg(p.item order by p.semester) from (
        select distinct on (e->>'semester') e->>'semester' semester,e item from confirmed v
        cross join lateral jsonb_array_elements(v.document->'evaluations') e
        where v.course_id=h.course_id and e->>'status'='확정'
        order by e->>'semester',coalesce(v.starts_on,(v.created_at at time zone 'Asia/Seoul')::date) desc,v.version desc
      ) p),'[]'))
    order by h.created_at desc,h.course_id),'[]')
  from latest h
$$;
