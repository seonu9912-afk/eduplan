begin;
create temporary table calendar_test(key text primary key, id uuid);
grant all on calendar_test to authenticated;
create function pg_temp.ok(result boolean, label text) returns void language plpgsql as $$
begin
  if result is distinct from true then raise exception 'FAIL: %', label; end if;
end $$;

insert into calendar_test values ('admin',gen_random_uuid()), ('editor',gen_random_uuid()), ('viewer',gen_random_uuid());
insert into auth.users (id,aud,role,email,email_confirmed_at,raw_user_meta_data)
  select id,'authenticated','authenticated',id||'@example.test',now(),'{}' from calendar_test;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from calendar_test where key='admin'), true);
insert into calendar_test values ('school',public.create_school('일정 확정 검증','서울','중학교'));
insert into calendar_test values ('year',public.save_academic_year(
  (select id from calendar_test where key='school'),2027,0,
  '[{"start_date":"2027-03-01","end_date":"2027-07-20"},{"start_date":"2027-08-17","end_date":"2028-02-29"}]',
  array[1,1,1]));
reset role;
insert into public.workspace_members(workspace_id,user_id,role)
  select s.id,u.id,u.key from calendar_test s, calendar_test u
  where s.key='school' and u.key in ('editor','viewer');

create function pg_temp.new_annual() returns jsonb language sql as $$
  select '{"vacations":[],"days":{},"holidays":{},"recurring":[],"allocations":[],"business":[],
    "timetable":[],"departments":["교무실"],"weather":{"nx":60,"ny":127,"landCode":"11B00000","tempCode":"11B10101"}}'::jsonb;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from calendar_test where key='editor'), true);
select pg_temp.ok(public.save_annual_plan(s.id,y.id,0,pg_temp.new_annual())=1,'editor can initialize default work plan')
  from calendar_test s,calendar_test y where s.key='school' and y.key='year';
do $$
declare school uuid := (select id from calendar_test where key='school');
  school_year uuid := (select id from calendar_test where key='year');
begin
  begin
    perform public.save_annual_plan(school,school_year,1,
      jsonb_set(pg_temp.new_annual(),'{holidays}','{"2027-05-05":"공휴일"}'));
    raise exception 'editor changed a calendar date';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.confirm_academic_calendar(school,school_year,1);
    raise exception 'editor confirmed a calendar';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', (select id::text from calendar_test where key='admin'), true);
select public.confirm_academic_calendar(s.id,y.id,1)
  from calendar_test s,calendar_test y where s.key='school' and y.key='year';
select pg_temp.ok(public.save_annual_plan(s.id,y.id,1,
  jsonb_set(pg_temp.new_annual(),'{holidays}','{"2027-05-05":"공휴일"}'))=2,'admin modifies calendar')
  from calendar_test s,calendar_test y where s.key='school' and y.key='year';
select set_config('request.jwt.claim.sub', (select id::text from calendar_test where key='viewer'), true);
select pg_temp.ok((select (calendar_confirmation->>'version')::int=1
  and calendar_confirmation #> '{document,holidays}' = '{}'::jsonb
  and document->'holidays' = '{"2027-05-05":"공휴일"}'::jsonb
  and history->0->>'actorId' = (select id::text from calendar_test where key='editor')
  and jsonb_array_length(calendar_confirmation #> '{source,classes}') = 3
  and jsonb_array_length(calendar_confirmation #> '{source,semesters}') = 2
  from public.annual_academic_plans where academic_year_id=(select id from calendar_test where key='year')),
  'viewer sees fixed confirmation after a later edit');

select set_config('request.jwt.claim.sub', (select id::text from calendar_test where key='admin'), true);
do $$
declare school uuid := (select id from calendar_test where key='school');
  school_year uuid := (select id from calendar_test where key='year');
  enrolled uuid := (select id from public.classes where academic_year_id=school_year and grade=2);
  event_id uuid;
  slot jsonb;
  plan jsonb;
begin
  insert into public.events(workspace_id,academic_year_id,title,start_date,end_date,event_type,target_grades)
    values(school,school_year,'진로 행사','2027-05-06','2027-05-06','school',array[2]::smallint[])
    returning id into event_id;
  slot := jsonb_build_object('id','exception','eventId',event_id,'classId',enrolled,
    'date','2027-05-06','title','진로 행사','department','','start',1,'end',1,'areas','{"2":"진로"}'::jsonb);
  plan := pg_temp.new_annual() || jsonb_build_object('allocations',jsonb_build_array(slot));
  plan := jsonb_set(plan,'{days}','{"2027-05-06":{"type":"swap","name":"","enabled":true,"weekday":1,
    "gradePeriods":{"2":{"start":1,"end":4}}}}');
  perform pg_temp.ok(public.save_annual_plan(school,school_year,2,plan)=3,'valid grade and class exceptions');
  begin
    perform public.save_annual_plan(school,school_year,3,jsonb_set(plan,'{allocations,0,areas}','{"1":"진로"}'));
    raise exception 'class outside the event grade accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_annual_plan(school,school_year,3,jsonb_set(plan,'{allocations,0,classId}',to_jsonb(gen_random_uuid())));
    raise exception 'class outside the workspace and year accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_annual_plan(school,school_year,3,jsonb_set(plan,'{days,2027-05-06,gradePeriods,4}',
      '{"start":1,"end":4}'));
    raise exception 'grade outside the school type accepted';
  exception when check_violation then null; end;
end $$;
rollback;
