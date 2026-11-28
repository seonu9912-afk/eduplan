import {it,expect} from "vitest";
import {settingsSectionFromHash,isSettingsDetailHash,settingsAnchorFromHash} from "../../src/lib/school-settings-sections";
it("maps current and legacy links into four settings groups",()=>{
 const groups={school:["#settings-school","#settings-connections","#school-links","#school-information"],operations:["#settings-year","#settings-operations"],accounts:["#settings-accounts"],system:["#settings-overview","#settings-system"]};
 for(const [group,hashes] of Object.entries(groups))for(const hash of hashes){expect(settingsSectionFromHash(hash)).toBe(group);expect(isSettingsDetailHash(hash)).toBe(true);}
 for(const hash of ["","#invalid","constructor","__proto__"]){expect(settingsSectionFromHash(hash)).toBe("school");expect(isSettingsDetailHash(hash)).toBe(false);}
});
it("retains anchors for old direct links",()=>{
 for(const hash of ["#settings-year","#settings-overview","#settings-connections","#school-links","#school-information"])expect(settingsAnchorFromHash(hash)).toBe(hash.slice(1));
 for(const hash of ["","#settings-school","#settings-operations","#settings-accounts","#settings-system"])expect(settingsAnchorFromHash(hash)).toBeNull();
});
