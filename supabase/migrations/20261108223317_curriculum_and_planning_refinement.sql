-- Preserve existing plans as hours. New official high-school drafts use credits.
alter table public.curriculum_plans add column unit text not null default 'hours' check(unit in ('hours','credits'));
alter table public.curriculum_plans add column source text not null default '' check(length(source)<=300);
alter table public.events add column activity_area text not null default '없음' check(activity_area in ('없음','교과','자율','자율·자치','동아리','진로','봉사','학교자율시간'));

create function private.save_semesters(target uuid, year_id uuid, expected_version integer, terms jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare y integer; v integer; a date; b date; c date; d date;
begin
 perform private.lock_workspace_grade_count(target);
 select year,version into y,v from public.academic_years where id=year_id and workspace_id=target for update;
 if y is null then raise exception '학년도를 찾을 수 없습니다.' using errcode='42501'; end if;
 if expected_version is distinct from v then raise exception '학기 설정이 변경되었습니다. 새로고침 후 다시 확인해 주세요.'; end if;
 if jsonb_typeof(terms) is distinct from 'array' then raise exception '두 학기 날짜를 입력해 주세요.'; end if;
 if jsonb_array_length(terms)<>2 then raise exception '두 학기 날짜를 입력해 주세요.'; end if;
 a:=(terms->0->>'start_date')::date; b:=(terms->0->>'end_date')::date; c:=(terms->1->>'start_date')::date; d:=(terms->1->>'end_date')::date;
 if a is null or b is null or c is null or d is null or a>b or b>=c or c>d or a<make_date(y,3,1) or d>=make_date(y+1,3,1) then raise exception '학기는 겹칠 수 없으며 학년도 3월~다음 해 2월 안에 있어야 합니다.'; end if;
 insert into public.semesters(workspace_id,academic_year_id,number,start_date,end_date) values (target,year_id,1,a,b),(target,year_id,2,c,d)
 on conflict(academic_year_id,number) do update set start_date=excluded.start_date,end_date=excluded.end_date;
 update public.academic_years set version=version+1 where id=year_id;
 insert into public.activity_log(workspace_id,actor_id,action,label) values(target,auth.uid(),'save',y||'학년도 학사운영 학기 설정');
 return v+1;
end $$;
create function public.save_semesters(target uuid,year_id uuid,expected_version integer,terms jsonb)
returns integer language sql security invoker set search_path='' as $$ select private.save_semesters(target,year_id,expected_version,terms) $$;
revoke all on function private.save_semesters(uuid,uuid,integer,jsonb),public.save_semesters(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.save_semesters(uuid,uuid,integer,jsonb),public.save_semesters(uuid,uuid,integer,jsonb) to authenticated;

create function private.create_curriculum_draft(target uuid,cohort integer,draft_rows jsonb,draft_unit text,draft_source text)
returns uuid language plpgsql security definer set search_path='' as $$
declare grade_limit integer; school_type text; p uuid; g uuid; s uuid; r jsonb; i integer; amount integer;
begin
 grade_limit:=private.lock_workspace_grade_count(target);
 select w.school_type into school_type from public.workspaces w where w.id=target;
 if cohort is null or cohort not between (case when school_type='초등학교' then 2028 else 2025 end) and 2100 then raise exception '총론의 시행 시점에 맞는 입학년도를 선택해 주세요.'; end if;
 if draft_unit is distinct from (case when school_type='고등학교' then 'credits' else 'hours' end) or draft_source is null or length(draft_source) not between 1 and 300 then raise exception '초안 기준과 단위를 확인해 주세요.'; end if;
 if jsonb_typeof(draft_rows) is distinct from 'array' then raise exception '초안 교과군을 확인해 주세요.'; end if;
 if jsonb_array_length(draft_rows) not between 1 and 30 then raise exception '초안 교과군을 확인해 주세요.'; end if;
 -- Unique workspace/cohort makes concurrent draft creation fail atomically.
 insert into public.curriculum_plans(workspace_id,cohort_year,unit,source) values(target,cohort,draft_unit,draft_source) returning id into p;
 for r in select value from jsonb_array_elements(draft_rows) loop
  if jsonb_typeof(r->'name') is distinct from 'string' or length(trim(r->>'name')) not between 1 and 50 or jsonb_typeof(r->'values') is distinct from 'array' then raise exception '초안 교과군을 확인해 주세요.'; end if;
  if jsonb_array_length(r->'values')<>grade_limit*2 then raise exception '학교급별 학기를 확인해 주세요.'; end if;
  insert into public.subject_groups(workspace_id,name) values(target,r->>'name') on conflict(workspace_id,name) do nothing;
  select id into g from public.subject_groups where workspace_id=target and name=r->>'name';
  insert into public.subjects(workspace_id,group_id,name) values(target,g,'[초안] '||(r->>'name')) on conflict(workspace_id,name) do nothing;
  select id into s from public.subjects where workspace_id=target and name='[초안] '||(r->>'name');
  for i in 0..grade_limit*2-1 loop
   if jsonb_typeof(r->'values'->i) is distinct from 'number' or (r->'values'->>i)!~'^[0-9]+$' then raise exception '시수·학점은 정수여야 합니다.'; end if;
   amount:=(r->'values'->>i)::integer;
   if amount not between 0 and 2000 then raise exception '시수·학점 범위를 확인해 주세요.'; end if;
   if amount>0 then insert into public.curriculum_hours(workspace_id,plan_id,subject_id,grade,semester,hours) values(target,p,s,i/2+1,i%2+1,amount); end if;
  end loop;
 end loop;
 insert into public.activity_log(workspace_id,actor_id,action,label) values(target,auth.uid(),'create',cohort||'학년도 입학생 총론 기반 초안');
 return p;
end $$;
create function public.create_curriculum_draft(target uuid,cohort integer,draft_rows jsonb,draft_unit text,draft_source text)
returns uuid language sql security invoker set search_path='' as $$ select private.create_curriculum_draft(target,cohort,draft_rows,draft_unit,draft_source) $$;
revoke all on function private.create_curriculum_draft(uuid,integer,jsonb,text,text),public.create_curriculum_draft(uuid,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function private.create_curriculum_draft(uuid,integer,jsonb,text,text),public.create_curriculum_draft(uuid,integer,jsonb,text,text) to authenticated;

alter table public.annual_academic_plans drop constraint annual_document_schema;
alter table public.annual_academic_plans add constraint annual_document_schema check(extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"vacations":{"maxItems":12,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":60},"start":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"end":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}},"required":["name","start","end"],"additionalProperties":false}},"days":{"type":"object","propertyNames":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"additionalProperties":{"type":"object","properties":{"type":{"type":"string","enum":["instructional","weekend","holiday","vacation","discretionary","swap"]},"name":{"type":"string","maxLength":100},"enabled":{"type":"boolean"},"weekday":{"type":"integer","minimum":1,"maximum":5},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12}},"required":["type","name","enabled","weekday","start","end"],"additionalProperties":false}},"holidays":{"type":"object","propertyNames":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"additionalProperties":{"type":"string","maxLength":100}},"timetable":{"maxItems":30,"type":"array","items":{"type":"object","properties":{"grade":{"type":"integer","minimum":1,"maximum":6},"weekday":{"type":"integer","minimum":1,"maximum":5},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12}},"required":["grade","weekday","start","end"],"additionalProperties":false}},"recurring":{"maxItems":300,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":80},"name":{"type":"string","minLength":1,"maxLength":100},"area":{"type":"string","enum":["교과","자율","자율·자치","동아리","진로","봉사","학교자율시간","없음"]},"grade":{"type":"integer","minimum":1,"maximum":6},"semester":{"type":"integer","minimum":1,"maximum":2},"weekday":{"type":"integer","minimum":1,"maximum":5},"exclude":{"maxItems":366,"type":"array","items":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"}},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12}},"required":["id","name","area","grade","semester","weekday","exclude","start","end"],"additionalProperties":false}},"allocations":{"maxItems":1500,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":80},"eventId":{"type":"string","maxLength":80},"date":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"title":{"type":"string","minLength":1,"maxLength":100},"department":{"type":"string","maxLength":60},"areas":{"type":"object","propertyNames":{"type":"string","pattern":"^[1-6]$"},"additionalProperties":{"type":"string","enum":["교과","자율","자율·자치","동아리","진로","봉사","학교자율시간","없음"]}},"start":{"type":"integer","minimum":1,"maximum":12},"end":{"type":"integer","minimum":1,"maximum":12}},"required":["id","date","title","department","areas","start","end"],"additionalProperties":false}},"departments":{"minItems":1,"maxItems":20,"type":"array","items":{"type":"string","minLength":1,"maxLength":60}},"business":{"maxItems":3000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":80},"date":{"type":"string","format":"date","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"},"department":{"type":"string","maxLength":60},"kind":{"type":"string","enum":["업무","출장","당직","협의사항"]},"text":{"type":"string","minLength":1,"maxLength":2000},"time":{"type":"string","maxLength":120},"location":{"type":"string","maxLength":120},"participants":{"type":"string","maxLength":120}},"required":["id","date","department","kind","text"],"additionalProperties":false}},"weather":{"type":"object","properties":{"nx":{"type":"integer","minimum":1,"maximum":149},"ny":{"type":"integer","minimum":1,"maximum":253},"landCode":{"type":"string","pattern":"^[A-Z0-9]{8}$"},"tempCode":{"type":"string","pattern":"^[A-Z0-9]{8}$"}},"required":["nx","ny","landCode","tempCode"],"additionalProperties":false},"workSettings":{"type":"object","properties":{"dutyEnabled":{"type":"boolean"}},"required":["dutyEnabled"],"additionalProperties":false}},"required":["vacations","days","holidays","timetable","recurring","allocations","departments","business","weather"],"additionalProperties":false}$schema$::json,document));
