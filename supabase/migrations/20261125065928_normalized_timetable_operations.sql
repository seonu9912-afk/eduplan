create function private.resolve_timetable_ref(target uuid,year_id uuid,ref_kind text,ref_id text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare resolved uuid;
begin
 if coalesce(ref_id,'')='' then return null; end if;
 if ref_kind='subject' then select id into resolved from public.subjects where workspace_id=target and id::text=ref_id;
 elsif ref_kind='teacher' then select id into resolved from public.staff_appointments where workspace_id=target and academic_year_id=year_id and id::text=ref_id;
 elsif ref_kind='room' then select id into resolved from public.school_rooms where workspace_id=target and id::text=ref_id;
 end if;
 if resolved is null then
  select case ref_kind when 'subject' then subject_id when 'teacher' then teacher_id else room_id end into resolved
  from public.timetable_reference_links where workspace_id=target and academic_year_id=year_id and kind=ref_kind and legacy_id=ref_id;
 end if;
 if resolved is null then raise exception '공통 자료 연결이 필요합니다: % / %. 시간표의 공통 자료 연결에서 지정해 주세요.',ref_kind,ref_id; end if;
 return resolved;
end $$;
alter function private.save_timetable_document(uuid,uuid,integer,jsonb) rename to save_timetable_document_v1;
create function private.save_timetable_document(target uuid,year_id uuid,expected_version integer,next_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare link jsonb; g jsonb; item jsonb; entry jsonb; entry_kind text; entries jsonb; normalized jsonb:=next_document;
 result jsonb; old_version integer; sy integer; ref uuid; new_version integer;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '시간표 편집 권한이 없습니다.'; end if;
 -- Same lock order as calendar writes. Calendar projections cannot change halfway through save.
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,2));
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,7));
 select year into sy from public.academic_years where workspace_id=target and id=year_id;
 if sy is null or (next_document->>'year')::integer is distinct from sy then raise exception '학교와 학년도가 일치하지 않습니다.'; end if;
 select version into old_version from public.timetable_documents where workspace_id=target and academic_year_id=year_id;
 if coalesce(old_version,0) is distinct from expected_version then return jsonb_build_object('ok',false,'version',coalesce(old_version,0)); end if;
 if (next_document->>'calendarVersion')::integer is distinct from coalesce((select version from public.annual_academic_plans where academic_year_id=year_id),0) then
  raise exception '학사일정이 변경되었습니다. 최신 학사일정을 불러온 후 다시 저장해 주세요.';
 end if;
 insert into public.planning_source_archives(workspace_id,academic_year_id,source_kind,source_version,document)
 select workspace_id,academic_year_id,'timetable-before-save',version,document from public.timetable_documents where academic_year_id=year_id on conflict do nothing;
 for link in select value from jsonb_array_elements(coalesce(next_document->'referenceLinks','[]')) loop
  if exists(select 1 from public.timetable_reference_links where academic_year_id=year_id and kind=link->>'kind' and legacy_id=link->>'legacyId'
   and coalesce(subject_id,teacher_id,room_id)::text<>link->>'targetId') then raise exception '기존 연결은 덮어쓸 수 없습니다. 원본 연결을 확인하세요.'; end if;
  insert into public.timetable_reference_links(workspace_id,academic_year_id,kind,legacy_id,subject_id,teacher_id,room_id,created_by)
  values(target,year_id,link->>'kind',link->>'legacyId',case when link->>'kind'='subject' then (link->>'targetId')::uuid end,
   case when link->>'kind'='teacher' then (link->>'targetId')::uuid end,case when link->>'kind'='room' then (link->>'targetId')::uuid end,auth.uid()) on conflict do nothing;
 end loop;
 delete from public.timetable_entries where academic_year_id=year_id;
 delete from public.timetable_groups where academic_year_id=year_id;
 for g in select value from jsonb_array_elements(next_document->'groups') loop
  insert into public.timetable_groups values(target,year_id,g->>'id',g->>'label');
  insert into public.timetable_group_classes select target,year_id,g->>'id',value::uuid from jsonb_array_elements_text(g->'classIds');
 end loop;
 new_version:=coalesce(old_version,0)+1;
 foreach entry_kind in array array['weekly','assignment','change'] loop
  entries:='[]';
  for item in select value from jsonb_array_elements(case entry_kind when 'weekly' then next_document->'weekly' when 'change' then next_document->'overrides' else coalesce(next_document->'timetableConfig'->'lessons','[]') end) loop
   entry:=item || jsonb_build_object('subjectId',coalesce(private.resolve_timetable_ref(target,year_id,'subject',item->>'subjectId')::text,''),
    'teacherId',coalesce(private.resolve_timetable_ref(target,year_id,'teacher',item->>'teacherId')::text,''),
    'room',coalesce(private.resolve_timetable_ref(target,year_id,'room',item->>'room')::text,''));
   if coalesce(entry->>'id','')='' then entry:=entry||jsonb_build_object('id',gen_random_uuid()::text); end if;
   if entry_kind='change' and ((entry->>'date')::date<make_date(sy,3,1) or (entry->>'date')::date>=make_date(sy+1,3,1)) then raise exception '수업 변경 날짜가 학년도를 벗어납니다.'; end if;
   insert into public.timetable_entries values(target,year_id,entry_kind,entry->>'id',nullif(entry->>'subjectId','')::uuid,nullif(entry->>'teacherId','')::uuid,nullif(entry->>'room','')::uuid,
    case when entry->>'scope'='class' then (entry->>'scopeId')::uuid end,case when entry->>'scope'='group' then entry->>'scopeId' end,
    case when entry_kind='weekly' then (entry->>'weekday')::integer end,case when entry_kind<>'assignment' then (entry->>'period')::integer end,
    case when entry_kind='change' then (entry->>'date')::date end,case when entry_kind='assignment' then (entry->>'hours')::numeric end,
    case when entry_kind='change' then entry->>'action' end,
    entry-array['id','subjectId','teacherId','room','scope','scopeId','weekday','period','date','hours','action'],new_version);
   entries:=entries||jsonb_build_array(entry);
  end loop;
  if entry_kind='assignment' and normalized ? 'timetableConfig' then normalized:=jsonb_set(normalized,'{timetableConfig,lessons}',entries);
  elsif entry_kind='weekly' then normalized:=jsonb_set(normalized,'{weekly}',entries);
  elsif entry_kind='change' then normalized:=jsonb_set(normalized,'{overrides}',entries); end if;
 end loop;
 -- Availability is editor configuration but teacher IDs still have to be canonical.
 entries:='[]';
 for item in select value from jsonb_array_elements(coalesce(next_document->'timetableConfig'->'unavailable','[]')) loop
  ref:=private.resolve_timetable_ref(target,year_id,'teacher',item->>'teacherId');
  if ref is null then raise exception '수업 불가능 시간의 교원을 지정하세요.'; end if;
  entries:=entries||jsonb_build_array(item||jsonb_build_object('teacherId',ref::text));
 end loop;
 if normalized ? 'timetableConfig' then normalized:=jsonb_set(normalized,'{timetableConfig,unavailable}',entries); end if;
 normalized:=(normalized-'referenceLinks')||jsonb_build_object('source','relational-timetable-v1');
 -- Cache only; read_timetable_document reconstructs facts from relational tables.
 result:=private.save_timetable_document_v1(target,year_id,expected_version,normalized);
 return result;
