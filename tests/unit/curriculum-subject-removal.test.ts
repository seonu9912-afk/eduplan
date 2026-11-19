import {describe,it,expect} from "vitest";
import {subjectIsUsedInDesign} from "../../src/lib/curriculum-subject-removal";
import type {DesignCell} from "../../src/lib/curriculum-design";

const id="d1500000-0000-4000-8000-000000000001";
const blank:DesignCell={subjectId:id,grade:1,semester:1,weekly:0,manual:0,adjustments:[]};
const doc=(cell:typeof blank)=>({format:"eduplan-curriculum-v2",cells:[cell],choiceSets:[]});

describe("safe curriculum subject removal",()=>{
  it("allows a completely unused subject",()=>{
    expect(subjectIsUsedInDesign(doc(blank),id)).toBe(false);
    expect(subjectIsUsedInDesign(doc(blank),"some-other-id")).toBe(false);
  });
  it("protects weekly hours, manual adjustments and choice sets",()=>{
    expect(subjectIsUsedInDesign(doc({...blank,weekly:1}),id)).toBe(true);
    expect(subjectIsUsedInDesign(doc({...blank,manual:16}),id)).toBe(true);
    expect(subjectIsUsedInDesign(doc({...blank,adjustments:[{hours:0}]}),id)).toBe(true);
    expect(subjectIsUsedInDesign({...doc(blank),choiceSets:[{
      subjectIds:[id,"another"],requiredCount:1
    }]},id)).toBe(true);
  });
  it("fails closed on unsupported saved documents",()=>{
    expect(subjectIsUsedInDesign(null,id)).toBe(true);
    expect(subjectIsUsedInDesign({other:"legacy"},id)).toBe(true);
  });
});
