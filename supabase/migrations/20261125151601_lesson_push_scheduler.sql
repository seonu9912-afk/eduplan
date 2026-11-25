-- Scheduler remains dormant until an environment-specific runtime row is configured.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
alter table private.lesson_push_runtime add column function_url text check(function_url ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/lesson-push$');
create function private.dispatch_lesson_push() returns void language plpgsql security definer set search_path='' as $$
declare runtime private.lesson_push_runtime; secret text;
begin
 select * into runtime from private.lesson_push_runtime where enabled;
 if runtime.function_url is null then return;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where id=runtime.dispatch_secret;
 if secret is null then raise exception 'Push runtime secret is missing';end if;
 perform net.http_post(url:=runtime.function_url,headers:=jsonb_build_object('Content-Type','application/json','x-eduplan-dispatch',secret),body:='{}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function private.dispatch_lesson_push() from public,anon,authenticated;
grant execute on function private.dispatch_lesson_push() to service_role;
