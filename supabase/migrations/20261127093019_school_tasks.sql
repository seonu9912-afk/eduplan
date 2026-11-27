-- A shared task has one original. Recipient rows retain the teacher and account
-- selected at distribution time, even if the roster is later changed.
create table public.school_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  academic_year_id uuid not null,
  owner_id uuid references auth.users(id) on delete set null,
  author_name text check (char_length(author_name) between 1 and 80),
  kind text not null check (kind in ('personal','distributed')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  department text not null default '' check (char_length(department) <= 60),
  due_date date,
  due_time time,
  resources jsonb not null default '[]' check (private.valid_external_resources(resources)),
  submission_url text check (private.valid_external_url(submission_url)),
  source_business_id text check (char_length(source_business_id) between 1 and 80),
  deadline_from_source boolean not null default false,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique(workspace_id,academic_year_id,id),
  foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id) on delete cascade,
  check (not deadline_from_source or (source_business_id is not null and due_date is null)),
  check (due_time is null or ((due_date is not null or deadline_from_source)
    and due_time < time '24:00' and extract(second from due_time)=0)),
  check (kind='distributed' or (source_business_id is null and submission_url is null and
    cancelled_at is null and department='' and author_name is null)),
  check (kind='personal' or (completed_at is null and author_name is not null))
);
create index school_tasks_owner on public.school_tasks(workspace_id,academic_year_id,owner_id);
create unique index school_tasks_source on public.school_tasks(workspace_id,academic_year_id,source_business_id)
  where source_business_id is not null;

create table public.school_task_recipients (
  workspace_id uuid not null,
  academic_year_id uuid not null,
  task_id uuid not null,
  teacher_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  recipient_name text not null check (char_length(recipient_name) between 1 and 80),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  removed_at timestamptz,
  primary key(task_id,teacher_id),
  unique(task_id,user_id),
  foreign key(workspace_id,academic_year_id,task_id) references public.school_tasks(workspace_id,academic_year_id,id) on delete cascade,
  foreign key(workspace_id,teacher_id) references public.school_teachers(workspace_id,id)
);
create index school_task_recipients_account on public.school_task_recipients(workspace_id,academic_year_id,user_id);
create index school_task_recipients_teacher on public.school_task_recipients(workspace_id,teacher_id);

-- The author check reads the original without recursively applying task RLS.
create function private.owns_school_task(target uuid, task uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.school_tasks t
    where t.workspace_id=target and t.id=task and t.kind='distributed' and t.owner_id=auth.uid());
$$;
alter table public.school_tasks enable row level security;
alter table public.school_task_recipients enable row level security;
revoke all on public.school_tasks,public.school_task_recipients from public,anon,authenticated;
grant select on public.school_tasks,public.school_task_recipients to authenticated;
create policy school_task_read on public.school_tasks for select to authenticated using (
  (select private.workspace_role(workspace_id)) is not null and
  (owner_id=(select auth.uid()) or (kind='distributed' and exists(
    select 1 from public.school_task_recipients r where r.task_id=school_tasks.id
      and r.user_id=(select auth.uid()) and r.removed_at is null
  )))
);
create policy school_task_recipient_read on public.school_task_recipients for select to authenticated using (
  (select private.workspace_role(workspace_id)) is not null and
  ((user_id=(select auth.uid()) and removed_at is null) or (select private.owns_school_task(workspace_id,task_id)))
);

alter table public.operation_notifications add column task_id uuid, add column task_version integer;
alter table public.operation_notifications add constraint operation_task_scope
  foreign key(workspace_id,academic_year_id,task_id) references public.school_tasks(workspace_id,academic_year_id,id) on delete cascade;
alter table public.operation_notifications drop constraint operation_source;
alter table public.operation_notifications add constraint operation_source check (
  (publication_id is not null and request_id is null and task_id is null and task_version is null)
  or (publication_id is null and request_id is not null and request_version is not null and task_id is null and task_version is null)
  or (publication_id is null and request_id is null and request_version is null and task_id is not null and task_version is not null)
);
create unique index operation_task_recipient on public.operation_notifications(task_id,task_version,user_id) where task_id is not null;

create function private.school_task_staff(target uuid, year_id uuid)
returns table(teacher_id uuid,user_id uuid,display_name text,department text,grade smallint)
language sql stable set search_path='' as $$
  select a.teacher_id,a.user_id,a.display_name,a.department,c.grade
  from public.staff_appointments a
  join public.workspace_members m on m.workspace_id=a.workspace_id and m.user_id=a.user_id
  left join public.classes c on c.id=a.homeroom_class_id and c.workspace_id=a.workspace_id
    and c.academic_year_id=a.academic_year_id
  where a.workspace_id=target and a.academic_year_id=year_id and a.status='재직';
