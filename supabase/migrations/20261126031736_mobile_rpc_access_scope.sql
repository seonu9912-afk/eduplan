-- Keep authenticated RPCs as invokers; private implementations retain explicit account checks.
alter function public.disconnect_push_device(uuid,text) set schema private;
create function public.disconnect_push_device(device uuid,endpoint_value text default null) returns void language sql security invoker set search_path='' as $$select private.disconnect_push_device(device,endpoint_value)$$;
alter function public.detach_previous_push_account(jsonb) set schema private;
create function public.detach_previous_push_account(payload jsonb) returns void language sql security invoker set search_path='' as $$select private.detach_previous_push_account(payload)$$;
alter function public.operation_push_notice(uuid,uuid) set schema private;
create function public.operation_push_notice(subscription uuid,notification uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.operation_push_notice(subscription,notification)$$;
revoke all on function public.disconnect_push_device(uuid,text),private.disconnect_push_device(uuid,text),public.detach_previous_push_account(jsonb),private.detach_previous_push_account(jsonb),public.operation_push_notice(uuid,uuid),private.operation_push_notice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.disconnect_push_device(uuid,text),private.disconnect_push_device(uuid,text),public.detach_previous_push_account(jsonb),private.detach_previous_push_account(jsonb),public.operation_push_notice(uuid,uuid),private.operation_push_notice(uuid,uuid) to authenticated;
grant execute on function public.operation_push_notice(uuid,uuid),private.operation_push_notice(uuid,uuid) to service_role;
