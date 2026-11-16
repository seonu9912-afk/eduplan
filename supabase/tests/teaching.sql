begin;
create temporary table teach_test(k text primary key,v uuid);grant all on teach_test to authenticated;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
create function pg_temp.denied(s text) returns void language plpgsql as $$begin begin execute s;exception when insufficient_privilege or check_violation or raise_exception then return;end;raise exception 'FAIL: unexpectedly allowed';end$$;
insert into teach_test select k,gen_random_uuid() from unnest(array['admin','teacher','colleague','viewer','outsider','standard']) k;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) select v,'authenticated','authenticated',v||'@example.test',now(),'{}' from teach_test where k in('admin','teacher','colleague','viewer','outsider');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);
insert into teach_test values('school',public.create_school('수업 모듈 검증','서울','중학교'));
insert into teach_test values('year',public.save_academic_year((select v from teach_test where k='school'),2026,0,'[{"start_date":"2026-03-01","end_date":"2026-07-20"},{"start_date":"2026-08-17","end_date":"2027-02-28"}]',array[0,2,0]));
reset role;
insert into public.workspace_members(workspace_id,user_id,role) select (select v from teach_test where k='school'),v,case when k='viewer' then 'viewer' else 'editor' end from teach_test where k in('teacher','colleague','viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='teacher'),true);
create temporary table teach_settings as select jsonb_build_object('workspace_id',(select v from teach_test where k='school'),'academic_year_id',(select v from teach_test where k='year'),'grade',2,'semester',1,'subject_id',null,'subject_name','국어','teacher_name','가상 교사','visibility','private','manual_hours',34,'class_ids',(select jsonb_agg(id) from public.classes where academic_year_id=(select v from teach_test where k='year'))) value;
insert into teach_test values('course',public.save_teaching_course((select v from teach_test where k='school'),null,0,(select value from teach_settings),null));
select pg_temp.ok((select count(*)=2 from public.teaching_course_classes where course_id=(select v from teach_test where k='course')),'multiple classes share one course');
insert into public.achievement_standards(id,workspace_id,curriculum_version,school_type,subject,grade_band,code,content) values((select v from teach_test where k='standard'),(select v from teach_test where k='school'),'2022 개정','중학교','국어','1~3학년','TEST-ONLY','공식 성취기준이 아닌 테스트 자료');
create temporary table teach_doc as select jsonb_set(document,'{units}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'period','3월','start','2026-03-02','end','2026-03-31','title','검증 단원','content','내용','standard_ids',jsonb_build_array((select v from teach_test where k='standard')),'lessons',34,'method','','alignment','','note',''))) value from public.teaching_plans where course_id=(select v from teach_test where k='course');
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),1,(select value from teach_doc),false)=2,'teacher saves incomplete draft');
select pg_temp.ok((select count(*)=1 from public.teaching_standard_links where course_id=(select v from teach_test where k='course')),'FK standard links stored');
select pg_temp.ok((select count(*)=2 from public.teaching_plan_versions where course_id=(select v from teach_test where k='course')),'creation and draft revisions');
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);
select pg_temp.ok((select count(*)=0 from public.teaching_courses where id=(select v from teach_test where k='course')),'admin cannot read private teacher course');
select pg_temp.denied(format('select public.save_teaching_plan(%L,2,%L,false)',(select v from teach_test where k='course'),(select value from teach_doc)));
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='colleague'),true);
select pg_temp.ok((select count(*)=0 from public.teaching_plan_versions where course_id=(select v from teach_test where k='course')),'colleague cannot read private history');
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='teacher'),true);
select public.save_teaching_course((select v from teach_test where k='school'),(select v from teach_test where k='course'),2,jsonb_set((select value from teach_settings),'{visibility}','"workspace"'),null);
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='colleague'),true);
select pg_temp.ok((select count(*)=1 from public.teaching_courses where id=(select v from teach_test where k='course')),'shared course visible to colleague');
select pg_temp.denied(format('select public.save_teaching_plan(%L,3,%L,false)',(select v from teach_test where k='course'),(select value from teach_doc)));
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),3,jsonb_set((select value from teach_doc),'{lesson_status}','"확정"'),true)=4,'admin edits shared plan');
select pg_temp.denied(format('select public.save_teaching_plan(%L,3,%L,false)',(select v from teach_test where k='course'),(select value from teach_doc)));
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),4,jsonb_set(jsonb_set((select value from teach_doc),'{lesson_status}','"확정"'),'{units,0,title}','"수정 단원"'),false)=5,'confirmed edit stored as new revision');
select pg_temp.ok((select document->>'lesson_status'='작성 중' from public.teaching_plans where course_id=(select v from teach_test where k='course')),'confirmed content edit resets draft');
select pg_temp.ok(public.restore_teaching_plan((select v from teach_test where k='course'),5,4)=6,'restore creates revision');
select pg_temp.ok((select document->'units'->0->>'title'='검증 단원' from public.teaching_plans where course_id=(select v from teach_test where k='course')),'restored content retained');
select pg_temp.ok(public.refresh_teaching_reference((select v from teach_test where k='course'),6)=7,'reference refresh');
select pg_temp.ok((select document->'units'->0->>'title'='검증 단원' from public.teaching_plans where course_id=(select v from teach_test where k='course')),'reference refresh does not alter content');
insert into teach_test values('copy',public.save_teaching_course((select v from teach_test where k='school'),null,0,(select value from teach_settings),(select v from teach_test where k='course')));
select pg_temp.ok((select document->'units'->0->>'title'='검증 단원' from public.teaching_plans where course_id=(select v from teach_test where k='copy')),'copy retains units');
select pg_temp.denied(format('select public.save_teaching_course(%L,null,0,%L,null)',(select v from teach_test where k='school'),jsonb_set((select value from teach_settings),'{grade}','1')));
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='viewer'),true);
select pg_temp.ok((select count(*)=1 from public.teaching_plans where course_id=(select v from teach_test where k='course')),'viewer can read shared');
select pg_temp.denied(format('select public.save_teaching_plan(%L,7,%L,false)',(select v from teach_test where k='course'),(select value from teach_doc)));
select pg_temp.denied(format('select public.save_teaching_course(%L,null,0,%L,null)',(select v from teach_test where k='school'),(select value from teach_settings)));
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='outsider'),true);
select pg_temp.ok((select count(*)=0 from public.teaching_courses where id=(select v from teach_test where k='course')),'outsider cannot read');
select pg_temp.denied(format('select public.save_teaching_plan(%L,7,%L,false)',(select v from teach_test where k='course'),(select value from teach_doc)));

