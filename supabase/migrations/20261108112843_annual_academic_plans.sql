create table public.annual_academic_plans (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 academic_year_id uuid primary key,
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<1500000),
 version integer not null default 1,
 history jsonb not null default '[]',
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id) on delete cascade
);
alter table public.annual_academic_plans enable row level security;
create index annual_plan_workspace_idx on public.annual_academic_plans(workspace_id);
grant select on public.annual_academic_plans to authenticated;
create policy annual_plan_read on public.annual_academic_plans for select to authenticated using (private.workspace_role(workspace_id) is not null);
create function private.save_annual_plan(target uuid, year_id uuid, expected_version integer, payload jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare current_row public.annual_academic_plans; result integer; grade_limit integer; school_year integer;
begin
 grade_limit:=private.lock_workspace_grade_count(target);
 select year into school_year from public.academic_years where id=year_id and workspace_id=target;
 if school_year is null then raise exception '학년도를 확인해 주세요.'; end if;
 if expected_version is null or expected_version<0 then raise exception '저장 버전을 확인해 주세요.';end if;
 if jsonb_typeof(payload) is distinct from 'object' or not(payload ?& array['vacations','days','holidays','timetable','recurring','allocations','business','departments','weather']) then raise exception '연간 계획 형식을 확인해 주세요.';end if;
 if jsonb_typeof(payload->'days') is distinct from 'object' or jsonb_typeof(payload->'holidays') is distinct from 'object' then raise exception '학사일 형식을 확인해 주세요.';end if;
 if exists(select 1 from unnest(array['vacations','timetable','recurring','allocations','business','departments']) k where jsonb_typeof(payload->k) is distinct from 'array') then raise exception '계획 형식을 확인해 주세요.';end if;
 if exists(select 1 from jsonb_array_elements((payload->'timetable')||(payload->'recurring')) e where (e->>'grade')::int not between 1 and grade_limit) then raise exception '학교급에 맞는 학년을 선택해 주세요.';end if;
 if exists(select 1 from jsonb_array_elements(payload->'allocations') e,jsonb_object_keys(e->'areas') g where g::int not between 1 and grade_limit) then raise exception '학교급에 맞는 학년을 선택해 주세요.';end if;
 if exists(select 1 from jsonb_object_keys((payload->'days')||(payload->'holidays')) d where d::date<make_date(school_year,3,1) or d::date>=make_date(school_year+1,3,1)) then raise exception '학년도 안의 날짜를 선택해 주세요.';end if;
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,2));
 select * into current_row from public.annual_academic_plans where academic_year_id=year_id for update;
 if coalesce(current_row.version,0)<>expected_version then raise exception '다른 사용자가 연간 계획을 변경했습니다. 새로고침 후 다시 시도해 주세요.';end if;
 result:=expected_version+1;
 if expected_version=0 then insert into public.annual_academic_plans(workspace_id,academic_year_id,document) values(target,year_id,payload);
 else update public.annual_academic_plans set document=payload,version=result,updated_at=now(),history=(select coalesce(jsonb_agg(v),'[]') from (select v from jsonb_array_elements(jsonb_build_array(jsonb_build_object('version',current_row.version,'at',current_row.updated_at,'document',current_row.document))||current_row.history) with ordinality a(v,n) where n<=30) h) where academic_year_id=year_id;end if;
 insert into public.activity_log(workspace_id,actor_id,action,label) values(target,auth.uid(),'save',school_year||'학년도 연간 학사일정 저장');return result;
end $$;
create function public.save_annual_plan(target uuid,year_id uuid,expected_version integer,payload jsonb) returns integer language sql security invoker set search_path='' as $$select private.save_annual_plan(target,year_id,expected_version,payload)$$;
revoke all on function private.save_annual_plan(uuid,uuid,integer,jsonb),public.save_annual_plan(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.save_annual_plan(uuid,uuid,integer,jsonb),public.save_annual_plan(uuid,uuid,integer,jsonb) to authenticated;
create function private.guard_annual_school_type() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.school_type<>'초등학교' and old.school_type='초등학교' and exists(select 1 from public.annual_academic_plans p,jsonb_array_elements((p.document->'timetable')||(p.document->'recurring')) e where p.workspace_id=new.id and (e->>'grade')::int>3) then raise exception '4~6학년 연간 계획이 있어 학교급을 변경할 수 없습니다.';end if;
 return new;
end $$;
revoke all on function private.guard_annual_school_type() from public,anon,authenticated;
create trigger annual_school_type_guard before update of school_type on public.workspaces for each row execute function private.guard_annual_school_type();
