import {expect,it} from "vitest";
import {permissionMatrix,filterPermissionRows} from "../../src/lib/planning-permission-matrix";
import type {Member,} from "../../src/lib/models";
it("counts only explicit grants for current school members, including administrators",()=>{
const members:Member[]=[{user_id:"a",display_name:"김국어",email:"a@example.invalid",role:"admin"},{user_id:"b",display_name:"이수학",email:"b@example.invalid",role:"editor"}];
const m=permissionMatrix(members,[{workspace_id:"w",user_id:"a",domain:"calendar",can_edit:true,version:2},{workspace_id:"w",user_id:"removed",domain:"calendar",can_edit:true,version:1}]);
expect(m.counts.find(c=>c.domain==="calendar")?.count).toBe(1);
expect(m.rows[0].cells.find(c=>c.domain==="calendar")?.version).toBe(2);
expect(filterPermissionRows(m.rows,"김 국어","assigned")).toHaveLength(1);
expect(filterPermissionRows(m.rows,"","unassigned").map(r=>r.member.user_id)).toEqual(["b"]);
expect(filterPermissionRows(m.rows,"","plans")).toEqual([]);
});
