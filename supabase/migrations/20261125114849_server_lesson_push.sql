-- Opt-in push. No subscriptions, runtime secrets or cron jobs are created by this migration.
create table public.lesson_push_subscriptions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,user_id uuid not null,endpoint text not null,
 p256dh text not null check(length(p256dh) between 80 and 100),auth_key text not null check(length(auth_key) between 20 and 30),lead integer not null check(lead in (1,3,5,10,15)),
 enabled boolean not null default true,last_attempt_at timestamptz,last_sent_at timestamptz,last_error text,created_at timestamptz not null default now(),
 unique(workspace_id,user_id,endpoint),foreign key(workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 check(length(endpoint)<2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/[^[:space:]]+$')
);
create index push_member on public.lesson_push_subscriptions(workspace_id,user_id);
alter table public.lesson_push_subscriptions enable row level security;
revoke all on public.lesson_push_subscriptions from anon,authenticated;
grant select on public.lesson_push_subscriptions to authenticated;
create policy own_push_read on public.lesson_push_subscriptions for select to authenticated using(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) is not null);
create table private.lesson_push_runtime (
 singleton boolean primary key default true check(singleton),public_key text not null,private_key_secret uuid not null,dispatch_secret uuid not null,subject text not null,
 enabled boolean not null default false,last_run_at timestamptz,last_error text
);
create table private.lesson_push_deliveries (
 subscription_id uuid not null references public.lesson_push_subscriptions(id) on delete cascade,signature text not null,state text not null check(state in ('pending','sent','failed','invalidated')),
 attempted_at timestamptz not null default now(),primary key(subscription_id)
);
revoke all on private.lesson_push_runtime,private.lesson_push_deliveries from public,anon,authenticated;
grant all on private.lesson_push_runtime,private.lesson_push_deliveries to service_role;
create function private.push_public_settings() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('publicKey',public_key,'enabled',enabled,'lastRunAt',last_run_at,'lastError',last_error) from private.lesson_push_runtime where auth.uid() is not null
$$;
create function public.push_public_settings() returns jsonb language sql stable security invoker set search_path='' as $$select private.push_public_settings()$$;
create function private.save_lesson_push(target uuid,payload jsonb,active boolean,lead_minutes integer) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or private.workspace_role(target) is null then raise exception '학교 구성원만 수업 알림을 설정할 수 있습니다.';end if;
 if active and not exists(select 1 from private.lesson_push_runtime where enabled) then raise exception '서버 알림 구성이 아직 활성화되지 않았습니다.';end if;
 if not active then update public.lesson_push_subscriptions set enabled=false where workspace_id=target and user_id=auth.uid() and endpoint=payload->>'endpoint' returning id into result;return result;end if;
 insert into public.lesson_push_subscriptions(workspace_id,user_id,endpoint,p256dh,auth_key,lead) values(target,auth.uid(),payload->>'endpoint',payload->'keys'->>'p256dh',payload->'keys'->>'auth',lead_minutes)
 on conflict(workspace_id,user_id,endpoint) do update set enabled=true,p256dh=excluded.p256dh,auth_key=excluded.auth_key,lead=excluded.lead,last_error=null returning id into result;
 return result;
end $$;
create function public.save_lesson_push(target uuid,payload jsonb,active boolean,lead_minutes integer) returns uuid language sql security invoker set search_path='' as $$ select private.save_lesson_push(target,payload,active,lead_minutes) $$;
create function public.lesson_push_status(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'endpoint',endpoint,'enabled',enabled,'lead',lead,'lastSentAt',last_sent_at,'lastError',last_error)),'[]') from public.lesson_push_subscriptions where workspace_id=target
$$;
revoke all on function private.push_public_settings(),public.push_public_settings(),private.save_lesson_push(uuid,jsonb,boolean,integer),public.save_lesson_push(uuid,jsonb,boolean,integer),public.lesson_push_status(uuid) from public,anon,authenticated;
grant execute on function private.push_public_settings(),public.push_public_settings(),private.save_lesson_push(uuid,jsonb,boolean,integer),public.save_lesson_push(uuid,jsonb,boolean,integer),public.lesson_push_status(uuid) to authenticated;
-- Service-only RPCs never accept an arbitrary school/user to impersonate: they resolve an opted-in subscription.
create function public.push_runtime_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('publicKey',r.public_key,'privateKey',a.decrypted_secret,'dispatchKey',b.decrypted_secret,'subject',r.subject,'enabled',r.enabled)
 from private.lesson_push_runtime r join vault.decrypted_secrets a on a.id=r.private_key_secret join vault.decrypted_secrets b on b.id=r.dispatch_secret
