# Teaching submissions: stage 1

The new workflow is separate from teaching-plan publication and ordinary save status.
- A submission references an existing `teaching_plan_versions(course_id, version)` revision.
- Scopes: lesson (the entire course lesson plan), assessment_1, assessment_2. Multiple scopes can be submitted in one transaction.
- Authors: course owner or explicitly assigned teacher/co-author; reviewers: school admin or assessment planning permission holder. School membership is required.
- A private draft stays private. The reviewer can list submission metadata and read only the submitted scope via the RPC. Direct access to the private submission table is denied.
- Review states: submitted, reviewing, changes_requested, accepted, withdrawn. A revision can be edited during review, but the submitted version is unchanged. Duplicate in-progress submissions are rejected. A new submission retains older records.
- The existing plan status, calendar linkage and publication history are untouched in this stage.
- Acceptance database tested with a rolled-back synthetic school and four accounts: private submission, duplicate rejection, draft revision after submission, same-school colleague and outsider access denial, admin access only to submitted content, review start, required revision note, resubmission and completion, history retention.
- Initial fixture creation required the existing link_reason field for unlinked courses; rerun passed.
- Production not migrated. UI, submission deadlines, expected-target dashboard, review notifications, report export and final integration tests remain to be implemented. Before release, test assessment and combined scope submissions, withdrawal, stale status and multi-user races. Submitted version stores authored plan; freezing derived calendar references and rendering exact submitted documents requires separate report integration.