$$;

create function private.school_task_audience(target uuid, year_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from private.school_task_staff(target,year_id) s where s.user_id=auth.uid())
    then coalesce((select jsonb_agg(to_jsonb(s) order by s.display_name,s.teacher_id)
      from private.school_task_staff(target,year_id) s),'[]'::jsonb) else '[]'::jsonb end;
$$;
create function public.school_task_audience(target uuid, year_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select private.school_task_audience(target,year_id);
$$;

create function private.notify_school_task(t public.school_tasks, recipients uuid[], notice_title text, notice_body text)
returns void language sql set search_path='' as $$
  insert into public.operation_notifications(workspace_id,academic_year_id,user_id,task_id,task_version,title,body)
    select t.workspace_id,t.academic_year_id,m.user_id,t.id,t.version,notice_title,notice_body
    from public.workspace_members m where m.workspace_id=t.workspace_id and m.user_id=any(recipients)
  on conflict(task_id,task_version,user_id) where task_id is not null do nothing;
$$;

-- Confirm the precise teacher/account pairs the sender previewed; roster edits can
-- never silently redirect a delivery. Existing removed rows may be restored.
create function private.add_school_task_recipients(t public.school_tasks, audience jsonb)
returns uuid[] language plpgsql set search_path='' as $$
declare changed uuid[];
begin
  if jsonb_typeof(audience) is distinct from 'array' or jsonb_array_length(audience) not between 1 and 1000 then
    raise exception '배포할 교원을 선택해 주세요.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_to_recordset(audience) x(teacher_id uuid,user_id uuid)
    where not exists(select 1 from private.school_task_staff(t.workspace_id,t.academic_year_id) s
      where s.teacher_id=x.teacher_id and s.user_id=x.user_id)
  ) then raise exception '교원 명부가 변경되었습니다. 새로고침 후 수신자를 다시 확인해 주세요.' using errcode='40001'; end if;
  if exists(
    select 1 from jsonb_to_recordset(audience) x(teacher_id uuid,user_id uuid)
    join public.school_task_recipients r on r.task_id=t.id
      and (r.teacher_id=x.teacher_id or r.user_id=x.user_id)
    where (r.teacher_id,r.user_id) is distinct from (x.teacher_id,x.user_id)
  ) then raise exception '이 업무에 저장된 수신 계정 연결이 변경되었습니다. 기존 기록은 보존됩니다.' using errcode='40001'; end if;
  with inserted as (
    insert into public.school_task_recipients(workspace_id,academic_year_id,task_id,teacher_id,user_id,recipient_name)
    select distinct t.workspace_id,t.academic_year_id,t.id,s.teacher_id,s.user_id,s.display_name
    from private.school_task_staff(t.workspace_id,t.academic_year_id) s
    join jsonb_to_recordset(audience) x(teacher_id uuid,user_id uuid) using (teacher_id,user_id)
    on conflict(task_id,teacher_id) do update set removed_at=null
      where school_task_recipients.removed_at is not null
    returning user_id
  ) select coalesce(array_agg(user_id),'{}'::uuid[]) into changed from inserted;
  if exists(
    select 1 from jsonb_to_recordset(audience) x(teacher_id uuid,user_id uuid)
    where not exists(select 1 from public.school_task_recipients r where r.task_id=t.id
      and r.teacher_id=x.teacher_id and r.user_id=x.user_id and r.removed_at is null)
  ) then raise exception '수신자 목록이 변경되었습니다. 새로고침 후 다시 확인해 주세요.' using errcode='40001'; end if;
  return changed;
end $$;

create function private.save_school_task(target uuid, year_id uuid, task uuid, expected_version integer, input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); school_year integer; actor_name text;
  old_task public.school_tasks; saved public.school_tasks;
  mode text := input->>'kind'; stored_title text := btrim(input->>'title');
  source_id text := nullif(input->>'source_business_id',''); source_row jsonb;
  audience uuid[];
