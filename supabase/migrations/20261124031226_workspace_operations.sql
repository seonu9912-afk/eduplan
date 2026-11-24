-- Additive common staff roster, immutable scenarios/publications and private inbox.
-- No existing records are rewritten. Account linkage is administrator-approved.
create table public.staff_appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  academic_year_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  subject_ids uuid[] not null default '{}',
  primary_subject_id uuid,
  department text not null default '' check(length(department)<=60),
  duties text not null default '' check(length(duties)<=300),
  homeroom_class_id uuid,
  employment text not null check(employment in ('정규','기간제','시간강사','순회','미정')),
  status text not null check(status in ('재직','휴직','전출','퇴직','배치 예정')),
  target_hours numeric not null check(target_hours between 0 and 40),
  reduction_hours numeric not null check(reduction_hours between 0 and target_hours),
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  unique(workspace_id,academic_year_id,user_id),
  foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id) on delete cascade,
  foreign key(workspace_id,primary_subject_id) references public.subjects(workspace_id,id),
  foreign key(workspace_id,homeroom_class_id) references public.classes(workspace_id,id)
);
create index staff_appointments_year_idx on public.staff_appointments(workspace_id,academic_year_id);
create index staff_appointments_user_idx on public.staff_appointments(user_id);
alter table public.staff_appointments enable row level security;
grant select on public.staff_appointments to authenticated;
create policy staff_authorized_read on public.staff_appointments for select to authenticated using (
  (select private.workspace_role(workspace_id)) in ('admin','editor') or
  ((select private.workspace_role(workspace_id)) is not null and user_id=(select auth.uid()))
);
create table public.staff_appointment_history (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid not null references public.staff_appointments(id) on delete cascade,
  document jsonb not null, changed_at timestamptz not null default now(), changed_by uuid references auth.users(id)
);
alter table public.staff_appointment_history enable row level security;
grant select on public.staff_appointment_history to authenticated;
create policy staff_history_read on public.staff_appointment_history for select to authenticated
  using ((select private.workspace_role(workspace_id)) in ('admin','editor'));
create index staff_history_appointment_idx on public.staff_appointment_history(appointment_id);

-- Directory deliberately omits employment, leave reason, targets and reductions.
create function private.staff_directory(target uuid, year_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or private.workspace_role(target) is null then
    raise exception '교원 명부 조회 권한이 없습니다.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'user_id',user_id,'display_name',display_name,'subject_ids',subject_ids,
    'primary_subject_id',primary_subject_id,'department',department,'duties',duties,
    'homeroom_class_id',homeroom_class_id,'active',status in ('재직','배치 예정')) order by display_name)
    from public.staff_appointments where workspace_id=target and academic_year_id=year_id),'[]'::jsonb);
