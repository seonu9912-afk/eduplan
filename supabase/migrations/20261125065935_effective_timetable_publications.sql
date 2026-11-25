-- Immutable publications are selected by effective date, not by latest save time.
alter table public.timetable_publications add unique(workspace_id,academic_year_id,id);
create table public.timetable_effective_versions (
 workspace_id uuid not null,academic_year_id uuid not null,starts_on date not null,publication_id uuid not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(academic_year_id,starts_on),
 foreign key(workspace_id,academic_year_id,publication_id) references public.timetable_publications(workspace_id,academic_year_id,id)
);
alter table public.timetable_effective_versions enable row level security;
grant select on public.timetable_effective_versions to authenticated;
create policy effective_timetable_read on public.timetable_effective_versions for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create index effective_timetable_publication_idx on public.timetable_effective_versions(workspace_id,academic_year_id,publication_id);
-- Older snapshots are kept untouched and require an explicit effective date before operational use.
create function private.publish_timetable_from(target uuid,year_id uuid,expected_version integer,effective_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sy integer; publication jsonb;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '시간표 확정 권한이 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,2));
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,7));
 select year into sy from public.academic_years where id=year_id and workspace_id=target;
 if sy is null or effective_date is null or effective_date<make_date(sy,3,1) or effective_date>=make_date(sy+1,3,1) then raise exception '적용 시작일은 해당 학년도 안에서 지정하세요.'; end if;
 if exists(select 1 from public.timetable_effective_versions where academic_year_id=year_id and starts_on>=effective_date) then raise exception '이미 확정한 적용 시작일 이후 날짜를 선택하세요. 기존 확정본은 보존됩니다.'; end if;
 publication:=private.publish_timetable(target,year_id,expected_version);
 insert into public.timetable_effective_versions values(target,year_id,effective_date,(publication->>'id')::uuid,auth.uid(),now());
 return publication;
end $$;
create function public.publish_timetable_from(target uuid,year_id uuid,expected_version integer,effective_date date) returns jsonb language sql security invoker set search_path='' as $$ select private.publish_timetable_from(target,year_id,expected_version,effective_date) $$;
revoke all on function public.publish_timetable(uuid,uuid,integer),private.publish_timetable(uuid,uuid,integer) from authenticated;
revoke all on function public.publish_timetable_from(uuid,uuid,integer,date),private.publish_timetable_from(uuid,uuid,integer,date) from public,anon;
grant execute on function public.publish_timetable_from(uuid,uuid,integer,date),private.publish_timetable_from(uuid,uuid,integer,date) to authenticated;
-- Additional read-only application/snapshot projection; RLS still applies.
create function public.effective_timetables(target uuid,year_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('starts_on',a.starts_on,'id',p.id,'document',p.document) order by a.starts_on),'[]')
 from public.timetable_effective_versions a join public.timetable_publications p on p.id=a.publication_id
 where a.workspace_id=target and a.academic_year_id=year_id
$$;
revoke all on function public.effective_timetables(uuid,uuid) from public,anon;
grant execute on function public.effective_timetables(uuid,uuid) to authenticated;