begin
  if actor is null or private.workspace_role(target) is null then
    raise exception '학교 할 일에 접근할 수 없습니다.' using errcode='42501';
  end if;
  select y.year into school_year from public.academic_years y join public.schools s on s.id=y.workspace_id
    where y.workspace_id=target and y.id=year_id;
  if not found then raise exception '학교 학년도를 확인해 주세요.' using errcode='42501'; end if;
  if mode is null or mode not in ('personal','distributed') or expected_version is null or expected_version<0 then
    raise exception '할 일 정보를 확인해 주세요.' using errcode='22023';
  end if;
  if expected_version>0 then
    select * into old_task from public.school_tasks where id=task and workspace_id=target and academic_year_id=year_id
      and owner_id=actor and kind=mode for update;
    if not found then raise exception '작성자만 업무를 수정할 수 있습니다.' using errcode='42501'; end if;
    if old_task.version<>expected_version or old_task.cancelled_at is not null then
      raise exception '업무 상태가 변경되었습니다. 새로고침해 주세요.' using errcode='40001';
    end if;
    if old_task.source_business_id is distinct from source_id then
      raise exception '배포한 업무의 원본 연결은 변경할 수 없습니다.' using errcode='22023';
    end if;
  end if;
  if mode='distributed' then
    select s.display_name into actor_name from private.school_task_staff(target,year_id) s where s.user_id=actor;
    if expected_version=0 and actor_name is null then
      raise exception '재직 교원 명부에 연결된 계정만 배포할 수 있습니다.' using errcode='42501';
    end if;
  end if;
  if source_id is not null and expected_version=0 then
    select b.item into source_row from (
      select p.payload from public.school_plan_publications p
      where p.workspace_id=target and p.academic_year_id=year_id and p.domain='plans'
        and p.starts_on<=greatest(make_date(school_year,3,1),
          least((now() at time zone 'Asia/Seoul')::date,make_date(school_year+1,3,1)-1))
      order by p.starts_on desc,p.source_version desc,p.published_at desc limit 1
    ) release cross join lateral jsonb_array_elements(release.payload->'business') b(item)
    where b.item->>'id'=source_id limit 1;
    if source_row is null then raise exception '적용 중인 공개 업무계획을 선택해 주세요.' using errcode='22023'; end if;
    stored_title := left(btrim(source_row->>'text'),200);
  elsif source_id is not null then
    stored_title := old_task.title;
  end if;
  if expected_version=0 then
    insert into public.school_tasks(id,workspace_id,academic_year_id,owner_id,author_name,kind,title,description,
      department,due_date,due_time,resources,submission_url,source_business_id,deadline_from_source)
    values(task,target,year_id,actor,actor_name,mode,stored_title,coalesce(input->>'description',''),
      coalesce(input->>'department',''),(input->>'due_date')::date,(input->>'due_time')::time,
      coalesce(input->'resources','[]'),input->>'submission_url',source_id,coalesce((input->>'deadline_from_source')::boolean,false))
    returning * into saved;
    if mode='distributed' then
      audience := private.add_school_task_recipients(saved,input->'audience');
      perform private.notify_school_task(saved,audience,'새 업무 배포',saved.title);
    end if;
  else
    update public.school_tasks set title=stored_title, description=coalesce(input->>'description',''),
      department=coalesce(input->>'department',''), due_date=(input->>'due_date')::date, due_time=(input->>'due_time')::time,
      resources=coalesce(input->'resources','[]'), submission_url=input->>'submission_url',
      deadline_from_source=coalesce((input->>'deadline_from_source')::boolean,false),version=version+1,updated_at=now()
    where id=task returning * into saved;
    if mode='distributed' and
      (saved.title,saved.description,saved.department,saved.due_date,saved.due_time,saved.resources,saved.submission_url,saved.deadline_from_source)
      is distinct from
      (old_task.title,old_task.description,old_task.department,old_task.due_date,old_task.due_time,old_task.resources,old_task.submission_url,old_task.deadline_from_source)
    then
      select array_agg(r.user_id) into audience from public.school_task_recipients r where r.task_id=task and r.removed_at is null;
      perform private.notify_school_task(saved,audience,
        case when (saved.due_date,saved.due_time,saved.deadline_from_source)
          is distinct from (old_task.due_date,old_task.due_time,old_task.deadline_from_source)
          then '업무 마감 변경' else '업무 변경' end,saved.title);
    end if;
  end if;
  return saved.id;
end $$;
create function public.save_school_task(target uuid, year_id uuid, task uuid, expected_version integer, input jsonb)
returns uuid language sql security invoker set search_path='' as $$
  select private.save_school_task(target,year_id,task,expected_version,input);
$$;

create function private.change_school_task(target uuid, task uuid, expected_version integer, command text, input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); t public.school_tasks; audience uuid[]; affected uuid; recipient uuid;
  complete boolean := (input->>'completed')::boolean;
