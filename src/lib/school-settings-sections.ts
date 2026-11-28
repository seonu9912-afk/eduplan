export const settingsSectionFromHash=(hash:string)=>{
 if(hash==="#school-links"||hash==="#school-information")return "connections";
 const key=hash.replace(/^#settings-/,"");
 return ["school","year","operations","accounts","overview","connections","system"].includes(key)?key:"school";
};

export const isSettingsDetailHash=(hash:string)=>hash==="#school-links"||hash==="#school-information"||/^#settings-(school|year|operations|accounts|overview|connections|system)$/.test(hash);
