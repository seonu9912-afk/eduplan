-- Run with a privileged SQL test connection. All synthetic data rolls back.
begin;
create temporary table test_state(k text primary key, v text);
grant all on test_state to authenticated,anon;
create function pg_temp.ok(value boolean, label text) returns text language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end $$;
create function pg_temp.denied(statement text, label text) returns text language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege or check_violation or foreign_key_violation or raise_exception then return 'PASS: '||label; end;
 raise exception 'FAIL (unexpectedly allowed): %',label;
end $$;
insert into test_state values('admin_a',gen_random_uuid()::text),('admin_b',gen_random_uuid()::text),('editor',gen_random_uuid()::text),('viewer',gen_random_uuid()::text);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select v::uuid,'authenticated','authenticated',k||'-'||v||'@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"display_name":"가상 테스트 교사"}'::jsonb from test_state;
select pg_temp.ok((select count(*) from public.workspaces where owner_id in(select v::uuid from test_state))=4,'personal workspaces created on signup');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v from test_state where k='admin_a'),true);
insert into test_state values('school_a',public.create_school('가상 A중학교','서울')::text);
insert into test_state values('year_a',public.save_academic_year((select v::uuid from test_state where k='school_a'),2026,0,'[{"start_date":"2026-03-02","end_date":"2026-07-20"},{"start_date":"2026-08-17","end_date":"2027-02-28"}]',array[2,3,4])::text);
select pg_temp.ok((select count(*) from public.classes where academic_year_id=(select v::uuid from test_state where k='year_a'))=9,'academic year and classes saved atomically');
select pg_temp.denied(format('select public.save_academic_year(%L,2026,1,%L::jsonb,null)',(select v from test_state where k='school_a'),'[{"start_date":"2026-03-02","end_date":"2026-07-20"},{"start_date":"2026-08-17","end_date":"2027-02-28"}]'),'null class counts rejected');
select pg_temp.denied(format('select public.save_academic_year(%L,2027,null,null,array[1,1,1])',(select v from test_state where k='school_a')),'null academic version rejected');
with e as(insert into public.events(workspace_id,academic_year_id,title,start_date,end_date,event_type) values((select v::uuid from test_state where k='school_a'),(select v::uuid from test_state where k='year_a'),'가상 행사','2026-11-09','2026-11-10','school') returning id)
 insert into test_state select 'event_a',id::text from e;
with g as(insert into public.subject_groups(workspace_id,name) values((select v::uuid from test_state where k='school_a'),'국어') returning id)
 insert into test_state select 'group_a',id::text from g;
with s as(insert into public.subjects(workspace_id,group_id,name) values((select v::uuid from test_state where k='school_a'),(select v::uuid from test_state where k='group_a'),'국어') returning id)
 insert into test_state select 'subject_a',id::text from s;
with p as(insert into public.curriculum_plans(workspace_id,cohort_year) values((select v::uuid from test_state where k='school_a'),2026) returning id)
 insert into test_state select 'plan_a',id::text from p;
