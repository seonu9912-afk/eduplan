import {it,expect} from "vitest";
import {settingsSectionFromHash} from "../../src/lib/school-settings-sections";
it("keeps existing settings links working and defaults unknown hashes to school information",()=>{
 expect(settingsSectionFromHash("#school-links")).toBe("connections");
 expect(settingsSectionFromHash("#school-information")).toBe("connections");
 expect(settingsSectionFromHash("#settings-year")).toBe("year");
 expect(settingsSectionFromHash("#settings-overview")).toBe("overview");
 expect(settingsSectionFromHash("#invalid")).toBe("school");
 expect(settingsSectionFromHash("")).toBe("school");
});
