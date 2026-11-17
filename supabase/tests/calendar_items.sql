begin;
create temporary table item_test(key text primary key,id uuid);
grant all on item_test to authenticated;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
insert into item_test values ('admin',gen_random_uuid()),('other',gen_random_uuid()),('editor',gen_random_uuid()),('viewer',gen_random_uuid()),('event',gen_random_uuid());
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 select id,'authenticated','authenticated',id||'@example.test',now(),'{}' from item_test where key<>'event';
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from item_test where key='admin'),true);
insert into item_test values('school',public.create_school('공식 학사력 검증','부산','중학교'));
insert into item_test values('year',public.save_academic_year((select id from item_test where key='school'),2027,0,
 '[{"start_date":"2027-03-01","end_date":"2027-07-20"},{"start_date":"2027-08-17","end_date":"2028-02-29"}]',array[1,2,1]));
reset role;
insert into public.workspace_members(workspace_id,user_id,role) select s.id,u.id,u.key from item_test s,item_test u where s.key='school' and u.key in('editor','viewer');
create function pg_temp.base() returns jsonb language sql as $$select '{"vacations":[],"days":{},"holidays":{},"recurring":[],"allocations":[],"business":[],"timetable":[],"departments":["교무실"],"weather":{"nx":60,"ny":127,"landCode":"11B00000","tempCode":"11B10101"}}'::jsonb$$;
create function pg_temp.rule(label text) returns jsonb language sql as $$select jsonb_build_object('type','discretionary','name',label,'enabled',true,'weekday',1)$$;
create function pg_temp.day(d text,label text,prior jsonb default 'null') returns jsonb language sql as $$select jsonb_build_object('kind','day','date',d,'before',prior,'value',pg_temp.rule(label))$$;
create function pg_temp.save(items jsonb) returns jsonb language sql as $$select public.save_calendar_changes((select id from item_test where key='school'),(select id from item_test where key='year'),items,pg_temp.base())$$;
set local role authenticated;
select pg_temp.ok((pg_temp.save(jsonb_build_array(pg_temp.day('2027-05-03','첫 관리자')))->>'ok')::boolean,'first date saved');
select pg_temp.ok((pg_temp.save(jsonb_build_array(pg_temp.day('2027-05-04','다른 날짜')))->>'ok')::boolean,'different date merges');
select pg_temp.ok(not (pg_temp.save(jsonb_build_array(pg_temp.day('2027-05-03','오래된 입력')))->>'ok')::boolean,'same date conflicts');
select pg_temp.ok(not (pg_temp.save(jsonb_build_array(pg_temp.day('2027-05-05','일괄'),pg_temp.day('2027-05-03','일괄')))->>'ok')::boolean,'range conflicts as one transaction');
select pg_temp.ok((select not(document->'days'?'2027-05-05') and document#>>'{days,2027-05-03,name}'='첫 관리자' and version=2 from public.annual_academic_plans where academic_year_id=(select id from item_test where key='year')),'no partial range write');
select pg_temp.ok((select count(*)=2 from public.calendar_item_history where academic_year_id=(select id from item_test where key='year')),'only successful changes have history');
select public.confirm_academic_calendar((select id from item_test where key='school'),(select id from item_test where key='year'),2);
select pg_temp.ok((pg_temp.save(jsonb_build_array(pg_temp.day('2027-05-03','복원된 날짜',pg_temp.rule('첫 관리자'))))->>'ok')::boolean,'CAS restore');
select pg_temp.ok((select calendar_confirmation#>>'{document,days,2027-05-03,name}'='첫 관리자' from public.annual_academic_plans where academic_year_id=(select id from item_test where key='year')),'confirmation immutable');
do $$declare role_name text; begin
 foreach role_name in array array['editor','viewer','other'] loop
  perform set_config('request.jwt.claim.sub',(select id::text from item_test where key=role_name),true);
  begin perform pg_temp.save(jsonb_build_array(pg_temp.day('2027-06-01','권한 위반'))); raise exception 'unauthorized save allowed'; exception when insufficient_privilege then null; end;
  if role_name='other' then perform pg_temp.ok((select count(*)=0 from public.calendar_item_history),'cross school history hidden'); end if;
 end loop;
end$$;
select set_config('request.jwt.claim.sub',(select id::text from item_test where key='admin'),true);
do $$declare e uuid:=(select id from item_test where key='event'); item jsonb; allocation jsonb; current_version int; begin
 allocation:=jsonb_build_object('id','period1','eventId',e,'date','2027-05-06','title','검증 행사','department','','start',1,'end',2,'areas','{"2":"진로"}'::jsonb);
 item:=jsonb_build_object('kind','event','id',e,'version',0,'beforeAllocations','[]'::jsonb,'allocations',jsonb_build_array(allocation),'value',
   jsonb_build_object('title','검증 행사','start_date','2027-05-06','end_date','2027-05-06','event_type','school','target_grades',jsonb_build_array(2),'target_class_ids','[]'::jsonb,'department','','description','비고','activity_area','없음'));
 perform pg_temp.ok((pg_temp.save(jsonb_build_array(item))->>'ok')::boolean,'event and periods atomically created');
 perform pg_temp.ok((select title='검증 행사' from public.events where id=e),'event metadata');
 perform pg_temp.ok((select document#>>'{allocations,0,eventId}'=e::text from public.annual_academic_plans where academic_year_id=(select id from item_test where key='year')),'event periods');
 select version into current_version from public.events where id=e;
 item:=item||jsonb_build_object('version',current_version,'beforeAllocations',jsonb_build_array(allocation));
 item:=jsonb_set(item,'{value,title}','"저장되면 안 됨"');
 item:=jsonb_set(item,'{allocations,0,date}','"2027-05-07"');
 begin perform pg_temp.save(jsonb_build_array(item)); raise exception 'out of event date accepted'; exception when others then if sqlerrm='out of event date accepted' then raise; end if; end;
 perform pg_temp.ok((select title='검증 행사' and version=current_version from public.events where id=e),'event failure rolls back metadata');
 item:=jsonb_set(item,'{allocations}',jsonb_build_array(allocation));
 item:=jsonb_set(item,'{version}',to_jsonb(current_version-1));
 perform pg_temp.ok(not (pg_temp.save(jsonb_build_array(item))->>'ok')::boolean,'stale event rejected');
 begin delete from public.calendar_item_history; raise exception 'history deletion allowed'; exception when insufficient_privilege then null; end;
end$$;
select 'calendar item assertions passed' as result;
rollback;