$$;
create function public.push_source(subscription uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.lesson_push_subscriptions; y public.academic_years; a public.annual_academic_plans; current_date_seoul date:=(now() at time zone 'Asia/Seoul')::date;
begin
 select * into s from public.lesson_push_subscriptions where id=subscription and enabled;
 if s.id is null or not exists(select 1 from public.workspace_members where workspace_id=s.workspace_id and user_id=s.user_id) then return null;end if;
 select * into y from public.academic_years where workspace_id=s.workspace_id and year=extract(year from current_date_seoul)::integer-case when extract(month from current_date_seoul)<3 then 1 else 0 end;
 if y.id is null then return null;end if;
 if not exists(select 1 from public.staff_appointments where workspace_id=s.workspace_id and academic_year_id=y.id and user_id=s.user_id and status='재직') then return null;end if;
 select * into a from public.annual_academic_plans where workspace_id=s.workspace_id and academic_year_id=y.id;
 return jsonb_build_object('userId',s.user_id,'workspace',(select to_jsonb(w) from public.workspaces w where id=s.workspace_id),'year',to_jsonb(y),
 'annual',case when a.academic_year_id is null then null else to_jsonb(a)||jsonb_build_object('document',a.document||jsonb_build_object('days',public.academic_days_document(s.workspace_id,y.id))) end,
 'semesters',coalesce((select jsonb_agg(to_jsonb(x)) from public.semesters x where academic_year_id=y.id),'[]'),
 'classes',coalesce((select jsonb_agg(to_jsonb(x)) from public.classes x where academic_year_id=y.id),'[]'),
 'subjects',coalesce((select jsonb_agg(to_jsonb(x)) from public.subjects x where workspace_id=s.workspace_id),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from public.events x where academic_year_id=y.id),'[]'),
 'directory',coalesce((select jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'display_name',display_name,'status',status)) from public.staff_appointments where academic_year_id=y.id),'[]'),
 'publication',(select to_jsonb(x) from public.timetable_publications x where academic_year_id=y.id order by published_at desc limit 1),
 'effectiveTimetables',public.effective_timetables(s.workspace_id,y.id),
 'resources',jsonb_build_object('rooms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.school_rooms where workspace_id=s.workspace_id),'[]'),'links','[]'::jsonb,
 'bells',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'rows',(select jsonb_agg(jsonb_build_object('type',p.kind,'period',p.period,'label',p.label,'start',to_char(p.starts_at,'HH24:MI'),'end',to_char(p.ends_at,'HH24:MI')) order by p.position) from public.bell_periods p where p.schedule_id=b.id))) from public.bell_schedules b where workspace_id=s.workspace_id),'[]'),
 'applications',coalesce((select jsonb_agg(to_jsonb(x)) from public.bell_applications x where academic_year_id=y.id),'[]')));
end $$;
create function public.claim_lesson_push(subscription uuid,key text) returns boolean language plpgsql security definer set search_path='' as $$
declare result boolean:=false;
begin
 if not exists(select 1 from public.lesson_push_subscriptions where id=subscription and enabled) then return false;end if;
 insert into private.lesson_push_deliveries(subscription_id,signature,state) values(subscription,key,'pending')
 on conflict(subscription_id) do update set signature=excluded.signature,state='pending',attempted_at=now()
 where lesson_push_deliveries.signature<>excluded.signature or lesson_push_deliveries.state='failed' or (lesson_push_deliveries.state='pending' and lesson_push_deliveries.attempted_at<now()-interval '2 minutes') returning true into result;
 return coalesce(result,false);
end $$;
create function public.finish_lesson_push(subscription uuid,key text,result_state text,error_message text,disable boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if result_state not in ('sent','failed','invalidated') then raise exception 'Invalid delivery state';end if;
 update private.lesson_push_deliveries set state=result_state where subscription_id=subscription and signature=key;
 update public.lesson_push_subscriptions set enabled=enabled and not disable,last_attempt_at=now(),last_sent_at=case when result_state='sent' then now() else last_sent_at end,last_error=error_message where id=subscription;
end $$;
create function public.lesson_push_heartbeat(error_message text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.lesson_push_runtime set last_run_at=now(),last_error=error_message;
 -- One current delivery state per subscription; no unbounded per-lesson history.
end $$;
revoke all on function public.push_runtime_config(),public.push_source(uuid),public.claim_lesson_push(uuid,text),public.finish_lesson_push(uuid,text,text,text,boolean),public.lesson_push_heartbeat(text) from public,anon,authenticated;
grant execute on function public.push_runtime_config(),public.push_source(uuid),public.claim_lesson_push(uuid,text),public.finish_lesson_push(uuid,text,text,text,boolean),public.lesson_push_heartbeat(text) to service_role;