end $$;
create or replace function public.save_timetable_document(target uuid,year_id uuid,expected_version integer,next_document jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.save_timetable_document(target,year_id,expected_version,next_document) $$;
revoke all on function private.save_timetable_document_v1(uuid,uuid,integer,jsonb) from public,anon,authenticated;

create function private.read_timetable_document(target uuid,year_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare saved public.timetable_documents%rowtype; doc jsonb; entry_kind text; entries jsonb;
begin
 if auth.uid() is null or private.workspace_role(target) is null then raise exception '시간표 조회 권한이 없습니다.'; end if;
 select * into saved from public.timetable_documents where workspace_id=target and academic_year_id=year_id;
 if not found then return null; end if;
 doc:=saved.document;
 if doc->>'source'='relational-timetable-v1' then
  foreach entry_kind in array array['weekly','assignment','change'] loop
   select coalesce(jsonb_agg(settings||jsonb_strip_nulls(jsonb_build_object('id',id,'scope',case when class_id is null then 'group' else 'class' end,'scopeId',coalesce(class_id::text,group_id),
    'subjectId',coalesce(subject_id::text,''),'teacherId',coalesce(teacher_id::text,''),'room',coalesce(room_id::text,''),'weekday',weekday,'period',period,'date',date,'hours',weekly_hours,'action',action)) order by id),'[]')
   into entries from public.timetable_entries where academic_year_id=year_id and kind=entry_kind;
   if entry_kind='assignment' and doc ? 'timetableConfig' then doc:=jsonb_set(doc,'{timetableConfig,lessons}',entries);
   elsif entry_kind='weekly' then doc:=jsonb_set(doc,'{weekly}',entries);
   elsif entry_kind='change' then doc:=jsonb_set(doc,'{overrides}',entries); end if;
  end loop;
  doc:=doc||jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'classIds',
   (select coalesce(jsonb_agg(class_id),'[]') from public.timetable_group_classes c where c.academic_year_id=year_id and c.group_id=g.id))) from public.timetable_groups g where g.academic_year_id=year_id),'[]'),
   'classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'grade',grade,'label',grade||'학년 '||class_number||'반')) from public.classes where academic_year_id=year_id),'[]'),
   'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'label',s.name,'kind',coalesce((select x->>'kind' from jsonb_array_elements(doc->'subjects') x where x->>'id'=s.id::text limit 1),'subject'))) from public.subjects s where workspace_id=target),'[]'),
   'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',display_name)) from public.staff_appointments where academic_year_id=year_id),'[]'),
   'rooms',coalesce((select jsonb_agg(id) from public.school_rooms where workspace_id=target),'[]'),
   'roomLabels',coalesce((select jsonb_object_agg(id::text,name) from public.school_rooms where workspace_id=target),'{}'));
 end if;
 return jsonb_build_object('version',saved.version,'updated_at',saved.updated_at,'document',doc);
