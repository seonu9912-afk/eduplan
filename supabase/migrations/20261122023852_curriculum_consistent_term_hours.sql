-- Forward-only fix: no existing documents, hours or snapshots are rewritten.
create or replace function private.curriculum_design_save(
 target_plan uuid, expected_plan_version integer, expected_doc_version integer, next_document jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p record; lockrow public.curriculum_design_locks%rowtype;
  current_doc_version integer; entries jsonb; current_new_version integer; item jsonb; hour_value numeric;
  row_count integer; grade_value integer; semester_value integer; basis_weeks integer; year_key text;
  adjustment numeric; manual numeric; week_hours numeric; entry jsonb; rule jsonb;
  choice jsonb; subject_key text; chosen_keys text[] := array[]::text[]; choice_ids text[] := array[]::text[]; max_grade integer;
begin
  select id,workspace_id,cohort_year into p from public.curriculum_plans where id=target_plan;
  if p.id is null then raise exception '교육과정 편성표를 찾지 못했습니다.'; end if;
  if auth.uid() is null or coalesce(private.workspace_role(p.workspace_id),'') not in ('admin','editor') then
    raise exception '편집 권한이 없습니다.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_plan::text,6));
  select * into lockrow from public.curriculum_design_locks where plan_id=target_plan for update;
  if lockrow.editor_id is distinct from auth.uid() or lockrow.expires_at<=now() then
    raise exception '편집권이 없거나 만료되었습니다. 편집권을 다시 획득해 주세요.';
  end if;
  if jsonb_typeof(next_document) is distinct from 'object'
    or next_document->>'format' is distinct from 'eduplan-curriculum-v2'
    or (next_document->>'cohortYear')::integer is distinct from p.cohort_year
    or jsonb_typeof(next_document->'cells') is distinct from 'array'
    or octet_length(next_document::text)>=1800000 then
    raise exception '편성표 데이터 형식을 확인해 주세요.';
  end if;
  if expected_plan_version is null or expected_plan_version < 1
    or expected_doc_version is null or expected_doc_version < 0 then
    raise exception '저장 버전을 확인해 주세요.';
  end if;
  -- Use the same workspace-before-plan lock order as save_curriculum/deletion.
  perform 1 from public.workspaces where id=p.workspace_id for share;
  select case when school_type='초등학교' then 6 else 3 end into max_grade
    from public.workspaces where id=p.workspace_id;
  if jsonb_typeof(next_document->'weeks') is distinct from 'object'
    or (next_document ? 'termWeeks' and jsonb_typeof(next_document->'termWeeks') is distinct from 'object')
    or (next_document ? 'choiceSets' and jsonb_typeof(next_document->'choiceSets') is distinct from 'array')
    or (next_document ? 'excludedSubjectIds' and jsonb_typeof(next_document->'excludedSubjectIds') is distinct from 'array') then
    raise exception '주수·선택과목군·운영 제외 목록 형식을 확인해 주세요.';
  end if;
  for rule in select value from jsonb_each(next_document->'weeks')
    union all select value from jsonb_each(coalesce(next_document->'termWeeks','{}'::jsonb)) loop
    if jsonb_typeof(rule) is distinct from 'object' or
      coalesce(rule->>'count','') not in ('16','17') or
      coalesce(rule->>'status','') not in ('confirmed','provisional') then
      raise exception '기준 주수는 16주 또는 17주이며 확정 상태가 필요합니다.';
    end if;
  end loop;
  row_count:=jsonb_array_length(next_document->'cells');
  if row_count<=0 or row_count>3600 then raise exception '편성표 항목 개수를 확인해 주세요.'; end if;
  select version into current_doc_version from public.curriculum_design_documents where plan_id=target_plan for update;
  if coalesce(current_doc_version,0)<>expected_doc_version then
    raise exception '다른 편집본이 저장되었습니다. 최신 자료를 다시 확인해 주세요.';
  end if;
  entries:='[]'::jsonb;
  for item in select value from jsonb_array_elements(next_document->'cells') loop
    if not (item ?& array['subjectId','grade','semester','weekly','manual','adjustments'])
      or (item->>'subjectId') is null or (item->>'subjectId') !~* '^[0-9a-f-]{36}$'
      or (item->>'grade') is null or (item->>'grade') !~ '^[1-6]$'
      or (item->>'semester') is null or (item->>'semester') !~ '^[12]$'
      or jsonb_typeof(item->'weekly') is distinct from 'number'
      or (item->>'weekly')::numeric not between 0 and 100
      or jsonb_typeof(item->'manual') is distinct from 'number'
      or (item->>'manual')::numeric not between -2000 and 2000
      or jsonb_typeof(item->'adjustments') is distinct from 'array' then
      raise exception '학년·학기·주당 시수 및 조정값 형식을 확인해 주세요.';
    end if;
    grade_value:=(item->>'grade')::integer;semester_value:=(item->>'semester')::integer;
    if grade_value > max_grade then raise exception '학교급의 학년 범위를 벗어났습니다.'; end if;
    if jsonb_array_length(item->'adjustments')>20 or exists (
      select 1 from jsonb_array_elements(item->'adjustments') a where
      jsonb_typeof(a->'hours') is distinct from 'number' or
      (a->>'hours')::numeric not between -2000 and 2000) then
      raise exception '조정값 범위를 확인해 주세요.';
    end if;
    year_key:=(p.cohort_year+grade_value-1)::text;
    basis_weeks:=coalesce(
      (next_document->'termWeeks'->(year_key||':'||semester_value::text)->>'count')::integer,
      (next_document->'weeks'->year_key->>'count')::integer,16);
    if basis_weeks not in (16,17) then raise exception '기준 주수는 16주 또는 17주여야 합니다.'; end if;
    week_hours:=(item->>'weekly')::numeric;
    manual:=coalesce((item->>'manual')::numeric,0);
    select coalesce(sum((v->>'hours')::numeric),0) into adjustment
      from jsonb_array_elements(coalesce(item->'adjustments','[]'::jsonb)) as v;
    hour_value:=week_hours*basis_weeks+manual+adjustment;
    if hour_value<0 or hour_value>2000 or abs(hour_value-round(hour_value))>0.000001 then
      raise exception '학기 총시수는 0~2000 사이의 정수여야 합니다. 주당 시수·조정값을 확인해 주세요.';
    end if;
    entry:=jsonb_build_object('subject_id',item->>'subjectId','grade',grade_value,
      'semester',semester_value,'hours',round(hour_value)::integer);
    entries:=entries||jsonb_build_array(entry);
  end loop;
  if (select count(distinct (e->>'subject_id')||'-'||(e->>'grade')||'-'||(e->>'semester'))
      from jsonb_array_elements(entries) e)<>row_count then
    raise exception '동일 과목·학년·학기가 중복되어 있습니다.';
  end if;
  for choice in select value from jsonb_array_elements(coalesce(next_document->'choiceSets','[]'::jsonb)) loop
    if coalesce(choice->>'id','') = '' or choice_ids @> array[choice->>'id'] or
       coalesce(choice->>'grade','') !~ '^[1-6]$' or
       coalesce(choice->>'semester','') !~ '^[12]$' or
       coalesce(choice->>'requiredCount','') !~ '^[0-9]+$' or
       jsonb_typeof(choice->'subjectIds') is distinct from 'array' then
      raise exception '선택과목군 형식을 확인해 주세요.';
    end if;
    choice_ids:=array_append(choice_ids,choice->>'id');
    if (choice->>'grade')::integer > max_grade or
       (choice->>'requiredCount')::integer < 1 or
       (choice->>'requiredCount')::integer >= jsonb_array_length(choice->'subjectIds') then
      raise exception '선택과목군의 학년·선택 수를 확인해 주세요.';
    end if;
    for subject_key in select value from jsonb_array_elements_text(choice->'subjectIds') loop
      if not exists(select 1 from jsonb_array_elements(entries) e where
        e->>'subject_id'=subject_key and e->>'grade'=choice->>'grade' and e->>'semester'=choice->>'semester') then
        raise exception '선택과목군에 편성되지 않은 과목이 있습니다.';
      end if;
      subject_key:=subject_key||':'||(choice->>'grade')||':'||(choice->>'semester');
      if chosen_keys @> array[subject_key] then raise exception '선택과목군에 같은 학기 과목이 중복되었습니다.'; end if;
      chosen_keys:=array_append(chosen_keys,subject_key);
    end loop;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(coalesce(next_document->'excludedSubjectIds','[]'::jsonb)) s(id)
    where not exists(select 1 from public.subjects where id::text=s.id and workspace_id=p.workspace_id)
      or exists(select 1 from jsonb_array_elements(next_document->'cells') c where c->>'subjectId'=s.id
        and ((c->>'weekly')::numeric<>0 or (c->>'manual')::numeric<>0 or jsonb_array_length(c->'adjustments')<>0))
      or exists(select 1 from jsonb_array_elements(coalesce(next_document->'choiceSets','[]'::jsonb)) ch
        where ch->'subjectIds' ? s.id)
    group by s.id having count(*)>0)
    or (select count(*)<>count(distinct value) from jsonb_array_elements_text(coalesce(next_document->'excludedSubjectIds','[]'::jsonb))) then
    raise exception '운영 제외 목록에 중복·미등록 과목 또는 편성된 과목이 있습니다.';
  end if;
  current_new_version:=private.save_curriculum(target_plan,expected_plan_version,entries);
  insert into public.curriculum_design_documents(plan_id,workspace_id,document,version,updated_by)
   values(target_plan,p.workspace_id,next_document,expected_doc_version+1,auth.uid())
   on conflict(plan_id) do update
     set document=excluded.document,version=excluded.version,updated_by=auth.uid(),updated_at=now();
  insert into public.curriculum_design_revisions(plan_id,workspace_id,version,document,saved_by)
    values(target_plan,p.workspace_id,expected_doc_version+1,next_document,auth.uid());
  update public.curriculum_design_locks
    set expires_at=now()+interval '2 minutes',updated_at=now() where plan_id=target_plan;
  return jsonb_build_object('ok',true,'planVersion',current_new_version,'documentVersion',expected_doc_version+1);
