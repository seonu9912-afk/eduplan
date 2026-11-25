create table public.curriculum_term_inputs (
 plan_id uuid not null,workspace_id uuid not null,subject_id uuid not null,grade integer not null check(grade between 1 and 6),semester integer not null check(semester in (1,2)),
 weekly numeric not null check(weekly between 0 and 100),manual numeric not null check(manual between -2000 and 2000),source_version integer not null,
 primary key(plan_id,subject_id,grade,semester),foreign key(workspace_id,plan_id) references public.curriculum_plans(workspace_id,id) on delete cascade,foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id)
);
create table public.curriculum_term_adjustments (
 plan_id uuid not null,subject_id uuid not null,grade integer not null,semester integer not null,position integer not null,id text not null,kind text not null,hours numeric not null check(hours between -2000 and 2000),note text,source_version integer not null,
 primary key(plan_id,subject_id,grade,semester,position),foreign key(plan_id,subject_id,grade,semester) references public.curriculum_term_inputs on delete cascade
);
alter table public.curriculum_term_inputs enable row level security;alter table public.curriculum_term_adjustments enable row level security;
grant select on public.curriculum_term_inputs,public.curriculum_term_adjustments to authenticated;
create policy term_read on public.curriculum_term_inputs for select to authenticated using ((select private.workspace_role(workspace_id)) is not null);
create policy adjustment_read on public.curriculum_term_adjustments for select to authenticated using (exists(select 1 from public.curriculum_plans p where p.id=plan_id));
create function private.project_curriculum_inputs() returns trigger language plpgsql security definer set search_path='' as $$
declare cell jsonb; adj jsonb; seq integer;
begin
 -- Older cells are retained with their source version and excluded from current reads.
 for cell in select value from jsonb_array_elements(new.document->'cells') loop
  insert into public.curriculum_term_inputs values(new.plan_id,new.workspace_id,(cell->>'subjectId')::uuid,(cell->>'grade')::integer,(cell->>'semester')::integer,(cell->>'weekly')::numeric,coalesce((cell->>'manual')::numeric,0),new.version) on conflict(plan_id,subject_id,grade,semester) do update set weekly=excluded.weekly,manual=excluded.manual,source_version=excluded.source_version;
  seq:=0;
  for adj in select value from jsonb_array_elements(coalesce(cell->'adjustments','[]')) loop
   insert into public.curriculum_term_adjustments values(new.plan_id,(cell->>'subjectId')::uuid,(cell->>'grade')::integer,(cell->>'semester')::integer,seq,adj->>'id',adj->>'kind',(adj->>'hours')::numeric,adj->>'note',new.version) on conflict(plan_id,subject_id,grade,semester,position) do update set id=excluded.id,kind=excluded.kind,hours=excluded.hours,note=excluded.note,source_version=excluded.source_version;seq:=seq+1;
  end loop;
 end loop;return new;
end $$;
create trigger curriculum_input_projection after insert or update of document on public.curriculum_design_documents for each row execute function private.project_curriculum_inputs();
insert into public.curriculum_term_inputs select d.plan_id,d.workspace_id,(c->>'subjectId')::uuid,(c->>'grade')::integer,(c->>'semester')::integer,(c->>'weekly')::numeric,coalesce((c->>'manual')::numeric,0),d.version from public.curriculum_design_documents d cross join lateral jsonb_array_elements(d.document->'cells') c;
insert into public.curriculum_term_adjustments select d.plan_id,(c->>'subjectId')::uuid,(c->>'grade')::integer,(c->>'semester')::integer,a.ordinality-1,a.value->>'id',a.value->>'kind',(a.value->>'hours')::numeric,a.value->>'note',d.version
 from public.curriculum_design_documents d cross join lateral jsonb_array_elements(d.document->'cells') c cross join lateral jsonb_array_elements(coalesce(c->'adjustments','[]')) with ordinality a;
create function public.curriculum_input_document(target_plan uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select d.document||jsonb_build_object('cells',coalesce((select jsonb_agg(jsonb_build_object('subjectId',c.subject_id,'grade',c.grade,'semester',c.semester,'weekly',c.weekly,'manual',c.manual,'adjustments',
 coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'kind',a.kind,'hours',a.hours,'note',a.note)) order by position) from public.curriculum_term_adjustments a where a.source_version=c.source_version and (a.plan_id,a.subject_id,a.grade,a.semester)=(c.plan_id,c.subject_id,c.grade,c.semester)),'[]'))) from public.curriculum_term_inputs c where c.plan_id=d.plan_id and c.source_version=d.version),'[]'))
 from public.curriculum_design_documents d where d.plan_id=target_plan
$$;
-- Canonical saves still use the existing atomic hours computation. Legacy hour endpoints cannot replace a design independently.
alter function private.save_curriculum(uuid,integer,jsonb) rename to save_curriculum_legacy;
create function private.save_curriculum(target_plan uuid,expected_version integer,entries jsonb) returns integer language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.curriculum_design_documents where plan_id=target_plan) then raise exception '이 편성표는 주당 시수 편성 화면에서 수정하세요. 이전 시수 입력으로 덮어쓸 수 없습니다.'; end if;
 return private.save_curriculum_legacy(target_plan,expected_version,entries);
end $$;
create or replace function public.save_curriculum(target_plan uuid,expected_version integer,entries jsonb) returns integer language sql security invoker set search_path='' as $$ select private.save_curriculum(target_plan,expected_version,entries) $$;
-- Preserve the existing validated implementation; change only the specified contract/guard.
do $patch$
declare definition text:=pg_get_functiondef('private.curriculum_design_save(uuid,integer,integer,jsonb)'::regprocedure);schema_text text;
begin
 if strpos(definition,$old0$  end if;
  current_new_version:=private.save_curriculum(target_plan,expected_plan_version,entries);
$old0$)=0 then raise exception 'Existing curriculum_design_save contract differs; review before migrating';end if;
 definition:=replace(definition,$old0$  end if;
  current_new_version:=private.save_curriculum(target_plan,expected_plan_version,entries);
$old0$,$new0$  end if;
  current_new_version:=private.save_curriculum_legacy(target_plan,expected_plan_version,entries);
$new0$);
 execute definition;
end $patch$;


create function public.read_curriculum_design(target_plan uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('document',public.curriculum_input_document(d.plan_id),'version',d.version,'planVersion',p.version) from public.curriculum_design_documents d join public.curriculum_plans p on p.id=d.plan_id where d.plan_id=target_plan
$$;
create function public.workspace_curriculum_documents(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('plan_id',d.plan_id,'document',public.curriculum_input_document(d.plan_id),'version',d.version,'planVersion',p.version)),'[]') from public.curriculum_design_documents d join public.curriculum_plans p on p.id=d.plan_id where d.workspace_id=target
$$;
revoke all on function public.read_curriculum_design(uuid),public.workspace_curriculum_documents(uuid) from public,anon;
grant execute on function public.read_curriculum_design(uuid),public.workspace_curriculum_documents(uuid) to authenticated;

revoke all on function private.project_curriculum_inputs(),private.save_curriculum_legacy(uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.curriculum_input_document(uuid),private.save_curriculum(uuid,integer,jsonb) from public,anon;
grant execute on function public.curriculum_input_document(uuid),private.save_curriculum(uuid,integer,jsonb) to authenticated;