end $$;
create function public.read_timetable_document(target uuid,year_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_timetable_document(target,year_id) $$;
-- Publication validation uses canonical catalogues, never the independent legacy list.
alter function private.publish_timetable(uuid,uuid,integer) rename to publish_timetable_v1;
create function private.publish_timetable(target uuid,year_id uuid,expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare doc jsonb;
begin
 if auth.uid() is null or coalesce(private.workspace_role(target),'') not in ('admin','editor') then raise exception '시간표 확정 권한이 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,2));
 perform pg_advisory_xact_lock(hashtextextended(year_id::text,7));
 doc:=private.read_timetable_document(target,year_id)->'document';
 if doc->>'source' is distinct from 'relational-timetable-v1' then raise exception '공통 과목·교원 연결을 완료하고 학교에 저장한 뒤 확정하세요.'; end if;
 if (doc->>'calendarVersion')::integer is distinct from coalesce((select version from public.annual_academic_plans where academic_year_id=year_id),0) then raise exception '학사일정 변경 후 시간표를 다시 저장하고 검토해 주세요.'; end if;
 update public.timetable_documents set document=doc where workspace_id=target and academic_year_id=year_id and version=expected_version;
 return private.publish_timetable_v1(target,year_id,expected_version);
end $$;
create or replace function public.publish_timetable(target uuid,year_id uuid,expected_version integer) returns jsonb language sql security invoker set search_path='' as $$ select private.publish_timetable(target,year_id,expected_version) $$;
revoke all on function private.publish_timetable_v1(uuid,uuid,integer) from public,anon,authenticated;


revoke all on function private.resolve_timetable_ref(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function private.save_timetable_document(uuid,uuid,integer,jsonb),private.read_timetable_document(uuid,uuid),public.read_timetable_document(uuid,uuid),private.publish_timetable(uuid,uuid,integer) from public,anon;
grant execute on function private.save_timetable_document(uuid,uuid,integer,jsonb),private.read_timetable_document(uuid,uuid),public.read_timetable_document(uuid,uuid),private.publish_timetable(uuid,uuid,integer) to authenticated;