begin
  if actor is null or private.workspace_role(target) is null then
    raise exception '학교 할 일에 접근할 수 없습니다.' using errcode='42501';
  end if;
  select * into t from public.school_tasks where id=task and workspace_id=target and
    (owner_id=actor or (command='complete' and exists(
      select 1 from public.school_task_recipients r where r.task_id=task and r.user_id=actor and r.removed_at is null)))
    for update;
  if not found then raise exception '이 할 일을 변경할 수 없습니다.' using errcode='42501'; end if;
  if t.version is distinct from expected_version or t.cancelled_at is not null then
    raise exception '업무 상태가 변경되었습니다. 새로고침해 주세요.' using errcode='40001';
  end if;
  if command='complete' and complete is not null then
    if t.kind='personal' then
      update public.school_tasks set completed_at=case when complete then coalesce(completed_at,now()) end,
        version=version+1,updated_at=now() where id=task;
    else
      update public.school_task_recipients set completed_at=case when complete then coalesce(completed_at,now()) end
        where task_id=task and user_id=actor and removed_at is null;
      if not found then raise exception '수신 교원만 완료 상태를 변경할 수 있습니다.' using errcode='42501'; end if;
    end if;
    return;
  end if;
  if command='delete' and t.kind='personal' then
    delete from public.school_tasks where id=task;
    return;
  end if;
  if t.kind<>'distributed' or command is null or command not in ('cancel','add','remove','redo') then
    raise exception '할 일 변경 내용을 확인해 주세요.' using errcode='22023';
  end if;
  if command='add' and not exists(select 1 from private.school_task_staff(target,t.academic_year_id) s where s.user_id=actor) then
    raise exception '명부에 연결된 재직 교원만 수신자를 추가할 수 있습니다.' using errcode='42501';
  end if;
  update public.school_tasks set version=version+1,updated_at=now(),
    cancelled_at=case when command='cancel' then now() else cancelled_at end where id=task returning * into t;
  if command='cancel' then
    select array_agg(r.user_id) into audience from public.school_task_recipients r where r.task_id=task and r.removed_at is null;
    perform private.notify_school_task(t,audience,'업무 취소',t.title);
  elsif command='add' then
    audience := private.add_school_task_recipients(t,input->'audience');
    perform private.notify_school_task(t,audience,'새 업무 배포',t.title);
  else
    recipient := (input->>'teacher_id')::uuid;
    if command='remove' then
      update public.school_task_recipients set removed_at=now()
        where task_id=task and teacher_id=recipient and removed_at is null returning user_id into affected;
      if not found then raise exception '현재 수신자를 확인해 주세요.' using errcode='22023'; end if;
      perform private.notify_school_task(t,array[affected],'업무 배포 대상 제외',t.title);
    else
      update public.school_task_recipients set completed_at=null
        where task_id=task and teacher_id=recipient and removed_at is null and completed_at is not null returning user_id into affected;
      if not found then raise exception '완료한 수신자에게만 재수행을 요청할 수 있습니다.' using errcode='22023'; end if;
      perform private.notify_school_task(t,array[affected],'업무 재수행 요청',t.title);
    end if;
  end if;
end $$;
create function public.change_school_task(target uuid, task uuid, expected_version integer, command text, input jsonb)
returns void language sql security invoker set search_path='' as $$
  select private.change_school_task(target,task,expected_version,command,input);
$$;

revoke all on function private.school_task_staff(uuid,uuid),private.notify_school_task(public.school_tasks,uuid[],text,text),
  private.add_school_task_recipients(public.school_tasks,jsonb) from public,anon,authenticated;
revoke all on function private.owns_school_task(uuid,uuid),
  private.school_task_audience(uuid,uuid),public.school_task_audience(uuid,uuid),
  private.save_school_task(uuid,uuid,uuid,integer,jsonb),public.save_school_task(uuid,uuid,uuid,integer,jsonb),
  private.change_school_task(uuid,uuid,integer,text,jsonb),public.change_school_task(uuid,uuid,integer,text,jsonb)
  from public,anon;
grant execute on function private.owns_school_task(uuid,uuid),
  private.school_task_audience(uuid,uuid),public.school_task_audience(uuid,uuid),
  private.save_school_task(uuid,uuid,uuid,integer,jsonb),public.save_school_task(uuid,uuid,uuid,integer,jsonb),
  private.change_school_task(uuid,uuid,integer,text,jsonb),public.change_school_task(uuid,uuid,integer,text,jsonb)
  to authenticated;