-- Scope, immutable source records, protected direct writes, and curriculum reuse.
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);
insert into teach_test values('year2',public.save_academic_year((select v from teach_test where k='school'),2027,0,'[{"start_date":"2027-03-01","end_date":"2027-07-20"},{"start_date":"2027-08-17","end_date":"2028-02-29"}]',array[0,2,0]));
select pg_temp.denied(format('select public.save_teaching_course(%L,null,0,%L,null)',(select v from teach_test where k='school'),jsonb_set((select value from teach_settings),'{academic_year_id}',to_jsonb((select v from teach_test where k='year2')))));
insert into teach_test values('other_school',public.create_school('격리 검증','서울','중학교'));
insert into teach_test values('other_standard',gen_random_uuid());
insert into public.achievement_standards(id,workspace_id,curriculum_version,school_type,subject,grade_band,code,content) values((select v from teach_test where k='other_standard'),(select v from teach_test where k='other_school'),'2015 개정','중학교','국어','1~3학년','TEST-FOREIGN','다른 학교 테스트 기준');
select pg_temp.denied(format('select public.save_teaching_plan(%L,7,%L,false)',(select v from teach_test where k='course'),jsonb_set((select value from teach_doc),'{units,0,standard_ids}',jsonb_build_array((select v from teach_test where k='other_standard')))));
select pg_temp.denied(format('update public.teaching_plans set document=%L where course_id=%L',(select value from teach_doc),(select v from teach_test where k='course')));
select pg_temp.denied(format('update public.achievement_standards set content=%L where id=%L','overwrite',(select v from teach_test where k='standard')));
-- Archived plans stay recoverable but cannot be edited.
select public.archive_teaching_course((select v from teach_test where k='copy'),1,true);
select pg_temp.denied(format('select public.save_teaching_plan(%L,2,%L,false)',(select v from teach_test where k='copy'),(select value from teach_doc)));
select public.archive_teaching_course((select v from teach_test where k='copy'),2,false);
select pg_temp.ok((select count(*)=3 from public.teaching_plan_versions where course_id=(select v from teach_test where k='copy')),'archive retains all revisions');
-- A colleague cannot copy a private plan even when its UUID is known.
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='colleague'),true);
select pg_temp.denied(format('select public.save_teaching_course(%L,null,0,%L,%L)',(select v from teach_test where k='school'),(select value from teach_settings),(select v from teach_test where k='copy')));
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);
insert into teach_test values('group',gen_random_uuid()),('subject',gen_random_uuid()),('plan',gen_random_uuid());
insert into public.subject_groups(id,workspace_id,name) values((select v from teach_test where k='group'),(select v from teach_test where k='school'),'국어 검증');
insert into public.subjects(id,workspace_id,group_id,name) values((select v from teach_test where k='subject'),(select v from teach_test where k='school'),(select v from teach_test where k='group'),'편성 국어');
insert into public.curriculum_plans(id,workspace_id,cohort_year) values((select v from teach_test where k='plan'),(select v from teach_test where k='school'),2025);
select public.save_curriculum((select v from teach_test where k='plan'),1,jsonb_build_array(jsonb_build_object('subject_id',(select v from teach_test where k='subject'),'grade',2,'semester',1,'hours',68)));
insert into teach_test values('linked',public.save_teaching_course((select v from teach_test where k='school'),null,0,jsonb_set((select value from teach_settings),'{subject_id}',to_jsonb((select v from teach_test where k='subject'))),(select v from teach_test where k='course')));
select pg_temp.ok((select expected_hours=68 from public.teaching_courses where id=(select v from teach_test where k='linked')),'curriculum hours override manual entry');
select public.save_curriculum((select v from teach_test where k='plan'),2,jsonb_build_array(jsonb_build_object('subject_id',(select v from teach_test where k='subject'),'grade',2,'semester',1,'hours',70)));
select pg_temp.ok((select expected_hours=68 from public.teaching_courses where id=(select v from teach_test where k='linked')),'source change does not silently change course baseline');
select public.refresh_teaching_reference((select v from teach_test where k='linked'),1);
select pg_temp.ok((select expected_hours=70 from public.teaching_courses where id=(select v from teach_test where k='linked')),'explicit refresh updates baseline');
select pg_temp.ok((select document->'units'->0->>'lessons'='34' from public.teaching_plans where course_id=(select v from teach_test where k='linked')),'source refresh leaves authored lessons unchanged');
select public.save_curriculum((select v from teach_test where k='plan'),3,'[]');
select public.save_teaching_course((select v from teach_test where k='school'),(select v from teach_test where k='linked'),2,jsonb_set(jsonb_set((select value from teach_settings),'{subject_id}',to_jsonb((select v from teach_test where k='subject'))),'{manual_hours}','71'),null);
select pg_temp.ok((select expected_hours=71 from public.teaching_courses where id=(select v from teach_test where k='linked')),'manual hours after curriculum entry removal without deleting subject');
select public.delete_subject((select v from teach_test where k='school'),(select v from teach_test where k='subject'),jsonb_build_array(jsonb_build_object('id',(select v from teach_test where k='plan'),'version',4)));
select pg_temp.ok((select subject_id is null and subject_name='편성 국어' and expected_hours=71 from public.teaching_courses where id=(select v from teach_test where k='linked')),'deleting subject preserves course title and baseline');
select public.save_teaching_course((select v from teach_test where k='school'),(select v from teach_test where k='linked'),3,jsonb_set((select value from teach_settings),'{manual_hours}','72'),null);
select pg_temp.ok((select expected_hours=72 from public.teaching_courses where id=(select v from teach_test where k='linked')),'manual baseline works after linked subject deletion');
select pg_temp.ok((select document->'units'->0->>'title'='검증 단원' from public.teaching_plans where course_id=(select v from teach_test where k='linked')),'subject deletion preserves authored plan');

