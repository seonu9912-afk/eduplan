-- Additive EduPlan curriculum design metadata.
-- Existing plans, hours, timetable and calendar are never dropped or rewritten by migration.
create table if not exists public.curriculum_design_documents (
  plan_id uuid primary key references public.curriculum_plans(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document jsonb not null default '{}'::jsonb check (jsonb_typeof(document)='object' and octet_length(document::text)<1800000),
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create index if not exists curriculum_design_documents_workspace_idx on public.curriculum_design_documents(workspace_id);
create table if not exists public.curriculum_design_locks (
  plan_id uuid primary key references public.curriculum_plans(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  editor_id uuid not null references auth.users(id),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.curriculum_design_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.curriculum_plans(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null,
  document jsonb not null,
  hours jsonb not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references auth.users(id)
);
create index if not exists curriculum_design_snapshots_plan_idx on public.curriculum_design_snapshots(plan_id,confirmed_at desc);
create table if not exists public.curriculum_design_revisions (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.curriculum_plans(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null,
  document jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid not null references auth.users(id)
);
create index if not exists curriculum_design_revisions_plan_idx on public.curriculum_design_revisions(plan_id,version desc);

alter table public.curriculum_design_documents enable row level security;
alter table public.curriculum_design_locks enable row level security;
alter table public.curriculum_design_snapshots enable row level security;
alter table public.curriculum_design_revisions enable row level security;
revoke all on public.curriculum_design_documents, public.curriculum_design_locks,
  public.curriculum_design_snapshots, public.curriculum_design_revisions from public, anon, authenticated;
grant select on public.curriculum_design_documents, public.curriculum_design_locks,
  public.curriculum_design_snapshots, public.curriculum_design_revisions to authenticated;
create policy curriculum_design_document_read on public.curriculum_design_documents for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);
create policy curriculum_design_lock_read on public.curriculum_design_locks for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);
create policy curriculum_design_snapshot_read on public.curriculum_design_snapshots for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);
create policy curriculum_design_revision_read on public.curriculum_design_revisions for select to authenticated
  using ((select private.workspace_role(workspace_id)) is not null);

create function private.curriculum_design_acquire(target_plan uuid, take_over boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p record; lockrow public.curriculum_design_locks%rowtype; actor_role text;
begin
  select id,workspace_id from public.curriculum_plans where id=target_plan into p;
  if p.id is null then raise exception '교육과정 편성표를 찾지 못했습니다.'; end if;
  actor_role:=private.workspace_role(p.workspace_id);
  if auth.uid() is null or coalesce(actor_role,'') not in ('admin','editor') then
    raise exception '교육과정 편집 권한이 없습니다.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_plan::text,6));
  select * from public.curriculum_design_locks where plan_id=target_plan into lockrow for update;
  if lockrow.plan_id is null then
    insert into public.curriculum_design_locks(plan_id,workspace_id,editor_id,expires_at)
      values(target_plan,p.workspace_id,auth.uid(),now()+interval '2 minutes');
  elsif lockrow.editor_id=auth.uid() or lockrow.expires_at<=now() or (take_over and actor_role='admin') then
    update public.curriculum_design_locks
      set editor_id=auth.uid(),expires_at=now()+interval '2 minutes',updated_at=now()
      where plan_id=target_plan;
  else
    return jsonb_build_object('acquired',false,'expires_at',lockrow.expires_at,'editor_id',lockrow.editor_id);
  end if;
  return jsonb_build_object('acquired',true,'expires_at',now()+interval '2 minutes','editor_id',auth.uid());
end $$;
create function public.curriculum_design_acquire(target_plan uuid, take_over boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select private.curriculum_design_acquire(target_plan,take_over)
$$;

create function private.curriculum_design_release(target_plan uuid)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; owner_role text; target uuid;
begin
 select workspace_id into target from public.curriculum_plans where id=target_plan;
 if target is null then raise exception '편성표를 찾지 못했습니다.'; end if;
 owner_role:=private.workspace_role(target);
 if auth.uid() is null or coalesce(owner_role,'') not in ('admin','editor') then
   raise exception '편집 권한이 없습니다.' using errcode='42501';
 end if;
 select editor_id into owner_id from public.curriculum_design_locks where plan_id=target_plan;
 if owner_id=auth.uid() or owner_role='admin' then
  delete from public.curriculum_design_locks where plan_id=target_plan;
 end if;
end $$;
create function public.curriculum_design_release(target_plan uuid)
returns void language sql security invoker set search_path='' as $$
 select private.curriculum_design_release(target_plan)
$$;

create function private.curriculum_design_save(
 target_plan uuid, expected_plan_version integer, expected_doc_version integer, next_document jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p record; lockrow public.curriculum_design_locks%rowtype;
  current_doc_version integer; entries jsonb; current_new_version integer; item jsonb; hour_value numeric;
  row_count integer; grade_value integer; semester_value integer; basis_weeks integer; year_key text;
  adjustment numeric; manual numeric; week_hours numeric; entry jsonb;
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
  row_count:=jsonb_array_length(next_document->'cells');
  if row_count<=0 or row_count>3600 then raise exception '편성표 항목 개수를 확인해 주세요.'; end if;
  select version into current_doc_version from public.curriculum_design_documents where plan_id=target_plan for update;
  if coalesce(current_doc_version,0)<>expected_doc_version then
    raise exception '다른 편집본이 저장되었습니다. 최신 자료를 다시 확인해 주세요.';
  end if;
  entries:='[]'::jsonb;
  for item in select value from jsonb_array_elements(next_document->'cells') loop
    if (item->>'subjectId') is null or (item->>'subjectId') !~* '^[0-9a-f-]{36}$'
      or (item->>'grade') !~ '^[1-6]$'
      or (item->>'semester') !~ '^[12]$'
      or (item->>'weekly') !~ '^[0-9]{1,3}(\.[0-9]{1,6})?$'
      or coalesce(item->>'manual','0') !~ '^[-]?[0-9]{1,4}(\.[0-9]{1,6})?$'
      or jsonb_typeof(coalesce(item->'adjustments','[]'::jsonb))<>'array' then
      raise exception '학년·학기·주당 시수 및 조정값 형식을 확인해 주세요.';
    end if;
    grade_value:=(item->>'grade')::integer;semester_value:=(item->>'semester')::integer;
    year_key:=(p.cohort_year+grade_value-1)::text;
    basis_weeks:=coalesce((next_document->'weeks'->year_key->>'count')::integer,16);
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
create function public.curriculum_design_save(
 target_plan uuid, expected_plan_version integer, expected_doc_version integer, next_document jsonb
) returns jsonb language sql security invoker set search_path='' as $$
 select private.curriculum_design_save(target_plan,expected_plan_version,expected_doc_version,next_document)
$$;

create function private.curriculum_design_confirm(target_plan uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p record; d record; result_id uuid;
begin
 select id,workspace_id,version into p from public.curriculum_plans where id=target_plan;
 if p.id is null or auth.uid() is null or
   coalesce(private.workspace_role(p.workspace_id),'') not in ('admin','editor') then
   raise exception '확정 권한이 없습니다.' using errcode='42501';
 end if;
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
create function public.curriculum_design_confirm(target_plan uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.curriculum_design_confirm(target_plan)
$$;
revoke all on function private.curriculum_design_acquire(uuid,boolean),
 private.curriculum_design_release(uuid),
 private.curriculum_design_save(uuid,integer,integer,jsonb),
 private.curriculum_design_confirm(uuid),
 public.curriculum_design_acquire(uuid,boolean),
 public.curriculum_design_release(uuid),
 public.curriculum_design_save(uuid,integer,integer,jsonb),
 public.curriculum_design_confirm(uuid)
 from public,anon,authenticated;
grant execute on function private.curriculum_design_acquire(uuid,boolean),
 private.curriculum_design_release(uuid),
 private.curriculum_design_save(uuid,integer,integer,jsonb),
 private.curriculum_design_confirm(uuid),
 public.curriculum_design_acquire(uuid,boolean),
 public.curriculum_design_release(uuid),
 public.curriculum_design_save(uuid,integer,integer,jsonb),
 public.curriculum_design_confirm(uuid) to authenticated;