end $$;
create function public.staff_directory(target uuid, year_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.staff_directory(target,year_id) $$;

create function private.save_staff_appointment(target uuid, year_id uuid, appointment_id uuid, expected_version integer, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.staff_appointments%rowtype; saved public.staff_appointments%rowtype;
  account uuid; home_class uuid; primary_subject uuid; qualifications uuid[];
begin
  if auth.uid() is null or coalesce(private.workspace_role(target),'')<>'admin' then
    raise exception '교원 명부 및 계정 연결은 관리자만 변경할 수 있습니다.' using errcode='42501';
  end if;
  if expected_version is null or expected_version<0 or jsonb_typeof(payload) is distinct from 'object' then
    raise exception '교원 입력 또는 버전을 확인하세요.';
  end if;
  perform 1 from public.academic_years where workspace_id=target and id=year_id for update;
  if not found then raise exception '학년도 접근 권한이 없습니다.' using errcode='42501'; end if;
  if jsonb_typeof(payload->'subject_ids') is distinct from 'array' or jsonb_array_length(payload->'subject_ids')>30 then
    raise exception '지도 가능 과목 목록을 확인하세요.';
  end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into qualifications from jsonb_array_elements_text(payload->'subject_ids');
  account:=nullif(payload->>'user_id','')::uuid;
  home_class:=nullif(payload->>'homeroom_class_id','')::uuid;
  primary_subject:=nullif(payload->>'primary_subject_id','')::uuid;
  if account is not null and not exists(select 1 from public.workspace_members where workspace_id=target and user_id=account) then
    raise exception '학교에 가입한 구성원만 연결할 수 있습니다.' using errcode='42501';
  end if;
  if home_class is not null and not exists(select 1 from public.classes where workspace_id=target and academic_year_id=year_id and id=home_class) then
    raise exception '담임 학급은 같은 학년도의 학급이어야 합니다.';
  end if;
  if exists(select 1 from unnest(qualifications) q where not exists(select 1 from public.subjects where workspace_id=target and id=q))
    or cardinality(qualifications)<>(select count(distinct q) from unnest(qualifications) q)
    or (primary_subject is not null and not primary_subject=any(qualifications)) then
    raise exception '학교의 지도 가능 과목과 주 담당 과목을 확인하세요.';
  end if;
  if appointment_id is not null then
    select * into old from public.staff_appointments where id=appointment_id and workspace_id=target and academic_year_id=year_id for update;
    if not found or old.version<>expected_version then raise exception '교원 명부가 변경되었습니다. 최신 자료를 불러와 비교해 주세요.'; end if;
  elsif expected_version<>0 then raise exception '신규 교원 버전을 확인하세요.'; end if;
  insert into public.staff_appointments(id,workspace_id,academic_year_id,user_id,display_name,subject_ids,primary_subject_id,
    department,duties,homeroom_class_id,employment,status,target_hours,reduction_hours,version)
  values(coalesce(appointment_id,gen_random_uuid()),target,year_id,account,payload->>'display_name',qualifications,primary_subject,
    payload->>'department',payload->>'duties',home_class,payload->>'employment',payload->>'status',
    (payload->>'target_hours')::numeric,(payload->>'reduction_hours')::numeric,coalesce(old.version,0)+1)
  on conflict(id) do update set user_id=excluded.user_id,display_name=excluded.display_name,subject_ids=excluded.subject_ids,
    primary_subject_id=excluded.primary_subject_id,department=excluded.department,duties=excluded.duties,homeroom_class_id=excluded.homeroom_class_id,
    employment=excluded.employment,status=excluded.status,target_hours=excluded.target_hours,reduction_hours=excluded.reduction_hours,
    version=excluded.version,updated_at=now() returning * into saved;
  insert into public.staff_appointment_history(workspace_id,appointment_id,document,changed_by)
    values(target,saved.id,to_jsonb(saved),auth.uid());
  return to_jsonb(saved);
end $$;
create function public.save_staff_appointment(target uuid, year_id uuid, appointment_id uuid, expected_version integer, payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_staff_appointment(target,year_id,appointment_id,expected_version,payload) $$;

create table public.staffing_scenarios (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, academic_year_id uuid not null,
  name text not null check(length(btrim(name)) between 1 and 100), document jsonb not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id) on delete cascade,
  check(jsonb_typeof(document)='object' and octet_length(document::text)<500000)
);
alter table public.staffing_scenarios enable row level security;
grant select, insert on public.staffing_scenarios to authenticated;
create policy scenario_read on public.staffing_scenarios for select to authenticated using ((select private.workspace_role(workspace_id)) in ('admin','editor'));
create policy scenario_create on public.staffing_scenarios for insert to authenticated with check (
  (select private.workspace_role(workspace_id)) in ('admin','editor') and created_by=(select auth.uid()));
create index staffing_scenarios_year_idx on public.staffing_scenarios(workspace_id,academic_year_id);

create table public.timetable_publications (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, academic_year_id uuid not null,
  source_version integer not null, document jsonb not null, published_at timestamptz not null default now(),
  published_by uuid not null references auth.users(id),
  unique(academic_year_id,source_version),
  foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id) on delete cascade
);
alter table public.timetable_publications enable row level security;
grant select on public.timetable_publications to authenticated;
create policy publication_read on public.timetable_publications for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create index timetable_publications_year_idx on public.timetable_publications(workspace_id,academic_year_id,published_at desc);
create table public.operation_notifications (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, academic_year_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  publication_id uuid not null references public.timetable_publications(id) on delete cascade,
  title text not null, body text not null, created_at timestamptz not null default now(), read_at timestamptz,
  unique(publication_id,user_id),
  foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id) on delete cascade
);
alter table public.operation_notifications enable row level security;
grant select on public.operation_notifications to authenticated;
grant update(read_at) on public.operation_notifications to authenticated;
create policy own_notifications_read on public.operation_notifications for select to authenticated
  using (user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) is not null);
create policy own_notifications_update on public.operation_notifications for update to authenticated
  using (user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) is not null)
  with check (user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) is not null);
create index operation_notifications_user_idx on public.operation_notifications(user_id,workspace_id,academic_year_id);