-- School report snapshots survive save/restore, and duplicate column keys are rejected.
update teach_doc set value=jsonb_set(value,'{report}',$report${"weekly_hours":4,"format":{"version":1,"name":"학교 제출용 기본 서식","lesson_title":"교수학습 및 평가 운영 계획","assessment_title":"평가 운영 계획","lesson_orientation":"landscape","assessment_orientation":"portrait","lesson_columns":[{"key":"month","label":"월","width":3,"enabled":true},{"key":"week","label":"주","width":3,"enabled":true},{"key":"day","label":"일","width":6,"enabled":true},{"key":"title","label":"단원명","width":10,"enabled":true},{"key":"standards","label":"성취기준","width":18,"enabled":true},{"key":"content","label":"평가요소","width":15,"enabled":true},{"key":"method","label":"수업방법(재구성)","width":9,"enabled":true},{"key":"assessment_method","label":"평가방법","width":9,"enabled":true},{"key":"alignment","label":"수업-평가 연계 주안점","width":19,"enabled":true},{"key":"note","label":"비고","width":8,"enabled":true},{"key":"lessons","label":"차시","width":4,"enabled":false}],"sections":[{"key":"purpose","title":"Ⅰ. 평가 목적 및 방향","enabled":true},{"key":"policy","title":"Ⅱ. 평가 방침 및 유의사항","enabled":true},{"key":"criteria","title":"Ⅲ. 평가 기준","enabled":true},{"key":"semester_levels","title":"Ⅳ. 학기 단위 성취수준","enabled":true},{"key":"overview","title":"Ⅴ. 평가의 종류와 반영비율","enabled":true},{"key":"details","title":"Ⅵ. 수행평가 세부 계획","enabled":true},{"key":"additional","title":"Ⅶ. 추가 사항","enabled":true}],"footer":""}}$report$::jsonb);
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),7,(select value from teach_doc),false)=8,'school report saved');
select pg_temp.ok((select document#>>'{report,weekly_hours}'='4' from public.teaching_plans where course_id=(select v from teach_test where k='course')),'report metadata persisted');
select pg_temp.denied(format('select public.save_teaching_plan(%L,8,%L,false)',(select v from teach_test where k='course'),jsonb_set((select value from teach_doc),'{report,format,lesson_columns,1}',(select value#>'{report,format,lesson_columns,0}' from teach_doc))));
select pg_temp.ok(public.restore_teaching_plan((select v from teach_test where k='course'),8,4)=9,'legacy restore still supported');
select pg_temp.ok(public.restore_teaching_plan((select v from teach_test where k='course'),9,8)=10,'new report restore supported');
select pg_temp.ok((select document#>>'{report,weekly_hours}'='4' from public.teaching_plans where course_id=(select v from teach_test where k='course')),'restored school report retained');

-- A multiweek task, stages and evidence are authoring data, not report-only fields.
insert into teach_test select k,gen_random_uuid() from unnest(array['assessment','stage1','stage2','criterion']) k;
update teach_doc set value=jsonb_set(value,'{evaluations,0,items}',jsonb_build_array(jsonb_build_object(
 'id',(select v from teach_test where k='assessment'),'type','수행평가','name','독서 프로젝트','element','근거 분석','method','발표','period','3월','start','','end','','count',1,'ratio',100,'points',100,'notes','',
 'task','독서 후 근거를 들어 발표','evidence','독서 기록장과 발표 기록','standard_ids',jsonb_build_array((select v from teach_test where k='standard')),
 'stages',jsonb_build_array(jsonb_build_object('id',(select v from teach_test where k='stage1'),'title','독서','description','읽기와 기록'),jsonb_build_object('id',(select v from teach_test where k='stage2'),'title','발표','description','근거를 들어 발표')),
 'rubric',jsonb_build_array(jsonb_build_object('id',(select v from teach_test where k='criterion'),'element','근거 분석','points',100,'note','','levels','[]'::jsonb,'stage_id',(select v from teach_test where k='stage2'),'standard_ids',jsonb_build_array((select v from teach_test where k='standard')),'evidence','주장과 근거가 연결된 발표 기록')),
 'detail',jsonb_build_object('lessons',4,'unit_content','독서','methods','발표','competencies','의사소통','standard_levels',jsonb_build_array(jsonb_build_object('label','상','description','근거를 설명한다.','standard_id',(select v from teach_test where k='standard'))))
)));
update teach_doc set value=jsonb_set(value,'{units,0,assessment_links}',jsonb_build_array(
 jsonb_build_object('assessment_id',(select v from teach_test where k='assessment'),'phase','실시','stage_id',(select v from teach_test where k='stage1')),
 jsonb_build_object('assessment_id',(select v from teach_test where k='assessment'),'phase','실시','stage_id',(select v from teach_test where k='stage2'))
));
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),10,(select value from teach_doc),false)=11,'save complete authoring graph, same phase in different stages');
select pg_temp.ok((select document#>>'{evaluations,0,items,0,rubric,0,evidence}'='주장과 근거가 연결된 발표 기록' from public.teaching_plans where course_id=(select v from teach_test where k='course')),'criterion evidence persisted');
create function pg_temp.invalid_authoring(doc jsonb,expected text) returns void language plpgsql as $$begin
 begin
  perform public.save_teaching_plan((select v from teach_test where k='course'),11,doc,false);
 exception when raise_exception then
  if sqlerrm not like '%'||expected||'%' then raise exception 'FAIL: unexpected error %',sqlerrm;end if;
  return;
 end;
 raise exception 'FAIL: invalid authoring allowed';
end $$;
select pg_temp.invalid_authoring(jsonb_set((select value from teach_doc),'{units,0,assessment_links,0,assessment_id}',to_jsonb(gen_random_uuid())),'평가과제·진행 단계');
select pg_temp.invalid_authoring(jsonb_set((select value from teach_doc),'{units,0,assessment_links,0,stage_id}',to_jsonb(gen_random_uuid())),'평가과제·진행 단계');
select pg_temp.invalid_authoring(jsonb_set((select value from teach_doc),'{units,0,assessment_links,1}',(select value#>'{units,0,assessment_links,0}' from teach_doc)),'연결이 중복');
select pg_temp.invalid_authoring(jsonb_set((select value from teach_doc),'{evaluations,0,items,0,rubric,0,stage_id}',to_jsonb(gen_random_uuid())),'채점 요소의 진행 단계');
select pg_temp.invalid_authoring(jsonb_set((select value from teach_doc),'{evaluations,0,items,0,rubric,0,standard_ids}',jsonb_build_array((select v from teach_test where k='other_standard'))),'해당 과제에 연결한 기준');
select pg_temp.invalid_authoring(jsonb_set((select value from teach_doc),'{evaluations,0,items,0,detail,standard_levels,0,standard_id}',to_jsonb(gen_random_uuid())),'성취수준의 기준 연결');
select pg_temp.invalid_authoring(jsonb_set((select value from teach_doc),'{evaluations,0,items,0,stages,2}',(select value#>'{evaluations,0,items,0,stages,0}' from teach_doc)),'진행 단계 ID');
insert into teach_test values('authoring_copy',public.save_teaching_course((select v from teach_test where k='school'),null,0,(select value from teach_settings),(select v from teach_test where k='course')));
select pg_temp.ok((select document#>'{units,0,assessment_links}'=(select value#>'{units,0,assessment_links}' from teach_doc) from public.teaching_plans where course_id=(select v from teach_test where k='authoring_copy')),'course copy preserves internal graph');
select pg_temp.ok(public.restore_teaching_plan((select v from teach_test where k='course'),11,8)=12,'restore legacy text-only document');
select pg_temp.ok(public.restore_teaching_plan((select v from teach_test where k='course'),12,11)=13,'restore authoring graph');
select pg_temp.ok((select document#>'{units,0,assessment_links}'=(select value#>'{units,0,assessment_links}' from teach_doc) from public.teaching_plans where course_id=(select v from teach_test where k='course')),'history restores all connections');
update teach_doc set value=jsonb_set(value,'{evaluations,0,status}','"확정"');
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),13,(select value from teach_doc),true)=14,'confirm assessment graph');
update teach_doc set value=jsonb_set(value,'{units,0,assessment_links}','[]');
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),14,(select value from teach_doc),false)=15,'unlink lesson while retaining task');
select pg_temp.ok((select document#>>'{evaluations,0,status}'='작성 중' from public.teaching_plans where course_id=(select v from teach_test where k='course')),'lesson relation change reopens confirmed assessment');

insert into teach_test values('copy_lesson',public.save_teaching_course((select v from teach_test where k='school'),
  null,0,(select value || '{"copy_scope":"lesson"}'::jsonb from teach_settings),(select v from teach_test where k='course')));
insert into teach_test values('copy_assessment',public.save_teaching_course((select v from teach_test where k='school'),
  null,0,(select value || '{"copy_scope":"assessment"}'::jsonb from teach_settings),(select v from teach_test where k='course')));
select pg_temp.ok((select jsonb_array_length(document->'units')=1 and document#>'{units,0,assessment_links}' is null
  and jsonb_array_length(document#>'{evaluations,0,items}')=0 from public.teaching_plans
  where course_id=(select v from teach_test where k='copy_lesson')),'lesson-only copy removes dangling assessment references');
select pg_temp.ok((select jsonb_array_length(document->'units')=0 and jsonb_array_length(document#>'{evaluations,0,items}')=1
  from public.teaching_plans where course_id=(select v from teach_test where k='copy_assessment')),'assessment-only copy retains its task graph');

select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);
select pg_temp.denied(format('select public.set_teaching_plan_editors(%L,15,array[%L]::uuid[])',
  (select v from teach_test where k='course'),(select v from teach_test where k='viewer')));
select pg_temp.ok(public.set_teaching_plan_editors((select v from teach_test where k='course'),15,
  array[(select v from teach_test where k='colleague')])=16,'admin assigns an existing workspace editor');
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='colleague'),true);
select pg_temp.ok(public.save_teaching_plan((select v from teach_test where k='course'),16,
  (select document from public.teaching_plans where course_id=(select v from teach_test where k='course')),false)=17,
  'assigned colleague can save the shared plan');
select pg_temp.denied(format('select public.set_teaching_plan_editors(%L,17,array[]::uuid[])',
  (select v from teach_test where k='course')));
select pg_temp.denied(format('select public.restore_teaching_plan(%L,17,16)',(select v from teach_test where k='course')));
select pg_temp.denied(format('select public.save_teaching_plan(%L,16,%L,false)',(select v from teach_test where k='course'),
  (select document from public.teaching_plans where course_id=(select v from teach_test where k='course'))));
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);
select pg_temp.ok(public.set_teaching_plan_editors((select v from teach_test where k='course'),17,array[]::uuid[])=18,
  'admin revokes coauthorship');
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='colleague'),true);
select pg_temp.denied(format('select public.save_teaching_plan(%L,18,%L,false)',(select v from teach_test where k='course'),
  (select document from public.teaching_plans where course_id=(select v from teach_test where k='course'))));
select set_config('request.jwt.claim.sub',(select v::text from teach_test where k='admin'),true);

-- Deferring the FK must not allow removal of an individually referenced class.
reset role;
do $$begin
 begin
  perform public.save_academic_year((select v from teach_test where k='school'),2026,(select version from public.academic_years where id=(select v from teach_test where k='year')),'[{"start_date":"2026-03-01","end_date":"2026-07-20"},{"start_date":"2026-08-17","end_date":"2027-02-28"}]',array[0,0,0]);
  set constraints all immediate;
  raise exception 'FAIL: referenced class deletion unexpectedly allowed';
 exception when foreign_key_violation then null;
 end;
end$$;
select pg_temp.ok((select count(*)=2 from public.classes where academic_year_id=(select v from teach_test where k='year')),'referenced classes preserved after rejected reduction');
-- Check deletion of the whole synthetic workspace, including private plans,
-- shared standards and class links, then force all deferred checks before rollback.
reset role;
delete from public.curriculum_hours where workspace_id=(select v from teach_test where k='school');
delete from public.subjects where workspace_id=(select v from teach_test where k='school');
delete from public.subject_groups where workspace_id=(select v from teach_test where k='school');
delete from public.workspaces where id=(select v from teach_test where k='school');
set constraints all immediate;
select pg_temp.ok((select count(*)=0 from public.teaching_courses where workspace_id=(select v from teach_test where k='school')),'workspace cascade removes courses without blocking');
select pg_temp.ok((select count(*)=0 from public.teaching_standard_links where workspace_id=(select v from teach_test where k='school')),'workspace cascade removes standard links without dangling references');
rollback;
select 'Teaching persistence, cross-year/workspace isolation, direct-write protection, ownership/sharing, CAS/history, copying, archival and curriculum deletion/refresh tests passed; rolled back' result;
