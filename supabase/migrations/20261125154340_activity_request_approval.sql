create function private.review_activity_request(target uuid,request uuid,expected integer,decision text,note text,source_stamp text,area text) returns uuid language plpgsql security definer set search_path='' as $$
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
  if exists(select 1 from jsonb_array_elements(doc.document->'allocations') a join public.activity_request_classes ac on ac.request_id=r.id join public.classes c on c.id=ac.class_id
   where a->>'date'=r.selected_date::text and (a->>'start')::integer<=r.selected_period+r.periods-1 and (a->>'end')::integer>=r.selected_period
   and (a->>'classId' is null or a->>'classId'=c.id::text) and a->'areas'->>c.grade::text is not null and a->'areas'->>c.grade::text<>'없음') then raise exception '승인 시점에 대상 학급의 행사 교시가 겹칩니다.'; end if;
  if exists(select 1 from public.education_activity_requests a where a.workspace_id=target and a.academic_year_id=r.academic_year_id and a.state='approved' and exists(select 1 from jsonb_array_elements(doc.document->'allocations') slot where slot->>'eventId'=a.event_id::text and slot->>'date'=r.selected_date::text and (slot->>'start')::integer<=r.selected_period+r.periods-1 and (slot->>'end')::integer>=r.selected_period) and
   ((r.room_id is not null and a.room_id=r.room_id) or exists(select 1 from public.activity_request_teachers x join public.activity_request_teachers y on x.teacher_id=y.teacher_id where x.request_id=r.id and y.request_id=a.id))) then raise exception '승인 시점에 장소 또는 필수 교원 일정이 겹칩니다.'; end if;
  event:=gen_random_uuid();
  for cls in select c.* from public.activity_request_classes a join public.classes c on c.id=a.class_id where a.request_id=r.id loop
   allocations:=allocations||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'eventId',event::text,'classId',cls.id::text,'date',r.selected_date::text,'title',r.title,'department','','areas',jsonb_build_object(cls.grade::text,area),'start',r.selected_period,'end',r.selected_period+r.periods-1));
  end loop;
  select jsonb_agg(distinct c.grade),jsonb_agg(c.id) into grades,classes from public.activity_request_classes a join public.classes c on c.id=a.class_id where a.request_id=r.id;
  result:=private.save_calendar_changes(target,r.academic_year_id,jsonb_build_array(jsonb_build_object('kind','event','id',event,'version',0,'beforeAllocations','[]'::jsonb,'allocations',allocations,
   'value',jsonb_build_object('title',r.title,'start_date',r.selected_date,'end_date',r.selected_date,'event_type','school','target_grades',grades,'target_class_ids',classes,'department','','description',r.constraints_note,'activity_area',area))),doc.document,'교육활동 승인');
  if result->>'ok' is distinct from 'true' then raise exception '일정이 변경되어 승인하지 못했습니다.'; end if;
 end if;
 update public.education_activity_requests set state=decision,review_note=note,event_id=event,version=version+1,updated_at=now() where id=r.id;
 insert into public.activity_request_history(workspace_id,request_id,version,state,note,actor_id) values(target,r.id,r.version+1,decision,note,auth.uid());
 return event;
end $$;
create function public.review_activity_request(target uuid,request uuid,expected integer,decision text,note text,source_stamp text,area text) returns uuid language sql security invoker set search_path='' as $$select private.review_activity_request(target,request,expected,decision,note,source_stamp,area)$$;

revoke all on function private.review_activity_request(uuid,uuid,integer,text,text,text,text),public.review_activity_request(uuid,uuid,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function private.review_activity_request(uuid,uuid,integer,text,text,text,text),public.review_activity_request(uuid,uuid,integer,text,text,text,text) to authenticated;
