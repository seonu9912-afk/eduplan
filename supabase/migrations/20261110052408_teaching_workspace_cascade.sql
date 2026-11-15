-- Workspace/account cascades must be able to delete the shared catalog/classes
-- and dependent courses in either trigger order. Scope remains enforced at commit.
alter table public.teaching_standard_links alter constraint teaching_standard_links_standard_id_workspace_id_fkey deferrable initially deferred;
alter table public.teaching_course_classes alter constraint teaching_course_classes_class_id_workspace_id_academic_yea_fkey deferrable initially deferred;
