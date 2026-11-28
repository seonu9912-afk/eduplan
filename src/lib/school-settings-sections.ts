export type SettingsSection = "school" | "operations" | "accounts" | "system";

const sections: Record<string,SettingsSection> = {
 "#settings-school":"school", "#settings-connections":"school", "#school-links":"school", "#school-information":"school",
 "#settings-year":"operations", "#settings-operations":"operations",
 "#settings-accounts":"accounts",
 "#settings-overview":"system", "#settings-system":"system",
};
export const settingsSectionFromHash=(hash:string):SettingsSection=>Object.hasOwn(sections,hash)?sections[hash]:"school";
export const isSettingsDetailHash=(hash:string)=>Object.hasOwn(sections,hash);
export const settingsAnchorFromHash=(hash:string)=>["#settings-connections","#school-links","#school-information","#settings-year","#settings-overview"].includes(hash)?hash.slice(1):null;
