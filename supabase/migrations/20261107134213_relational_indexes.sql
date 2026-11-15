create index classes_year_scope on public.classes(academic_year_id,workspace_id);
create index semesters_year_scope on public.semesters(academic_year_id,workspace_id);
create index hours_plan_scope on public.curriculum_hours(plan_id,workspace_id);