select public.save_curriculum((select v::uuid from test_state where k='plan_a'),1,jsonb_build_array(jsonb_build_object('subject_id',(select v from test_state where k='subject_a'),'grade',1,'semester',1,'hours',68)));
select pg_temp.ok((select sum(hours) from public.curriculum_hours)=68,'curriculum hours persist');
select pg_temp.denied(format('select public.save_curriculum(%L,2,null)',(select v from test_state where k='plan_a')),'null curriculum payload rejected');
select pg_temp.ok((select sum(hours) from public.curriculum_hours)=68,'malformed payload preserves saved curriculum');
select pg_temp.denied(format('select public.save_curriculum(%L::uuid,1,%L::jsonb)',(select v from test_state where k='plan_a'),'[]'),'stale curriculum save rejected');
select set_config('request.jwt.claim.sub',(select v from test_state where k='admin_b'),true);
insert into test_state values('school_b',public.create_school('가상 B중학교','부산')::text);
select pg_temp.ok((select count(*) from public.events)=0,'school B cannot read A events');
select pg_temp.ok((select count(*) from public.curriculum_hours)=0,'school B cannot read A curriculum');
with changed as(update public.events set title='침입' where id=(select v::uuid from test_state where k='event_a') returning id) select pg_temp.ok((select count(*) from changed)=0,'cross-school update blocked');
with removed as(delete from public.events where id=(select v::uuid from test_state where k='event_a') returning id) select pg_temp.ok((select count(*) from removed)=0,'cross-school deletion blocked');
select pg_temp.denied(format('insert into public.events(workspace_id,academic_year_id,title,start_date,end_date,event_type) values(%L,%L,''침입'',''2026-11-09'',''2026-11-09'',''school'')',(select v from test_state where k='school_b'),(select v from test_state where k='year_a')),'cross-school foreign key blocked');
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values
 ((select v::uuid from test_state where k='school_a'),(select v::uuid from test_state where k='editor'),'editor'),
 ((select v::uuid from test_state where k='school_a'),(select v::uuid from test_state where k='viewer'),'viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v from test_state where k='editor'),true);
with changed as (update public.events set title='가상 행사 수정' where id=(select v::uuid from test_state where k='event_a') returning id)
select pg_temp.ok((select count(*) from changed)=0, 'editor can read but cannot update academic events');
select pg_temp.denied(format('select public.create_invitation(%L,''teacher@example.test'',''editor'')',(select v from test_state where k='school_a')),'editor cannot invite');
select pg_temp.denied(format('select public.save_academic_year(%L,2027,0,''[]'',array[1,1,1])',(select v from test_state where k='school_a')),'editor cannot change school settings');
select pg_temp.denied(format('insert into public.workspace_members values(%L,%L,''admin'',now())',(select v from test_state where k='school_b'),(select v from test_state where k='editor')),'membership escalation blocked');
select set_config('request.jwt.claim.sub',(select v from test_state where k='viewer'),true);
with changed as(update public.events set title='침입' where id=(select v::uuid from test_state where k='event_a') returning id) select pg_temp.ok((select count(*) from changed)=0,'viewer cannot edit');
select pg_temp.denied(format('select public.save_curriculum(%L,2,''[]'')',(select v from test_state where k='plan_a')),'viewer cannot save curriculum');
select set_config('request.jwt.claim.sub',(select v from test_state where k='admin_a'),true);
select public.manage_member((select v::uuid from test_state where k='school_a'),(select v::uuid from test_state where k='editor'),null);
select set_config('request.jwt.claim.sub',(select v from test_state where k='editor'),true);
select pg_temp.ok((select count(*) from public.events)=0,'removed member immediately loses access with same JWT');
select set_config('request.jwt.claim.sub',(select v from test_state where k='admin_a'),true);
insert into test_state select 'token',public.create_invitation((select v::uuid from test_state where k='school_a'),'editor-'||(select v from test_state where k='editor')||'@example.test','editor')->>'token';
select set_config('request.jwt.claim.sub',(select v from test_state where k='admin_b'),true);
select pg_temp.denied(format('select public.accept_invitation(%L)',(select v from test_state where k='token')),'invitation wrong email blocked');
select set_config('request.jwt.claim.sub',(select v from test_state where k='editor'),true);
select public.accept_invitation((select v from test_state where k='token'));
select pg_temp.ok((select count(*) from public.events)=1,'correct email accepts invitation');
select pg_temp.denied(format('select public.accept_invitation(%L)',(select v from test_state where k='token')),'invitation cannot be reused');
select set_config('request.jwt.claim.sub',(select v from test_state where k='admin_a'),true);
insert into test_state select 'old_token',public.create_invitation((select v::uuid from test_state where k='school_a'),'editor-'||(select v from test_state where k='editor')||'@example.test','viewer')->>'token';
insert into test_state select 'new_token',public.create_invitation((select v::uuid from test_state where k='school_a'),'editor-'||(select v from test_state where k='editor')||'@example.test','viewer')->>'token';
select set_config('request.jwt.claim.sub',(select v from test_state where k='editor'),true);
select pg_temp.denied(format('select public.accept_invitation(%L)',(select v from test_state where k='old_token')),'reissued invitation revokes old token');
reset role;
update public.invitations set expires_at=now()-interval '1 minute' where token_hash=encode(extensions.digest((select v from test_state where k='new_token'),'sha256'),'hex');
set local role authenticated;
select pg_temp.denied(format('select public.accept_invitation(%L)',(select v from test_state where k='new_token')),'expired invitation rejected');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.denied('select * from public.events','anonymous event access blocked');
select pg_temp.denied('select public.create_school(''침입'',''서울'')','anonymous privileged RPC blocked');
reset role;
select 'All RLS integration assertions passed; synthetic data rolled back.' as result;
rollback;
