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
    "departments":["교무실"],"weather":{"nx":60,"ny":127,"landCode":"11B00000","tempCode":"11B10101"}}'::jsonb ||
    jsonb_build_object('timetable', (select jsonb_agg(jsonb_build_object(
      'grade',grade,'weekday',weekday,'start',1,'end',6))
      from generate_series(1,3) grade cross join generate_series(1,5) weekday));
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
  and jsonb_array_length(calendar_confirmation #> '{source,semesters}') = 2
  from public.annual_academic_plans where academic_year_id=(select id from calendar_test where key='year')),
  'viewer sees fixed confirmation after a later edit');
rollback;
