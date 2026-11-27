import {it,expect} from "vitest";
import {filterStaffDirectory,emptyStaffFilters} from "../../src/lib/staff-directory-filter";
const people=[{id:"a",display_name:"김 국어",user_id:"u",subject_ids:["k","s"],primary_subject_id:"k",department:"교무부",duties:"기획",homeroom_class_id:null,active:true},{id:"b",display_name:"이사회",user_id:null,subject_ids:["s"],primary_subject_id:"s",department:"학생부",duties:"담임",homeroom_class_id:"c",active:false}];
const names=new Map([["k","국어"],["s","사회"]]);
it("combines search and filters without changing directory data",()=>{
 expect(filterStaffDirectory(people,{...emptyStaffFilters(),query:"김국어",subject:"s",account:"yes"},names).map(p=>p.id)).toEqual(["a"]);
 expect(filterStaffDirectory(people,{...emptyStaffFilters(),homeroom:"yes",active:"no"},names).map(p=>p.id)).toEqual(["b"]);
 expect(filterStaffDirectory(people,{...emptyStaffFilters(),query:"사회",department:"교무부"},names).map(p=>p.id)).toEqual(["a"]);
});
