create table public.lesson_records (
 workspace_id uuid not null,academic_year_id uuid not null,date date not null,class_id uuid not null,period integer not null check(period between 1 and 12),
 publication_id uuid not null,lesson_id text not null,subject_id uuid not null,teacher_id uuid not null,
 outcome text not null check(outcome in ('held','cancelled')),actual_minutes integer not null check(actual_minutes between 0 and 240),recognized_hours numeric check(recognized_hours between 0 and 10),
 reason text not null default '' check(length(reason)<=1000),version integer not null default 1,confirmed_by uuid not null references auth.users(id),confirmed_at timestamptz not null default now(),
 primary key(academic_year_id,date,class_id,period),
 foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id),foreign key(workspace_id,academic_year_id,class_id) references public.classes(workspace_id,academic_year_id,id),
 foreign key(workspace_id,academic_year_id,publication_id) references public.timetable_publications(workspace_id,academic_year_id,id),foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id),
 foreign key(workspace_id,academic_year_id,teacher_id) references public.staff_appointments(workspace_id,academic_year_id,id),
 check((outcome='held' and actual_minutes>0) or (outcome='cancelled' and actual_minutes=0)),check(recognized_hours is null or length(btrim(reason))>0),check(outcome<>'cancelled' or length(btrim(reason))>0)
);
create table public.lesson_record_history (
 id bigint generated always as identity primary key,workspace_id uuid not null references public.workspaces(id),academic_year_id uuid not null,document jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id)
);
create index lesson_record_scope on public.lesson_records(workspace_id,academic_year_id,teacher_id);
create index lesson_record_class on public.lesson_records(workspace_id,academic_year_id,class_id);
create index lesson_record_subject on public.lesson_records(workspace_id,subject_id);
create index lesson_record_publication on public.lesson_records(workspace_id,academic_year_id,publication_id);
create index lesson_history_scope on public.lesson_record_history(workspace_id,academic_year_id);
alter table public.lesson_records enable row level security;alter table public.lesson_record_history enable row level security;
grant select on public.lesson_records,public.lesson_record_history to authenticated;
create policy lesson_record_read on public.lesson_records for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create policy lesson_history_read on public.lesson_record_history for select to authenticated using (private.can_plan(workspace_id,'timetable') or actor_id=(select auth.uid()));
create function private.save_lesson_records(target uuid,year_id uuid,source_stamp text,entries jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; old public.lesson_records%rowtype; publication public.timetable_publications%rowtype; teacher uuid; cls uuid; day date; per integer; slot jsonb; saved public.lesson_records%rowtype; n integer:=0;weekday integer;sy integer;
begin
 if auth.uid() is null or private.workspace_role(target) is null then raise exception '수업 실시 확인 권한이 없습니다.'; end if;
 if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) not between 1 and 100 then raise exception '1~100개 수업을 선택하세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,2));perform pg_advisory_xact_lock(hashtextextended(year_id::text,7));
 if source_stamp is distinct from private.planning_source_stamp(target,year_id) then raise exception '시간표 또는 학사일정이 변경되었습니다. 기록할 수업을 다시 확인하세요.'; end if;
 select year into sy from public.academic_years where workspace_id=target and id=year_id;
 for item in select value from jsonb_array_elements(entries) loop
  day:=(item->>'date')::date;per:=(item->>'period')::integer;cls:=(item->>'class_id')::uuid;
  if sy is null or day<make_date(sy,3,1) or day>=make_date(sy+1,3,1) then raise exception '학년도 안의 수업을 기록하세요.'; end if;
  if day>(now() at time zone 'Asia/Seoul')::date then raise exception '미래 수업은 실시 확인할 수 없습니다.'; end if;
  select p.* into publication from public.timetable_effective_versions a join public.timetable_publications p on p.id=a.publication_id where a.workspace_id=target and a.academic_year_id=year_id and a.starts_on<=day order by a.starts_on desc limit 1;
  if publication.id is null or publication.id::text is distinct from item->>'publication_id' then raise exception '해당 날짜의 확정 시간표를 확인하세요.'; end if;
  select case when operation_type='swap' then timetable_weekday else extract(dow from day)::integer end into weekday from public.academic_day_operations where academic_year_id=year_id and date=day;
  weekday:=coalesce(weekday,extract(dow from day)::integer);
  select x into slot from (select value x from jsonb_array_elements(publication.document->'weekly') where value->>'weekday'=weekday::text union all select value from jsonb_array_elements(publication.document->'overrides') where value->>'date'=day::text) s
   where x->>'id'=item->>'lesson_id' and x->>'period'=per::text and (x->>'scope'='class' and x->>'scopeId'=cls::text or x->>'scope'='group' and exists(select 1 from jsonb_array_elements(publication.document->'groups') g where g->>'id'=x->>'scopeId' and g->'classIds' ? cls::text)) limit 1;
  if slot is null or slot->>'subjectId' is distinct from item->>'subject_id' or slot->>'teacherId' is distinct from item->>'teacher_id' then raise exception '확정 시간표와 수업 참조가 일치하지 않습니다.'; end if;
  teacher:=(item->>'teacher_id')::uuid;
  if not private.can_plan(target,'timetable') and not exists(select 1 from public.staff_appointments where workspace_id=target and academic_year_id=year_id and id=teacher and user_id=auth.uid()) then raise exception '본인에게 연결된 수업만 실시 확인할 수 있습니다.'; end if;
  select * into old from public.lesson_records where academic_year_id=year_id and date=day and class_id=cls and period=per for update;
  if coalesce(old.version,0) is distinct from (item->>'version')::integer then raise exception '다른 사용자가 수업 기록을 변경했습니다. 다시 불러와 주세요.'; end if;
  insert into public.lesson_records values(target,year_id,day,cls,per,publication.id,item->>'lesson_id',(item->>'subject_id')::uuid,teacher,item->>'outcome',(item->>'actual_minutes')::integer,(item->>'recognized_hours')::numeric,coalesce(item->>'reason',''),coalesce(old.version,0)+1,auth.uid(),now())
  on conflict(academic_year_id,date,class_id,period) do update set publication_id=excluded.publication_id,lesson_id=excluded.lesson_id,subject_id=excluded.subject_id,teacher_id=excluded.teacher_id,outcome=excluded.outcome,actual_minutes=excluded.actual_minutes,recognized_hours=excluded.recognized_hours,reason=excluded.reason,version=excluded.version,confirmed_by=auth.uid(),confirmed_at=now() returning * into saved;
  insert into public.lesson_record_history(workspace_id,academic_year_id,document,actor_id) values(target,year_id,jsonb_build_object('before',case when old.academic_year_id is null then null else to_jsonb(old) end,'after',to_jsonb(saved)),auth.uid());
  n:=n+1;
 end loop;return n;
end $$;
create function public.save_lesson_records(target uuid,year_id uuid,source_stamp text,entries jsonb) returns integer language sql security invoker set search_path='' as $$select private.save_lesson_records(target,year_id,source_stamp,entries)$$;
revoke all on function private.save_lesson_records(uuid,uuid,text,jsonb),public.save_lesson_records(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.save_lesson_records(uuid,uuid,text,jsonb),public.save_lesson_records(uuid,uuid,text,jsonb) to authenticated;
create function public.lesson_records_data(target uuid,year_id uuid,first_date date,last_date date) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by date,class_id,period),'[]') from public.lesson_records r where workspace_id=target and academic_year_id=year_id and date between first_date and last_date
$$;
revoke all on function public.lesson_records_data(uuid,uuid,date,date) from public,anon;
grant execute on function public.lesson_records_data(uuid,uuid,date,date) to authenticated;
