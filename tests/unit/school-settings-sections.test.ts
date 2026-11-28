import {it,expect} from "vitest";
import {settingsSectionFromHash,isSettingsDetailHash} from "../../src/lib/school-settings-sections";
it("keeps existing settings links working and defaults unknown hashes to school information",()=>{
 expect(settingsSectionFromHash("#school-links")).toBe("connections");
 expect(settingsSectionFromHash("#school-information")).toBe("connections");
 expect(settingsSectionFromHash("#settings-year")).toBe("year");
 expect(settingsSectionFromHash("#settings-overview")).toBe("overview");
 expect(settingsSectionFromHash("#invalid")).toBe("school");
 expect(settingsSectionFromHash("")).toBe("school");
});

it("distinguishes the settings index from valid detail links",()=>{
 expect(isSettingsDetailHash("")).toBe(false);
 expect(isSettingsDetailHash("#invalid")).toBe(false);
 expect(isSettingsDetailHash("#settings-school")).toBe(true);
 expect(isSettingsDetailHash("#settings-year")).toBe(true);
 expect(isSettingsDetailHash("#school-links")).toBe(true);
 expect(isSettingsDetailHash("#school-information")).toBe(true);
});
