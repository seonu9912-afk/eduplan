begin;
create temporary table subject_test(k text primary key,v uuid);
grant all on subject_test to authenticated;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
create function pg_temp.denied(s text) returns void language plpgsql as $$begin begin execute s;exception when insufficient_privilege or raise_exception then return;end;raise exception 'FAIL: unexpectedly allowed';end$$;
insert into subject_test select k,gen_random_uuid() from unnest(array['admin','editor','viewer','outsider','group','subject','unused','plan1','plan2']) k;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 select v,'authenticated','authenticated',v||'@example.test',now(),'{}' from subject_test where k in ('admin','editor','viewer','outsider');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v::text from subject_test where k='admin'),true);
insert into subject_test values('school',public.create_school('과목 삭제 검증','서울','중학교'));
insert into public.subject_groups(id,workspace_id,name) select (select v from subject_test where k='group'),v,'검증 교과군' from subject_test where k='school';
insert into public.subjects(id,workspace_id,group_id,name)
 select v,(select v from subject_test where k='school'),(select v from subject_test where k='group'),k from subject_test where k in ('subject','unused');
insert into public.curriculum_plans(id,workspace_id,cohort_year)
 select v,(select v from subject_test where k='school'),case when k='plan1' then 2026 else 2027 end from subject_test where k in ('plan1','plan2');
select public.save_curriculum((select v from subject_test where k='plan1'),1,jsonb_build_array(jsonb_build_object('subject_id',(select v from subject_test where k='subject'),'grade',1,'semester',1,'hours',68)));
select public.save_curriculum((select v from subject_test where k='plan2'),1,jsonb_build_array(jsonb_build_object('subject_id',(select v from subject_test where k='subject'),'grade',2,'semester',2,'hours',34)));
create temporary table expected_subject_plans as select jsonb_agg(jsonb_build_object('id',id,'version',version)) value from public.curriculum_plans where workspace_id=(select v from subject_test where k='school');
select pg_temp.denied(format('select public.delete_subject(%L,%L,%L)',(select v from subject_test where k='school'),(select v from subject_test where k='subject'),'[]'));
select pg_temp.ok((select sum(hours)=102 from public.curriculum_hours where workspace_id=(select v from subject_test where k='school')),'stale request keeps hours');
reset role;
insert into public.workspace_members(workspace_id,user_id,role)
 select (select v from subject_test where k='school'),v,k from subject_test where k in ('editor','viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v::text from subject_test where k='viewer'),true);
select pg_temp.denied(format('select public.delete_subject(%L,%L,%L)',(select v from subject_test where k='school'),(select v from subject_test where k='subject'),(select value from expected_subject_plans)));
select set_config('request.jwt.claim.sub',(select v::text from subject_test where k='outsider'),true);
select pg_temp.denied(format('select public.delete_subject(%L,%L,%L)',(select v from subject_test where k='school'),(select v from subject_test where k='subject'),(select value from expected_subject_plans)));
select set_config('request.jwt.claim.sub',(select v::text from subject_test where k='admin'),true);
select public.delete_subject((select v from subject_test where k='school'),(select v from subject_test where k='subject'),(select value from expected_subject_plans));
select pg_temp.ok(not exists(select 1 from public.subjects where id=(select v from subject_test where k='subject')),'subject deleted');
select pg_temp.ok(not exists(select 1 from public.curriculum_hours where workspace_id=(select v from subject_test where k='school')),'all linked cohorts cleaned');
select pg_temp.ok((select count(*)=2 and bool_and(version=3) from public.curriculum_plans where workspace_id=(select v from subject_test where k='school')),'plans preserved and versions advanced');
select pg_temp.ok(exists(select 1 from public.subjects where id=(select v from subject_test where k='unused')),'other subject preserved');
select pg_temp.denied(format('select public.save_curriculum(%L,2,%L)',(select v from subject_test where k='plan1'),'[]'));
select set_config('request.jwt.claim.sub',(select v::text from subject_test where k='editor'),true);
select public.delete_subject((select v from subject_test where k='school'),(select v from subject_test where k='unused'),(select jsonb_agg(jsonb_build_object('id',id,'version',version)) from public.curriculum_plans where workspace_id=(select v from subject_test where k='school')));
select pg_temp.ok(not exists(select 1 from public.subjects where id=(select v from subject_test where k='unused')),'editor deletes unused subject');
select pg_temp.ok((select count(*)=2 from public.activity_log where workspace_id=(select v from subject_test where k='school') and action='delete'),'audited deletions');
rollback;
select 'Subject deletion, linked hours, stale versions, viewer/outsider rejection and editor access passed; rolled back' as result;
