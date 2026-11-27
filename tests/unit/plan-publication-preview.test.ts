import {expect,it} from "vitest";
import {operationsPreviewContext} from "../../src/app/recovery-preview/operations-fixture";
import {defaultAnnual} from "../../src/lib/academic";
import {previewPlanPublication} from "../../src/lib/plan-publication-preview";
it("compares the effective work release and detects duplicates",()=>{
 const c=operationsPreviewContext(), plan=defaultAnnual(c.grades);
 const old={id:"item",date:"2027-03-03",department:"교무",kind:"업무" as const,text:"협의회"};
 c.schoolPublications=[{id:"release",workspace_id:c.workspace.id,academic_year_id:c.year!.id,domain:"plans",source_version:1,starts_on:"2027-03-01",published_at:"2027-03-01T00:00:00Z",published_by:c.userId,change_note:"",payload:{business:[old],departments:plan.departments,workSettings:plan.workSettings!}}];
 expect(previewPlanPublication(c,plan,"plans",1,"2027-03-01").duplicate).toBe(true);
 const changed=previewPlanPublication(c,{...plan,business:[{...old,date:"2027-03-04"}]},"plans",2,"2027-03-02");
 expect(changed.rows).toHaveLength(1);
 expect(changed.rows[0]).toMatchObject({title:"협의회"});
 expect(changed.rows[0].before).toContain("2027-03-03");
 expect(changed.rows[0].after).toContain("2027-03-04");
});
