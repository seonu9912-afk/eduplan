-- Preserve target links on draft revisions. Only active links participate in current planning.
alter table public.activity_request_classes add column if not exists active boolean not null default true;
alter table public.activity_request_teachers add column if not exists active boolean not null default true;
alter table public.activity_request_history add column request_snapshot jsonb;
create function private.save_activity_request(target uuid,year_id uuid,request uuid,expected integer,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare old public.education_activity_requests%rowtype; result uuid:=coalesce(request,gen_random_uuid());sy integer;next_state text;
begin
 if auth.uid() is null or private.workspace_role(target) is null then raise exception '교육활동 요청 권한이 없습니다.'; end if;
 select year into sy from public.academic_years where id=year_id and workspace_id=target;
 if sy is null or (payload->>'starts_on')::date<make_date(sy,3,1) or (payload->>'ends_on')::date>=make_date(sy+1,3,1) then raise exception '희망 기간은 해당 학년도 안에서 지정하세요.'; end if;
 if jsonb_typeof(payload->'class_ids') is distinct from 'array' or jsonb_typeof(payload->'teacher_ids') is distinct from 'array' or jsonb_array_length(payload->'class_ids') not between 1 and 120 or jsonb_array_length(payload->'teacher_ids')>150 then raise exception '대상 학급과 필수 교원을 확인하세요.'; end if;
 select * into old from public.education_activity_requests where id=result and workspace_id=target and academic_year_id=year_id for update;
 if request is not null and (old.id is null or old.owner_id<>auth.uid() or old.version<>expected or old.state not in ('draft','changes_requested','rejected')) then raise exception '수정할 수 없는 요청이거나 다른 변경이 있습니다.'; end if;
 if request is null and expected<>0 then raise exception '신규 요청 버전을 확인하세요.'; end if;
 next_state:=case when payload->>'submit'='true' then 'requested' else 'draft' end;
 if next_state='requested' and (nullif(payload->>'selected_date','') is null or (payload->>'selected_period') is null) then raise exception '분석한 후보 일정을 선택하세요.'; end if;
 insert into public.education_activity_requests(id,workspace_id,academic_year_id,owner_id,title,starts_on,ends_on,periods,room_id,constraints_note,alternatives,selected_date,selected_period,state,version)
 values(result,target,year_id,auth.uid(),payload->>'title',(payload->>'starts_on')::date,(payload->>'ends_on')::date,(payload->>'periods')::integer,nullif(payload->>'room_id','')::uuid,
 coalesce(payload->>'constraints_note',''),coalesce(payload->>'alternatives',''),nullif(payload->>'selected_date','')::date,(payload->>'selected_period')::integer,next_state,coalesce(old.version,0)+1)
 on conflict(id) do update set title=excluded.title,starts_on=excluded.starts_on,ends_on=excluded.ends_on,periods=excluded.periods,room_id=excluded.room_id,constraints_note=excluded.constraints_note,alternatives=excluded.alternatives,selected_date=excluded.selected_date,selected_period=excluded.selected_period,state=excluded.state,version=excluded.version,updated_at=now();
 update public.activity_request_classes set active=false where request_id=result;update public.activity_request_teachers set active=false where request_id=result;
 insert into public.activity_request_classes(workspace_id,academic_year_id,request_id,class_id) select target,year_id,result,value::uuid from jsonb_array_elements_text(payload->'class_ids') on conflict(request_id,class_id) do update set active=true;
 insert into public.activity_request_teachers(workspace_id,academic_year_id,request_id,teacher_id) select target,year_id,result,value::uuid from jsonb_array_elements_text(payload->'teacher_ids') on conflict(request_id,teacher_id) do update set active=true;
 insert into public.activity_request_history(workspace_id,request_id,version,state,note,actor_id,request_snapshot) values(target,result,coalesce(old.version,0)+1,next_state,'요청자가 저장',auth.uid(),payload);
 return result;
end $$;
create function public.save_activity_request(target uuid,year_id uuid,request uuid,expected integer,payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_activity_request(target,year_id,request,expected,payload)$$;
revoke all on function private.save_activity_request(uuid,uuid,uuid,integer,jsonb),public.save_activity_request(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.save_activity_request(uuid,uuid,uuid,integer,jsonb),public.save_activity_request(uuid,uuid,uuid,integer,jsonb) to authenticated;

create or replace function private.review_activity_request(target uuid,request uuid,expected integer,decision text,note text,source_stamp text,area text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.education_activity_requests%rowtype; doc public.annual_academic_plans%rowtype; event uuid; cls record; allocations jsonb:='[]'; grades jsonb; classes jsonb; result jsonb;
begin
 if auth.uid() is null or not private.can_plan(target,'calendar') then raise exception '학사일정 담당 권한이 필요합니다.'; end if;
 if decision not in ('approved','changes_requested','rejected') or length(btrim(note)) not between 1 and 2000 then raise exception '검토 결과와 사유를 입력하세요.'; end if;
 select * into r from public.education_activity_requests where id=request and workspace_id=target for update;
 if r.id is null or r.version<>expected or r.state<>'requested' then raise exception '검토 대상이 변경되었습니다. 다시 불러와 주세요.'; end if;
 if decision='approved' then
  perform pg_advisory_xact_lock(hashtextextended(r.academic_year_id::text,2));perform pg_advisory_xact_lock(hashtextextended(r.academic_year_id::text,7));
  if source_stamp is distinct from private.planning_source_stamp(target,r.academic_year_id) then raise exception '분석 후 학교 계획이 변경되었습니다. 최신 영향 분석을 확인하고 다시 승인하세요.'; end if;
  if area not in ('교과','자율','자율·자치','동아리','진로','봉사','학교자율시간','없음') then raise exception '활동의 교육과정상 영역을 지정하세요.'; end if;
  select * into doc from public.annual_academic_plans where academic_year_id=r.academic_year_id and workspace_id=target for update;
  if not found then raise exception '학사일정을 먼저 등록하세요.'; end if;
  -- Recheck structural collisions in the approval transaction; no client can bypass this via RPC.
  if exists(select 1 from jsonb_array_elements(doc.document->'allocations') a join public.activity_request_classes ac on ac.request_id=r.id and ac.active join public.classes c on c.id=ac.class_id
   where a->>'date'=r.selected_date::text and (a->>'start')::integer<=r.selected_period+r.periods-1 and (a->>'end')::integer>=r.selected_period
   and (a->>'classId' is null or a->>'classId'=c.id::text) and a->'areas'->>c.grade::text is not null and a->'areas'->>c.grade::text<>'없음') then raise exception '승인 시점에 대상 학급의 행사 교시가 겹칩니다.'; end if;
  if exists(select 1 from public.education_activity_requests a where a.workspace_id=target and a.academic_year_id=r.academic_year_id and a.state='approved' and exists(select 1 from jsonb_array_elements(doc.document->'allocations') slot where slot->>'eventId'=a.event_id::text and slot->>'date'=r.selected_date::text and (slot->>'start')::integer<=r.selected_period+r.periods-1 and (slot->>'end')::integer>=r.selected_period) and
   ((r.room_id is not null and a.room_id=r.room_id) or exists(select 1 from public.activity_request_teachers x join public.activity_request_teachers y on x.teacher_id=y.teacher_id where x.request_id=r.id and y.request_id=a.id and x.active and y.active))) then raise exception '승인 시점에 장소 또는 필수 교원 일정이 겹칩니다.'; end if;
  event:=gen_random_uuid();
  for cls in select c.* from public.activity_request_classes a join public.classes c on c.id=a.class_id where a.request_id=r.id and a.active loop
   allocations:=allocations||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'eventId',event::text,'classId',cls.id::text,'date',r.selected_date::text,'title',r.title,'department','','areas',jsonb_build_object(cls.grade::text,area),'start',r.selected_period,'end',r.selected_period+r.periods-1));
  end loop;
  select jsonb_agg(distinct c.grade),jsonb_agg(c.id) into grades,classes from public.activity_request_classes a join public.classes c on c.id=a.class_id where a.request_id=r.id and a.active;
  result:=private.save_calendar_changes(target,r.academic_year_id,jsonb_build_array(jsonb_build_object('kind','event','id',event,'version',0,'beforeAllocations','[]'::jsonb,'allocations',allocations,
   'value',jsonb_build_object('title',r.title,'start_date',r.selected_date,'end_date',r.selected_date,'event_type','school','target_grades',grades,'target_class_ids',classes,'department','','description',r.constraints_note,'activity_area',area))),doc.document,'교육활동 승인');
  if result->>'ok' is distinct from 'true' then raise exception '일정이 변경되어 승인하지 못했습니다.'; end if;
 end if;
 update public.education_activity_requests set state=decision,review_note=note,event_id=event,version=version+1,updated_at=now() where id=r.id;
 insert into public.activity_request_history(workspace_id,request_id,version,state,note,actor_id) values(target,r.id,r.version+1,decision,note,auth.uid());
 return event;
end $$;
create or replace function public.review_activity_request(target uuid,request uuid,expected integer,decision text,note text,source_stamp text,area text) returns uuid language sql security invoker set search_path='' as $$select private.review_activity_request(target,request,expected,decision,note,source_stamp,area)$$;

revoke all on function private.review_activity_request(uuid,uuid,integer,text,text,text,text),public.review_activity_request(uuid,uuid,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function private.review_activity_request(uuid,uuid,integer,text,text,text,text),public.review_activity_request(uuid,uuid,integer,text,text,text,text) to authenticated;

create or replace function public.planning_completion_data(target uuid,year_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('class_ids',coalesce((select jsonb_agg(class_id) from public.activity_request_classes where request_id=r.id and active),'[]'),'teacher_ids',coalesce((select jsonb_agg(teacher_id) from public.activity_request_teachers where request_id=r.id and active),'[]')) order by r.updated_at desc) from public.education_activity_requests r where workspace_id=target and academic_year_id=year_id),'[]'),
 'permissions',coalesce((select jsonb_agg(to_jsonb(p)) from public.planning_permissions p where workspace_id=target),'[]'))
$$;
revoke all on function public.planning_completion_data(uuid,uuid) from public,anon;
grant execute on function public.planning_completion_data(uuid,uuid) to authenticated;

