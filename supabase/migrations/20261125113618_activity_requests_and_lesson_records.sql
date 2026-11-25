
create table public.education_activity_requests (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,academic_year_id uuid not null,owner_id uuid not null references auth.users(id),
 title text not null check(length(btrim(title)) between 1 and 150),starts_on date not null,ends_on date not null,periods integer not null check(periods between 1 and 12),room_id uuid,
 constraints_note text not null default '' check(length(constraints_note)<=2000),alternatives text not null default '' check(length(alternatives)<=2000),
 selected_date date,selected_period integer check(selected_period between 1 and 12),state text not null default 'draft' check(state in ('draft','requested','changes_requested','approved','rejected')),
 review_note text not null default '',event_id uuid,version integer not null default 1,updated_at timestamptz not null default now(),
 unique(workspace_id,academic_year_id,id),foreign key(workspace_id,academic_year_id) references public.academic_years(workspace_id,id),
 foreign key(workspace_id,room_id) references public.school_rooms(workspace_id,id),foreign key(workspace_id,event_id) references public.events(workspace_id,id),
 check(starts_on<=ends_on),check(selected_date is null or selected_date between starts_on and ends_on),check(selected_period is null or selected_period+periods-1<=12)
);
create table public.activity_request_classes (
 workspace_id uuid not null,academic_year_id uuid not null,request_id uuid not null,class_id uuid not null,primary key(request_id,class_id),
 foreign key(workspace_id,academic_year_id,request_id) references public.education_activity_requests(workspace_id,academic_year_id,id),
 foreign key(workspace_id,academic_year_id,class_id) references public.classes(workspace_id,academic_year_id,id)
);
create table public.activity_request_teachers (
 workspace_id uuid not null,academic_year_id uuid not null,request_id uuid not null,teacher_id uuid not null,primary key(request_id,teacher_id),
 foreign key(workspace_id,academic_year_id,request_id) references public.education_activity_requests(workspace_id,academic_year_id,id),
 foreign key(workspace_id,academic_year_id,teacher_id) references public.staff_appointments(workspace_id,academic_year_id,id)
);
create table public.activity_request_history (
 id bigint generated always as identity primary key,workspace_id uuid not null,request_id uuid not null references public.education_activity_requests(id),
 version integer not null,state text not null,note text not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(request_id,version)
);
create index activity_requests_year on public.education_activity_requests(workspace_id,academic_year_id);
create index activity_requests_owner on public.education_activity_requests(owner_id);
create index activity_requests_room on public.education_activity_requests(workspace_id,room_id);
create index activity_requests_event on public.education_activity_requests(workspace_id,event_id);
create index activity_classes_scope on public.activity_request_classes(workspace_id,academic_year_id,class_id);
create index activity_teachers_scope on public.activity_request_teachers(workspace_id,academic_year_id,teacher_id);
alter table public.education_activity_requests enable row level security;
alter table public.activity_request_classes enable row level security;alter table public.activity_request_teachers enable row level security;alter table public.activity_request_history enable row level security;
grant select on public.education_activity_requests,public.activity_request_classes,public.activity_request_teachers,public.activity_request_history to authenticated;
create policy request_read on public.education_activity_requests for select to authenticated using ((select private.workspace_role(workspace_id)) is not null and (owner_id=(select auth.uid()) or private.can_plan(workspace_id,'calendar') or state='approved'));
create policy request_class_read on public.activity_request_classes for select to authenticated using (exists(select 1 from public.education_activity_requests r where r.id=request_id));
create policy request_teacher_read on public.activity_request_teachers for select to authenticated using (exists(select 1 from public.education_activity_requests r where r.id=request_id));
create policy request_history_read on public.activity_request_history for select to authenticated using (exists(select 1 from public.education_activity_requests r where r.id=request_id));
create function public.planning_completion_data(target uuid,year_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('class_ids',coalesce((select jsonb_agg(class_id) from public.activity_request_classes where request_id=r.id),'[]'),'teacher_ids',coalesce((select jsonb_agg(teacher_id) from public.activity_request_teachers where request_id=r.id),'[]')) order by r.updated_at desc) from public.education_activity_requests r where workspace_id=target and academic_year_id=year_id),'[]'),
 'permissions',coalesce((select jsonb_agg(to_jsonb(p)) from public.planning_permissions p where workspace_id=target),'[]'))
$$;
revoke all on function public.planning_completion_data(uuid,uuid) from public,anon;
grant execute on function public.planning_completion_data(uuid,uuid) to authenticated;

