-- Additive, opt-in device settings. No subscriptions or notifications are enabled by migration.
alter table public.lesson_push_subscriptions add column device_id uuid, add column device_label text not null default '등록 브라우저' check(length(device_label) between 1 and 60), add column show_details boolean not null default false, add column notify_changes boolean not null default true;
create index push_user_device on public.lesson_push_subscriptions(user_id,device_id);
create or replace function private.save_lesson_push(target uuid,payload jsonb,active boolean,lead_minutes integer) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or private.workspace_role(target) is null then raise exception '학교 구성원만 알림을 설정할 수 있습니다.';end if;
 if active and not exists(select 1 from private.lesson_push_runtime where enabled) then raise exception '서버 알림 구성이 아직 활성화되지 않았습니다.';end if;
 if not active then update public.lesson_push_subscriptions set enabled=false where workspace_id=target and user_id=auth.uid() and endpoint=payload->>'endpoint' returning id into result;return result;end if;
 -- Possession of the endpoint AND both browser-generated keys is required to detach a previous account.
 update public.lesson_push_subscriptions set enabled=false where user_id<>auth.uid() and endpoint=payload->>'endpoint' and p256dh=payload->'keys'->>'p256dh' and auth_key=payload->'keys'->>'auth';
 insert into public.lesson_push_subscriptions(workspace_id,user_id,endpoint,p256dh,auth_key,lead,device_id,device_label,show_details,notify_changes)
 values(target,auth.uid(),payload->>'endpoint',payload->'keys'->>'p256dh',payload->'keys'->>'auth',lead_minutes,(payload->>'deviceId')::uuid,coalesce(nullif(payload->>'deviceLabel',''),'등록 브라우저'),coalesce((payload->>'showDetails')::boolean,false),coalesce((payload->>'notifyChanges')::boolean,true))
 on conflict(workspace_id,user_id,endpoint) do update set enabled=true,p256dh=excluded.p256dh,auth_key=excluded.auth_key,lead=excluded.lead,device_id=excluded.device_id,device_label=excluded.device_label,show_details=excluded.show_details,notify_changes=excluded.notify_changes,last_error=null returning id into result;
 return result;
end $$;
create or replace function public.lesson_push_status(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'endpoint',endpoint,'enabled',enabled,'lead',lead,'lastSentAt',last_sent_at,'lastError',last_error,'deviceId',device_id,'deviceLabel',device_label,'showDetails',show_details,'notifyChanges',notify_changes)),'[]') from public.lesson_push_subscriptions where workspace_id=target
$$;
create function public.disconnect_push_device(device uuid,endpoint_value text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 update public.lesson_push_subscriptions set enabled=false where user_id=auth.uid() and (device_id=device or endpoint=endpoint_value);
end $$;
create function public.detach_previous_push_account(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 update public.lesson_push_subscriptions set enabled=false where user_id<>auth.uid() and endpoint=payload->>'endpoint' and p256dh=payload->'keys'->>'p256dh' and auth_key=payload->'keys'->>'auth';
end $$;
revoke all on function public.disconnect_push_device(uuid,text),public.detach_previous_push_account(jsonb) from public,anon,authenticated;
grant execute on function public.disconnect_push_device(uuid,text),public.detach_previous_push_account(jsonb) to authenticated;
