-- Reject malformed direct RPC calls before mutating academic or curriculum data.
create or replace function private.save_academic_year(target uuid, school_year integer, expected_version integer, terms jsonb, class_counts integer[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare year_id uuid; current_version integer; first_start date; first_end date; second_start date; second_end date; g integer;
begin
  if auth.uid() is null or private.workspace_role(target) is distinct from 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if school_year is null or school_year not between 2000 and 2100 or expected_version is null or expected_version<0 then raise exception '학년도와 저장 버전을 확인해 주세요.'; end if;
  if jsonb_typeof(terms) is distinct from 'array' then raise exception '두 학기 날짜를 입력해 주세요.'; end if;
  if jsonb_array_length(terms)<>2 then raise exception '두 학기 날짜를 입력해 주세요.'; end if;
  if class_counts is null or array_ndims(class_counts) is distinct from 1 or array_lower(class_counts,1) is distinct from 1 or cardinality(class_counts)<>3 or array_position(class_counts,null) is not null or exists(select 1 from unnest(class_counts) n where n<0 or n>30) then raise exception '학년별 학급 수는 0~30개입니다.'; end if;
  first_start := (terms->0->>'start_date')::date; first_end := (terms->0->>'end_date')::date;
  second_start := (terms->1->>'start_date')::date; second_end := (terms->1->>'end_date')::date;
  if first_start is null or first_end is null or second_start is null or second_end is null or first_start>first_end or first_end>=second_start or second_start>second_end
    or first_start<make_date(school_year,3,1) or second_end>=make_date(school_year+1,3,1) then raise exception '학기 날짜와 학년도 범위를 확인해 주세요.'; end if;
  -- Serialize creation as well as updates for one workspace/year.
  perform pg_advisory_xact_lock(hashtextextended(target::text||':'||school_year::text,0));
  select id,version into year_id,current_version from public.academic_years where workspace_id=target and year=school_year for update;
  if year_id is null then
    if expected_version<>0 then raise exception '다른 사용자가 학년도를 변경했습니다. 새로고침해 주세요.'; end if;
    insert into public.academic_years(workspace_id,year) values(target,school_year) returning id into year_id;
  else
    if expected_version is distinct from current_version then raise exception '다른 사용자가 학년도를 변경했습니다. 새로고침해 주세요.'; end if;
    update public.academic_years set version=version+1 where id=year_id;
  end if;
  insert into public.semesters(workspace_id,academic_year_id,number,start_date,end_date) values
    (target,year_id,1,first_start,first_end),(target,year_id,2,second_start,second_end)
    on conflict(academic_year_id,number) do update set start_date=excluded.start_date,end_date=excluded.end_date;
  for g in 1..3 loop
    delete from public.classes where academic_year_id=year_id and grade=g and class_number>class_counts[g];
    insert into public.classes(workspace_id,academic_year_id,grade,class_number)
      select target,year_id,g,n from generate_series(1,class_counts[g]) n on conflict do nothing;
  end loop;
  insert into public.activity_log(workspace_id,actor_id,action,label) values(target,auth.uid(),'save',school_year||'학년도 설정 저장');
  return year_id;
end $$;

create or replace function private.save_curriculum(target_plan uuid, expected_version integer, entries jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare target uuid; current_version integer;
begin
  select workspace_id,version into target,current_version from public.curriculum_plans where id=target_plan for update;
  if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '편집 권한이 없습니다.' using errcode='42501'; end if;
  if current_version is distinct from expected_version then raise exception '다른 사용자가 편성표를 저장했습니다. 새로고침 후 다시 입력해 주세요.'; end if;
  if jsonb_typeof(entries) is distinct from 'array' then raise exception '편성표 입력 형식을 확인해 주세요.'; end if;
  if jsonb_array_length(entries)>1800 then raise exception '편성표 입력 형식을 확인해 주세요.'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e where
    not (e ?& array['subject_id','grade','semester','hours'])
    or (e->>'hours') is null or (e->>'hours') !~ '^[0-9]+$'
    or not exists(select 1 from public.subjects s where s.id=(e->>'subject_id')::uuid and s.workspace_id=target)) then raise exception '과목 또는 시수 입력을 확인해 주세요.'; end if;
  delete from public.curriculum_hours where plan_id=target_plan;
  insert into public.curriculum_hours(workspace_id,plan_id,subject_id,grade,semester,hours)
  select target,target_plan,(e->>'subject_id')::uuid,(e->>'grade')::smallint,(e->>'semester')::smallint,(e->>'hours')::integer from jsonb_array_elements(entries) e;
  update public.curriculum_plans set version=version+1,updated_at=now() where id=target_plan;
  insert into public.activity_log(workspace_id,actor_id,action,label) select target,auth.uid(),'save',cohort_year||'학년도 입학생 편성표 저장' from public.curriculum_plans where id=target_plan;
  return current_version+1;
end $$;
