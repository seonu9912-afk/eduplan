create table private.teaching_submission_deadlines (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  semester integer not null check(semester in (1,2)),
  lesson_due date, assessment_due date,
  version integer not null default 1 check(version>0),
  updated_by uuid not null, updated_at timestamptz not null default now(),
  primary key(workspace_id,academic_year_id,semester)
);
alter table private.teaching_submission_deadlines enable row level security;
revoke all on private.teaching_submission_deadlines from public,anon,authenticated;

create function private.save_teaching_deadlines(target uuid,year_id uuid,term integer,expected_version integer,lesson_date date,assessment_date date) returns integer
language plpgsql security definer set search_path='' as $$
declare yr integer; current_version integer;
begin
 if not private.teaching_submission_reviewer(target) then raise exception '제출 기한 설정 권한이 없습니다.' using errcode='42501'; end if;
 select year into yr from public.academic_years where id=year_id and workspace_id=target for update;
 if yr is null or term is null or term not in (1,2) then raise exception '학년도와 학기를 확인하세요.'; end if;
 if (lesson_date is not null and (lesson_date<make_date(yr-1,12,1) or lesson_date>=make_date(yr+1,3,1))) or
 (assessment_date is not null and (assessment_date<make_date(yr-1,12,1) or assessment_date>=make_date(yr+1,3,1))) then raise exception '해당 학년도의 제출 기한을 입력하세요.';end if;
 select version into current_version from private.teaching_submission_deadlines where workspace_id=target and academic_year_id=year_id and semester=term;
 if coalesce(current_version,0) is distinct from expected_version then raise exception '다른 담당자가 기한을 변경했습니다. 새로고침 후 다시 확인하세요.';end if;
 insert into private.teaching_submission_deadlines(workspace_id,academic_year_id,semester,lesson_due,assessment_due,updated_by)
 values(target,year_id,term,lesson_date,assessment_date,auth.uid())
 on conflict(workspace_id,academic_year_id,semester) do update set lesson_due=excluded.lesson_due,assessment_due=excluded.assessment_due,
 version=teaching_submission_deadlines.version+1,updated_by=auth.uid(),updated_at=now()
 returning version into current_version;
 return current_version;
end $$;

create function private.teaching_deadline_data(target uuid,year_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare local_today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if (select auth.uid()) is null or private.workspace_role(target) is null or not exists(select 1 from public.academic_years where id=year_id and workspace_id=target) then raise exception '제출 기한 조회 권한이 없습니다.' using errcode='42501';end if;
 return jsonb_build_object(
 'deadlines',coalesce((select jsonb_agg(jsonb_build_object('semester',d.semester,'lesson_due',d.lesson_due,'assessment_due',d.assessment_due,'version',d.version) order by d.semester) from private.teaching_submission_deadlines d where d.workspace_id=target and d.academic_year_id=year_id),'[]'::jsonb),
 'alerts',coalesce((
 with authored as (
 select c.id,c.grade,c.semester,c.subject_name from public.teaching_courses c where c.workspace_id=target and c.academic_year_id=year_id and not c.archived and private.teaching_submission_author(c.id)
 ), scopes as (
 select a.*,s.scope,case when s.scope='lesson' then (select min(d.lesson_due) from private.teaching_submission_deadlines d where d.workspace_id=target and d.academic_year_id=year_id and (a.semester=0 or d.semester=a.semester))
 else (select d.assessment_due from private.teaching_submission_deadlines d where d.workspace_id=target and d.academic_year_id=year_id and d.semester=right(s.scope,1)::integer) end due
 from authored a cross join lateral (select 'lesson'::text scope union all select 'assessment_'||t from generate_series(1,2) t where a.semester=0 or a.semester=t) s
 ), pending as (
 select a.*,last.status,last.review_note from scopes a left join lateral (select s.status,s.review_note from private.teaching_submissions s where s.course_id=a.id and s.scope=a.scope order by submitted_at desc,id desc limit 1) last on true
 where (last.status='changes_requested' or (coalesce(last.status,'withdrawn')='withdrawn' and a.due<=local_today+7))
 )
 select jsonb_agg(jsonb_build_object('course_id',id,'grade',grade,'subject_name',subject_name,'scope',scope,'due_date',due,'kind',case when status='changes_requested' then 'changes_requested' when due<local_today then 'overdue' when due=local_today then 'today' else 'upcoming' end,'note',case when status='changes_requested' then review_note else '' end) order by due nulls first,grade,subject_name,scope)
 from pending
 ),'[]'::jsonb));
end $$;
create function public.save_teaching_deadlines(target uuid,year_id uuid,term integer,expected_version integer,lesson_date date,assessment_date date) returns integer
language sql security invoker set search_path='' as $$ select private.save_teaching_deadlines(target,year_id,term,expected_version,lesson_date,assessment_date) $$;
create function public.teaching_deadline_data(target uuid,year_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.teaching_deadline_data(target,year_id) $$;
revoke all on function private.save_teaching_deadlines(uuid,uuid,integer,integer,date,date),public.save_teaching_deadlines(uuid,uuid,integer,integer,date,date),private.teaching_deadline_data(uuid,uuid),public.teaching_deadline_data(uuid,uuid) from public,anon,authenticated;
grant execute on function private.save_teaching_deadlines(uuid,uuid,integer,integer,date,date),public.save_teaching_deadlines(uuid,uuid,integer,integer,date,date),private.teaching_deadline_data(uuid,uuid),public.teaching_deadline_data(uuid,uuid) to authenticated;