-- Validate direct RPC publications too; the client is not the security boundary.
create function private.check_timetable_publication(target uuid, year_id uuid, doc jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare slot jsonb; ids text[]; key text; occupied text[]:='{}'; teacher text; room text;
  changed_date text; effective_day integer; changed_slots jsonb; change_keys text[]; bell jsonb; last_end text;
begin
  if jsonb_typeof(doc->'weekly') is distinct from 'array' or jsonb_typeof(doc->'classes') is distinct from 'array'
    or jsonb_typeof(doc->'subjects') is distinct from 'array' or jsonb_typeof(doc->'teachers') is distinct from 'array'
    or jsonb_typeof(doc->'groups') is distinct from 'array' or jsonb_typeof(doc->'overrides') is distinct from 'array'
    or jsonb_typeof(doc->'dayRules') is distinct from 'array' or jsonb_typeof(doc->'timetableConfig'->'bell') is distinct from 'array' then
    raise exception '시간표와 학교 일과표 형식을 확인하세요.';
  end if;
  change_keys:='{}';
  for bell in select value from jsonb_array_elements(doc->'timetableConfig'->'bell') where value->>'type'='lesson' order by value->>'start' loop
    if coalesce(bell->>'period','') !~ '^([1-9]|1[0-2])$'
      or coalesce(bell->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(bell->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or bell->>'start'>=bell->>'end' or bell->>'start'<last_end or bell->>'period'=any(change_keys) then
      raise exception '학교 일과표의 교시·시각 중복을 확인하세요.';
    end if;
    last_end:=bell->>'end';change_keys:=array_append(change_keys,bell->>'period');
  end loop;
  for slot in select value from jsonb_array_elements(doc->'weekly') loop
    if coalesce(slot->>'weekday','') !~ '^[1-5]$' or coalesce(slot->>'period','') !~ '^([1-9]|1[0-2])$'
      or coalesce(slot->>'scope','') not in ('class','group') then raise exception '요일·교시·학급 범위를 확인하세요.'; end if;
    teacher:=coalesce(slot->>'teacherId',''); room:=coalesce(slot->>'room','');
    if teacher='' or not exists(select 1 from jsonb_array_elements(doc->'teachers') x where x->>'id'=teacher)
      or not exists(select 1 from jsonb_array_elements(doc->'subjects') x where x->>'id'=slot->>'subjectId') then
      raise exception '과목과 담당 교사를 연결하세요.';
    end if;
    if slot->>'scope'='class' then ids:=array[slot->>'scopeId']; else
      select array_agg(x.value) into ids from jsonb_array_elements(doc->'groups') g,
        lateral jsonb_array_elements_text(g->'classIds') x where g->>'id'=slot->>'scopeId';
    end if;
    if coalesce(cardinality(ids),0)=0 or exists(select 1 from unnest(ids) id where not exists(select 1 from jsonb_array_elements(doc->'classes') c where c->>'id'=id)) then
      raise exception '시간표 학급 연결을 확인하세요.';
    end if;
    if not exists(select 1 from jsonb_array_elements(doc->'timetableConfig'->'bell') b
      where b->>'type'='lesson' and b->>'period'=slot->>'period'
      and b->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and b->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and b->>'start'<b->>'end') then raise exception '교시의 시작·종료 시각을 확인하세요.'; end if;
    if exists(select 1 from public.staff_appointments t where t.workspace_id=target and t.academic_year_id=year_id
      and (t.id::text=teacher or t.user_id::text=teacher) and t.status not in ('재직','배치 예정')) then
      raise exception '비재직 교원의 수업 배정을 검토하세요.';
    end if;
    -- Old account-based teacher IDs and new roster IDs identify the same approved teacher.
    teacher:=coalesce((select t.id::text from public.staff_appointments t where t.workspace_id=target and t.academic_year_id=year_id and t.user_id::text=teacher),teacher);
    ids:=array(select 'class:'||id from unnest(ids) id)||array['teacher:'||teacher];
    if room<>'' then ids:=ids||array['room:'||room]; end if;
    foreach key in array ids loop
      key:=key||':'||(slot->>'weekday')||':'||(slot->>'period');
      if key=any(occupied) then raise exception '시간표의 학급·교사·특별실이 중복 배정되었습니다.'; end if;
      occupied:=array_append(occupied,key);
    end loop;
  end loop;
  -- Validate the effective schedule on every changed date, including collisions
  -- between replacements and recurring lessons. Recursion is one level only.
  change_keys:='{}';
  for slot in select value from jsonb_array_elements(doc->'overrides') loop
    if coalesce(slot->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(slot->>'action','') not in ('cancel','replace')
      or coalesce(slot->>'scope','') not in ('class','group')
      or coalesce(slot->>'period','') !~ '^([1-9]|1[0-2])$'
      or coalesce(slot->>'scopeId','')='' then raise exception '날짜별 수업 변경 형식을 확인하세요.'; end if;
    if (slot->>'date')::date<make_date((doc->>'year')::integer,3,1)
      or (slot->>'date')::date>=make_date((doc->>'year')::integer+1,3,1) then raise exception '변경 날짜는 편성 학년도 안이어야 합니다.'; end if;
    key:=concat_ws(':',slot->>'date',slot->>'scope',slot->>'scopeId',slot->>'period');
    if key=any(change_keys) then raise exception '같은 날짜 수업의 변경 사항이 중복되었습니다.'; end if;
    change_keys:=array_append(change_keys,key);
    if slot->>'scope'='class' and not exists(select 1 from jsonb_array_elements(doc->'classes') c where c->>'id'=slot->>'scopeId')
      or slot->>'scope'='group' and not exists(select 1 from jsonb_array_elements(doc->'groups') g where g->>'id'=slot->>'scopeId') then
      raise exception '변경할 수업의 학급 연결을 확인하세요.';
    end if;
  end loop;
  for changed_date in select distinct value->>'date' from jsonb_array_elements(doc->'overrides') loop
    select nullif((value->>'weekdayOverride')::integer,0) into effective_day from jsonb_array_elements(doc->'dayRules') where value->>'date'=changed_date limit 1;
    effective_day:=coalesce(effective_day,extract(isodow from changed_date::date)::integer);
    if effective_day not between 1 and 5 then raise exception '변경 날짜의 운영 요일을 확인하세요.'; end if;
    select coalesce(jsonb_agg(s),'[]'::jsonb) into changed_slots from jsonb_array_elements(doc->'weekly') s
      where (s->>'weekday')::integer=effective_day and not exists(select 1 from jsonb_array_elements(doc->'overrides') o
        where o->>'date'=changed_date and o->>'scope'=s->>'scope' and o->>'scopeId'=s->>'scopeId' and o->>'period'=s->>'period');
    select changed_slots||coalesce(jsonb_agg(o||jsonb_build_object('weekday',effective_day)),'[]'::jsonb) into changed_slots
      from jsonb_array_elements(doc->'overrides') o where o->>'date'=changed_date and o->>'action'='replace';
    perform private.check_timetable_publication(target,year_id,doc||jsonb_build_object('weekly',changed_slots,'overrides','[]'::jsonb));
  end loop;
end $$;
revoke all on function private.check_timetable_publication(uuid,uuid,jsonb) from public,anon,authenticated;

create function private.publish_timetable(target uuid, year_id uuid, expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_doc public.timetable_documents%rowtype; publication public.timetable_publications%rowtype;
begin
  if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then
    raise exception '시간표 확정 권한이 없습니다.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(year_id::text,7));
  select * into current_doc from public.timetable_documents where workspace_id=target and academic_year_id=year_id for update;
  if not found or expected_version is null or current_doc.version<>expected_version then
    raise exception '시간표가 변경되었습니다. 저장된 최신 버전을 확인하세요.';
  end if;
  if jsonb_typeof(current_doc.document->'weekly') is distinct from 'array' or jsonb_array_length(current_doc.document->'weekly')=0 then
    raise exception '수업이 없는 시간표는 배포할 수 없습니다.';
  end if;
  perform private.check_timetable_publication(target,year_id,current_doc.document);
  insert into public.timetable_publications(workspace_id,academic_year_id,source_version,document,published_by)
    values(target,year_id,current_doc.version,current_doc.document,auth.uid())
    on conflict(academic_year_id,source_version) do nothing returning * into publication;
  if publication.id is null then select * into publication from public.timetable_publications where academic_year_id=year_id and source_version=current_doc.version; end if;
  insert into public.operation_notifications(workspace_id,academic_year_id,user_id,publication_id,title,body)
    select target,year_id,m.user_id,publication.id,'시간표가 확정·변경되었습니다.',
      '배포 버전 '||current_doc.version||'. 오늘의 시간표와 변경·보결 수업을 확인하세요.'
    from public.workspace_members m where m.workspace_id=target
    on conflict(publication_id,user_id) do nothing;
  return to_jsonb(publication);
end $$;
create function public.publish_timetable(target uuid, year_id uuid, expected_version integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.publish_timetable(target,year_id,expected_version) $$;

revoke all on function private.staff_directory(uuid,uuid), public.staff_directory(uuid,uuid),
  private.save_staff_appointment(uuid,uuid,uuid,integer,jsonb),public.save_staff_appointment(uuid,uuid,uuid,integer,jsonb),
  private.publish_timetable(uuid,uuid,integer),public.publish_timetable(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.staff_directory(uuid,uuid), public.staff_directory(uuid,uuid),
  private.save_staff_appointment(uuid,uuid,uuid,integer,jsonb),public.save_staff_appointment(uuid,uuid,uuid,integer,jsonb),
  private.publish_timetable(uuid,uuid,integer),public.publish_timetable(uuid,uuid,integer) to authenticated;
