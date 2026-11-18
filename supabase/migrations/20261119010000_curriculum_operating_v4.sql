
-- Curriculum v4: isolated operating-year plans. No existing table is altered or deleted.
create table if not exists public.curriculum_operating_sheets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  academic_year integer not null check (academic_year between 2000 and 2100),
  document jsonb not null,
  version integer not null default 1 check(version>0),
  status text not null default 'draft' check(status in ('draft','confirmed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  confirmed_at timestamptz,
  primary key(workspace_id,academic_year),
  constraint curriculum_operating_sheet_payload check(
    jsonb_typeof(document)='object' and document->>'format'='eduplan-operating-v4'
    and octet_length(document::text) < 350000)
);
create table if not exists public.curriculum_operating_history (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  academic_year integer not null,
  version integer not null,
  document jsonb not null,
  status text not null,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  foreign key(workspace_id,academic_year) references public.curriculum_operating_sheets(workspace_id,academic_year) on delete cascade,
  unique(workspace_id,academic_year,version)
);
create index if not exists curriculum_operating_history_recent on public.curriculum_operating_history(workspace_id,academic_year,version desc);
alter table public.curriculum_operating_sheets enable row level security;
alter table public.curriculum_operating_history enable row level security;
create policy operating_sheets_read on public.curriculum_operating_sheets
 for select to authenticated using (exists(
 select 1 from public.workspace_members m where m.workspace_id=public.curriculum_operating_sheets.workspace_id and m.user_id=(select auth.uid())
 ));
create policy operating_history_read on public.curriculum_operating_history
 for select to authenticated using (exists(
 select 1 from public.workspace_members m where m.workspace_id=public.curriculum_operating_history.workspace_id and m.user_id=(select auth.uid())
 ));
-- All writes occur via a version-checked RPC, not by general UPDATE/DELETE policies.
revoke all on public.curriculum_operating_sheets,public.curriculum_operating_history from anon;
grant select on public.curriculum_operating_sheets,public.curriculum_operating_history to authenticated;

create or replace function public.save_curriculum_operating_v4(
  p_workspace uuid,p_year integer,p_expected_version integer,
  p_document jsonb,p_action text default 'save'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_old public.curriculum_operating_sheets%rowtype;
  v_version integer;
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from public.workspace_members m where m.workspace_id=p_workspace
    and m.user_id=v_user and m.role in ('admin','editor')
  ) then raise exception '교육과정 편집 권한이 없습니다.' using errcode='42501'; end if;
  if p_year not between 2000 and 2100 or p_expected_version is null or p_expected_version<0
   or jsonb_typeof(p_document) is distinct from 'object'
   or p_document->>'format' is distinct from 'eduplan-operating-v4'
   or (p_document->>'year')::integer is distinct from p_year
   or jsonb_typeof(p_document->'cells') is distinct from 'array'
   or jsonb_array_length(p_document->'cells')>3500
   or octet_length(p_document::text)>349000
   or p_action not in ('save','confirm') then
    raise exception '운영편제 문서 또는 저장 요청을 확인해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text || ':operating:' || p_year::text, 9));
  select * into v_old from public.curriculum_operating_sheets
    where workspace_id=p_workspace and academic_year=p_year for update;
  if not found then
    if p_expected_version<>0 or p_action='confirm' then
      return jsonb_build_object('ok',false,'reason','version','version',0); end if;
    insert into public.curriculum_operating_sheets
      (workspace_id,academic_year,document,version,status,updated_by)
    values(p_workspace,p_year,p_document,1,'draft',v_user);
    v_version:=1;
  else
    if v_old.version<>p_expected_version then
      return jsonb_build_object('ok',false,'reason','version','version',v_old.version); end if;
    if v_old.status='confirmed' then
      return jsonb_build_object('ok',false,'reason','confirmed','version',v_old.version); end if;
    insert into public.curriculum_operating_history
      (workspace_id,academic_year,version,document,status,saved_by)
    values(p_workspace,p_year,v_old.version,v_old.document,v_old.status,v_user);
    update public.curriculum_operating_sheets
      set document=p_document,version=v_old.version+1,
        status=case when p_action='confirm' then 'confirmed' else 'draft' end,
        confirmed_at=case when p_action='confirm' then now() else null end,
        updated_at=now(),updated_by=v_user
      where workspace_id=p_workspace and academic_year=p_year
      returning version into v_version;
  end if;
  return jsonb_build_object('ok',true,'version',v_version,'status',
    case when p_action='confirm' then 'confirmed' else 'draft' end);
end $$;
revoke all on function public.save_curriculum_operating_v4(uuid,integer,integer,jsonb,text) from public,anon;
grant execute on function public.save_curriculum_operating_v4(uuid,integer,integer,jsonb,text) to authenticated;
