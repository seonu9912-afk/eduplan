-- Transactional Excel subject / hours import; never changes previously allocated hours.
create table public.curriculum_import_batches (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 source_year integer not null,
 source_kind text not null check(source_kind in ('cohort','operating')),
 source_rows jsonb not null,
 imported_by uuid not null references auth.users(id),
 imported_at timestamptz not null default now()
);
create index curriculum_import_batches_workspace_idx on public.curriculum_import_batches(workspace_id,imported_at desc);
alter table public.curriculum_import_batches enable row level security;
revoke all on public.curriculum_import_batches from public,anon,authenticated;
grant select on public.curriculum_import_batches to authenticated;
create policy curriculum_import_batches_member_read on public.curriculum_import_batches for select to authenticated
 using ((select private.workspace_role(workspace_id)) is not null);

create function private.curriculum_excel_apply(target uuid, source_year integer,
 source_kind text, entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor_role text; item jsonb; part jsonb;
 group_name text; subject_name text; selected_group uuid; selected_subject uuid; selected_plan uuid;
 term_grade integer; term_semester integer; selected_cohort integer;
 final_hours integer; weekly_hours numeric; adjustment_hours numeric;
 current_hours integer; existing_cell boolean; new_cell jsonb;
 plan_doc jsonb; document_version integer; doc_exists boolean;
 touched uuid[]:='{}'; new_groups integer:=0; new_subjects integer:=0; new_hours integer:=0;
 batch_id uuid; affected uuid;
begin
 actor_role:=private.workspace_role(target);
 if auth.uid() is null or coalesce(actor_role,'') not in ('admin','editor') then
   raise exception '교과목 가져오기 권한이 없습니다.' using errcode='42501';
 end if;
 if source_year<2000 or source_year>2100 or source_kind not in ('cohort','operating') or
   jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries)<1 or
   jsonb_array_length(entries)>120 or octet_length(entries::text)>=1200000 then
   raise exception '가져오기 파일의 형식을 확인해 주세요.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||source_year::text,101));
 for item in select value from jsonb_array_elements(entries) loop
   group_name:=trim(item->>'group');
   subject_name:=trim(item->>'name');
   if length(group_name)<1 or length(group_name)>60 or length(subject_name)<1 or length(subject_name)>90 or
     jsonb_typeof(item->'terms') is distinct from 'array' or jsonb_array_length(item->'terms')>6 then
      raise exception '교과군·과목 이름 또는 편성 항목을 확인해 주세요.';
   end if;
   select id into selected_group from public.subject_groups
     where workspace_id=target and name=group_name limit 1;
   if selected_group is null then
     insert into public.subject_groups(workspace_id,name) values(target,group_name)
       returning id into selected_group;
     new_groups:=new_groups+1;
   end if;
   select id into selected_subject from public.subjects
     where workspace_id=target and group_id=selected_group and name=subject_name limit 1;
   if selected_subject is null then
     insert into public.subjects(workspace_id,group_id,name)
       values(target,selected_group,subject_name) returning id into selected_subject;
     new_subjects:=new_subjects+1;
   end if;
   for part in select value from jsonb_array_elements(item->'terms') loop
     if (part->>'grade') !~ '^[1-3]$' or (part->>'semester') !~ '^[12]$' or
        (part->>'weekly') !~ '^[0-9]{1,3}(\.[0-9]{1,6})?$' or
        (part->>'final') !~ '^[0-9]{1,4}(\.0+)?$' or
        coalesce(part->>'adjustment','0') !~ '^[-]?[0-9]{1,4}(\.[0-9]{1,6})?$' then
       raise exception '학년·학기 또는 교과 시수 데이터가 잘못되었습니다.';
     end if;
     term_grade:=(part->>'grade')::integer;
     term_semester:=(part->>'semester')::integer;
     final_hours:=round((part->>'final')::numeric);
     weekly_hours:=(part->>'weekly')::numeric;
     adjustment_hours:=coalesce((part->>'adjustment')::numeric,0);
     if final_hours>2000 or weekly_hours>100 or
        abs(16*weekly_hours+adjustment_hours-final_hours)>0.002 then
       raise exception '% %학년 %학기: 주당 시수·16주 기준·조정 시수가 일치하지 않습니다.',
         subject_name,term_grade,term_semester;
     end if;
     selected_cohort:=case when source_kind='cohort' then source_year
       else source_year-term_grade+1 end;
     select id into selected_plan from public.curriculum_plans
        where workspace_id=target and cohort_year=selected_cohort limit 1;
     if selected_plan is null then
       insert into public.curriculum_plans(workspace_id,cohort_year,source)
       values(target,selected_cohort,'기존 엑셀 확인 후 등록')
       returning id into selected_plan;
     end if;
     if exists(select 1 from public.curriculum_design_locks l
       where l.plan_id=selected_plan and l.editor_id<>auth.uid() and l.expires_at>now()) then
       raise exception '다른 교사가 편성표를 편집 중입니다. 편집권이 해제된 뒤 다시 가져와 주세요.';
     end if;
     select hours into current_hours from public.curriculum_hours
       where plan_id=selected_plan and subject_id=selected_subject
         and grade=term_grade and semester=term_semester;
     if current_hours is not null and current_hours<>final_hours then
       raise exception '% %학년 %학기에는 이미 %시간이 등록되어 있습니다. 기존 자료는 덮어쓰지 않았습니다.',
         subject_name,term_grade,term_semester,current_hours;
     end if;
     insert into public.curriculum_hours(workspace_id,plan_id,subject_id,grade,semester,hours)
       values(target,selected_plan,selected_subject,term_grade,term_semester,final_hours)
       on conflict(plan_id,subject_id,grade,semester) do nothing;
     if current_hours is null then new_hours:=new_hours+1; end if;
     if not selected_plan=any(touched) then touched:=array_append(touched,selected_plan); end if;
     select document,version into plan_doc,document_version from public.curriculum_design_documents
       where public.curriculum_design_documents.plan_id=selected_plan for update;
     doc_exists:=plan_doc is not null;
     if not doc_exists then
       plan_doc:=jsonb_build_object('format','eduplan-curriculum-v2','cohortYear',selected_cohort,
         'weeks',jsonb_build_object((selected_cohort)::text,jsonb_build_object('count',16,'status','provisional'),
           (selected_cohort+1)::text,jsonb_build_object('count',16,'status','provisional'),
           (selected_cohort+2)::text,jsonb_build_object('count',16,'status','provisional')),
         'cells','[]'::jsonb);
       document_version:=0;
     end if;
     select exists(select 1 from jsonb_array_elements(coalesce(plan_doc->'cells','[]'::jsonb)) c
       where c->>'subjectId'=selected_subject::text and (c->>'grade')::integer=term_grade
         and (c->>'semester')::integer=term_semester) into existing_cell;
     if existing_cell then
       raise exception '% %학년 %학기는 이미 편집 문서에 등록되어 있습니다. 중복 덮어쓰기를 막았습니다.',
         subject_name,term_grade,term_semester;
     end if;
     new_cell:=jsonb_build_object('subjectId',selected_subject,'grade',term_grade,
        'semester',term_semester,'weekly',weekly_hours,
        'adjustments',case when adjustment_hours=0 then '[]'::jsonb
         else jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,
           'kind','자유학기제 시수 조정','hours',adjustment_hours)) end,
        'manual',0);
     plan_doc:=jsonb_set(plan_doc,'{cells}',coalesce(plan_doc->'cells','[]'::jsonb)||jsonb_build_array(new_cell));
     insert into public.curriculum_design_documents(plan_id,workspace_id,document,version,updated_by)
       values(selected_plan,target,plan_doc,coalesce(document_version,0)+1,auth.uid())
       on conflict(plan_id) do update set document=excluded.document,
         version=excluded.version,updated_at=now(),updated_by=auth.uid();
   end loop;
 end loop;
 foreach affected in array touched loop
   update public.curriculum_plans set version=version+1,updated_at=now() where id=affected;
   insert into public.curriculum_design_revisions(plan_id,workspace_id,version,document,saved_by)
     select affected,target,version,document,auth.uid()
      from public.curriculum_design_documents where plan_id=affected;
 end loop;
 insert into public.curriculum_import_batches(workspace_id,source_year,source_kind,source_rows,imported_by)
 values(target,source_year,source_kind,entries,auth.uid()) returning id into batch_id;
 insert into public.activity_log(workspace_id,actor_id,action,label)
 values(target,auth.uid(),'import',source_year||'학년도 교육과정 엑셀 검토 등록 ('||new_hours||'건)');
 return jsonb_build_object('ok',true,'batchId',batch_id,'groups',new_groups,
   'subjects',new_subjects,'hours',new_hours,'cohorts',array_length(touched,1));
end $$;
create function public.curriculum_excel_apply(target uuid, source_year integer,
 source_kind text, entries jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select private.curriculum_excel_apply(target,source_year,source_kind,entries)
$$;
revoke all on function private.curriculum_excel_apply(uuid,integer,text,jsonb),
 public.curriculum_excel_apply(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function private.curriculum_excel_apply(uuid,integer,text,jsonb),
 public.curriculum_excel_apply(uuid,integer,text,jsonb) to authenticated;