end $$;

-- New clients confirm exactly the version they reviewed. Keep the old signature
-- available for deployed clients; its snapshot is now also serialized above.
create function private.curriculum_design_confirm_version(
  target_plan uuid, expected_plan_version integer, expected_doc_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; plan_version integer; doc_version integer;
begin
  select workspace_id into target from public.curriculum_plans where id=target_plan;
  if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then
    raise exception '확정 권한이 없습니다.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_plan::text,6));
  perform 1 from public.workspaces where id=target for share;
  select version into plan_version from public.curriculum_plans where id=target_plan for update;
  select version into doc_version from public.curriculum_design_documents where plan_id=target_plan;
  if expected_plan_version is null or expected_doc_version is null or doc_version is null or
    expected_plan_version is distinct from plan_version or expected_doc_version is distinct from doc_version then
    raise exception '검토한 편성표가 변경되었습니다. 최신 저장본을 다시 검토한 뒤 확정해 주세요.';
  end if;
  return private.curriculum_design_confirm(target_plan);
end $$;
create function public.curriculum_design_confirm_version(
  target_plan uuid, expected_plan_version integer, expected_doc_version integer
) returns jsonb language sql security invoker set search_path='' as $$
  select private.curriculum_design_confirm_version(target_plan,expected_plan_version,expected_doc_version)
$$;
revoke all on function private.curriculum_design_confirm_version(uuid,integer,integer),
  public.curriculum_design_confirm_version(uuid,integer,integer) from public,anon,authenticated;
grant execute on function private.curriculum_design_confirm_version(uuid,integer,integer),
  public.curriculum_design_confirm_version(uuid,integer,integer) to authenticated;

create or replace function private.curriculum_design_confirm(target_plan uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p record; d record; result_id uuid;
begin
 select id,workspace_id,version into p from public.curriculum_plans where id=target_plan;
 if p.id is null or auth.uid() is null or
   coalesce(private.workspace_role(p.workspace_id),'') not in ('admin','editor') then
   raise exception '확정 권한이 없습니다.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target_plan::text,6));
 perform 1 from public.workspaces where id=p.workspace_id for share;
 select id,workspace_id,version into p from public.curriculum_plans where id=target_plan for update;
 select * into d from public.curriculum_design_documents where plan_id=target_plan;
 if d.plan_id is null then raise exception '먼저 편성표를 저장해 주세요.'; end if;
 insert into public.curriculum_design_snapshots(plan_id,workspace_id,version,document,hours,confirmed_by)
 select target_plan,p.workspace_id,p.version,d.document,
   coalesce(jsonb_agg(jsonb_build_object('subject_id',h.subject_id,'grade',h.grade,
    'semester',h.semester,'hours',h.hours)) filter (where h.subject_id is not null),'[]'::jsonb),
   auth.uid()
 from public.curriculum_plans cp left join public.curriculum_hours h on h.plan_id=cp.id
 where cp.id=target_plan
 group by cp.id
 returning id into result_id;
 return jsonb_build_object('ok',true,'id',result_id,'version',p.version);
end $$;
