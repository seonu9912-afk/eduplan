-- Supabase safe-update requires an explicit row predicate, including singleton settings.
create or replace function public.lesson_push_heartbeat(error_message text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.lesson_push_runtime set last_run_at=now(),last_error=error_message where singleton=true;
end $$;
revoke all on function public.lesson_push_heartbeat(text) from public,anon,authenticated;
grant execute on function public.lesson_push_heartbeat(text) to service_role;
