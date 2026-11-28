-- Shared reference archive: extracted achievement-level publication, NOT curriculum notice.
create table public.national_achievement_level_sources (
 source_sha256 text primary key check(source_sha256 ~ '^[0-9a-f]{64}$'),
 curriculum_version text not null check(curriculum_version in ('2015 개정','2022 개정')),
 school_type text not null check(school_type in ('초등학교','중학교','고등학교')),
 subject text not null check(length(trim(subject))>0),
 title text not null,
 review_status text not null default 'extracted_review_required' check(review_status in ('extracted_review_required','verified')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and jsonb_typeof(payload->'source')='object' and jsonb_typeof(payload->'standards')='array' and jsonb_typeof(payload->'areas')='array'),
 created_at timestamptz not null default now(),
 check(payload#>>'{source,sha256}'=source_sha256 and payload#>>'{source,subject}'=subject and payload#>>'{source,curriculum_version}'=curriculum_version and payload#>>'{source,school_type}'=school_type)
);
create index national_achievement_level_sources_subject_idx on public.national_achievement_level_sources(curriculum_version,school_type,subject);
alter table public.national_achievement_level_sources enable row level security;
revoke all on public.national_achievement_level_sources from public,anon,authenticated;
grant select on public.national_achievement_level_sources to authenticated;
create policy national_achievement_level_sources_read on public.national_achievement_level_sources for select to authenticated using ((select auth.uid()) is not null);
comment on table public.national_achievement_level_sources is 'Read-only source archive. Quoted standards are not authoritative curriculum notice text. Do not automatically link unverified source codes or replace existing plans. Preserve merged grade groups, empty source cells and source page metadata.';
