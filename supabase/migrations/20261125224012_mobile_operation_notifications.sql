-- Shared inbox remains authoritative; deliveries store IDs only, not another copy of school data.
alter table public.operation_notifications alter column publication_id drop not null;
alter table public.operation_notifications add column request_id uuid, add column request_version integer;
alter table public.operation_notifications add constraint operation_request_scope foreign key(workspace_id,academic_year_id,request_id) references public.education_activity_requests(workspace_id,academic_year_id,id);
alter table public.operation_notifications add constraint operation_source check ((publication_id is not null and request_id is null) or (publication_id is null and request_id is not null and request_version is not null));
create unique index operation_request_recipient on public.operation_notifications(request_id,request_version,user_id) where request_id is not null;
create function private.notify_activity_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.state=old.state then return new;end if;
 if new.state='requested' then
  insert into public.operation_notifications(workspace_id,academic_year_id,user_id,request_id,request_version,title,body)
  select new.workspace_id,new.academic_year_id,m.user_id,new.id,new.version,'교육활동 편성 요청',new.title||' · 학사일정에서 검토해 주세요.' from public.workspace_members m
  where m.workspace_id=new.workspace_id and (m.role='admin' or m.role='editor' and exists(select 1 from public.planning_permissions p where p.workspace_id=m.workspace_id and p.user_id=m.user_id and p.domain='calendar' and p.can_edit))
  on conflict do nothing;
 elsif new.state in ('approved','rejected','changes_requested') then
  insert into public.operation_notifications(workspace_id,academic_year_id,user_id,request_id,request_version,title,body)
  select new.workspace_id,new.academic_year_id,new.owner_id,new.id,new.version,'교육활동 요청 결과',new.title||' · '||case new.state when 'approved' then '승인' when 'rejected' then '반려' else '조정 요청' end
  where exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=new.owner_id) on conflict do nothing;
 end if;return new;
end $$;
revoke all on function private.notify_activity_request() from public,anon,authenticated;
create trigger activity_request_notification after insert or update on public.education_activity_requests for each row execute function private.notify_activity_request();
create table private.operation_push_deliveries (
 subscription_id uuid not null references public.lesson_push_subscriptions(id) on delete cascade,
 notification_id uuid not null references public.operation_notifications(id) on delete cascade,
 state text not null check(state in ('pending','sent','failed','invalidated')),attempted_at timestamptz not null default now(),primary key(subscription_id,notification_id)
);
revoke all on private.operation_push_deliveries from public,anon,authenticated;
grant all on private.operation_push_deliveries to service_role;
create function private.operation_notice_current(n public.operation_notifications) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members where workspace_id=n.workspace_id and user_id=n.user_id) and
 case when n.request_id is not null then exists(select 1 from public.education_activity_requests r where r.id=n.request_id and r.version=n.request_version and
  (r.owner_id=n.user_id or exists(select 1 from public.workspace_members m where m.workspace_id=r.workspace_id and m.user_id=n.user_id and (m.role='admin' or m.role='editor' and exists(select 1 from public.planning_permissions p where p.workspace_id=m.workspace_id and p.user_id=m.user_id and p.domain='calendar' and p.can_edit)))))
 else n.publication_id=(select id from public.timetable_publications where workspace_id=n.workspace_id and academic_year_id=n.academic_year_id order by published_at desc limit 1) end
$$;
revoke all on function private.operation_notice_current(public.operation_notifications) from public,anon,authenticated;
create function public.pending_operation_push(subscription uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id)),'[]') from public.lesson_push_subscriptions s join public.operation_notifications n on n.workspace_id=s.workspace_id and n.user_id=s.user_id
 where s.id=subscription and s.enabled and s.notify_changes and n.created_at>=greatest(s.created_at,now()-interval '1 day') and n.read_at is null and private.operation_notice_current(n)
 and not exists(select 1 from private.operation_push_deliveries d where d.subscription_id=s.id and d.notification_id=n.id and (d.state in ('sent','invalidated') or d.state='pending' and d.attempted_at>now()-interval '2 minutes'))
$$;
create function public.claim_operation_push(subscription uuid,notification uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare result boolean:=false;
begin
 if not exists(select 1 from public.lesson_push_subscriptions s join public.operation_notifications n on n.user_id=s.user_id and n.workspace_id=s.workspace_id where s.id=subscription and s.enabled and s.notify_changes and n.id=notification and n.read_at is null and n.created_at>now()-interval '1 day' and private.operation_notice_current(n)) then return false;end if;
 insert into private.operation_push_deliveries(subscription_id,notification_id,state) values(subscription,notification,'pending') on conflict(subscription_id,notification_id) do update set state='pending',attempted_at=now() where operation_push_deliveries.state='failed' or operation_push_deliveries.state='pending' and operation_push_deliveries.attempted_at<now()-interval '2 minutes' returning true into result;
 return coalesce(result,false);
end $$;
create function public.operation_push_notice(subscription uuid,notification uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('notificationId',n.id,'workspaceId',s.workspace_id,'subscriptionId',s.id,'title',case when s.show_details then n.title else 'EduPlan 새 알림' end,'body',case when s.show_details then n.body else '학교 운영 알림이 있습니다. 앱에서 확인하세요.' end,'expiresAt',extract(epoch from now()+interval '5 minutes')*1000,'path','/app/'||s.workspace_id::text||'/'||case when n.request_id is null then 'timetable' else 'calendar' end||'?year='||y.year::text)
 from public.lesson_push_subscriptions s join public.operation_notifications n on n.workspace_id=s.workspace_id and n.user_id=s.user_id join public.academic_years y on y.id=n.academic_year_id
 where s.id=subscription and s.enabled and s.notify_changes and n.id=notification and n.read_at is null and n.created_at>now()-interval '1 day' and private.operation_notice_current(n) and (auth.role()='service_role' or auth.uid()=s.user_id)
$$;
create function public.finish_operation_push(subscription uuid,notification uuid,result_state text,disable boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if result_state not in ('sent','failed','invalidated') then raise exception 'Invalid delivery state';end if;
 update private.operation_push_deliveries set state=result_state where subscription_id=subscription and notification_id=notification;
 update public.lesson_push_subscriptions set enabled=enabled and not disable,last_attempt_at=now(),last_sent_at=case when result_state='sent' then now() else last_sent_at end,last_error=case when result_state='failed' then '변경 알림 전달 실패 · 기기 설정을 확인하세요.' else null end where id=subscription;
end $$;
revoke all on function public.pending_operation_push(uuid),public.claim_operation_push(uuid,uuid),public.operation_push_notice(uuid,uuid),public.finish_operation_push(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.pending_operation_push(uuid),public.claim_operation_push(uuid,uuid),public.operation_push_notice(uuid,uuid),public.finish_operation_push(uuid,uuid,text,boolean) to service_role;
grant execute on function public.operation_push_notice(uuid,uuid) to authenticated;
