// Backward-compatible local workspace storage. This module does not touch the browser.
// Never discard an unreadable existing workspace and silently replace it with demo data.
export const STORAGE_KEY='eduplan-workspace-demo-v1';
export const BACKUP_FORMAT='eduplan-workspace-v02';
export const WORKSPACE_ARRAYS=['events','tasks','docs','links','menus','forms','formEntries','staffMembers','planEntries','planTrips','planDuties','planDiscussions','planNotices'];

export function normalizeWorkspace(data, fallbackWorkspace){
  if(!data||!Array.isArray(data.schools)||!data.schools.length||typeof data.workspaces!=='object'||!data.workspaces||Array.isArray(data.workspaces))throw Error('학교 작업공간 형식이 올바르지 않습니다.');
  if(data.schools.length>100)throw Error('학교 목록이 허용 범위를 초과합니다.');
  const ids=new Set();
  const workspaces={...data.workspaces};
  for(const school of data.schools){
    if(!school||typeof school.id!=='string'||!school.id||typeof school.name!=='string'||!school.name.trim()||ids.has(school.id))throw Error('학교 정보가 올바르지 않거나 중복되었습니다.');
    ids.add(school.id);
    const space=data.workspaces[school.id];
    if(!space||typeof space!=='object'||Array.isArray(space))throw Error(`${school.name} 작업공간이 없습니다.`);
    const normalized={...fallbackWorkspace,...space};
    for(const key of WORKSPACE_ARRAYS){
      if(space[key]!==undefined&&!Array.isArray(space[key]))throw Error(`${school.name} ${key} 자료 형식이 올바르지 않습니다.`);
      normalized[key]=Array.isArray(space[key])?space[key]:[];
    }
    if(space.academics!==undefined&&(typeof space.academics!=='object'||!space.academics||Array.isArray(space.academics)))throw Error('학사 편성 자료 형식이 올바르지 않습니다.');
    normalized.academics=space.academics||{};
    if(space.curricula!==undefined&&(typeof space.curricula!=='object'||!space.curricula||Array.isArray(space.curricula)))throw Error('교육과정 편성 자료 형식이 올바르지 않습니다.');
    normalized.curricula=space.curricula||null;
    if(space.staffQuotas!==undefined&&(typeof space.staffQuotas!=='object'||!space.staffQuotas||Array.isArray(space.staffQuotas)))throw Error('교원 정원 자료 형식이 올바르지 않습니다.');
    normalized.staffQuotas=space.staffQuotas||{};
    if(space.planningSettings!==undefined&&(typeof space.planningSettings!=='object'||!space.planningSettings||Array.isArray(space.planningSettings)))throw Error('월중·주간계획 설정 형식이 올바르지 않습니다.');
    if(space.planReviews!==undefined&&(typeof space.planReviews!=='object'||!space.planReviews||Array.isArray(space.planReviews)))throw Error('부서 확인 자료 형식이 올바르지 않습니다.');
    normalized.planningSettings=space.planningSettings||{};
    normalized.planReviews=space.planReviews||{};
    normalized.enabled={...fallbackWorkspace.enabled,...(space.enabled&&typeof space.enabled==='object'&&!Array.isArray(space.enabled)?space.enabled:{})};
    workspaces[school.id]=normalized;
  }
  return {...data,schools:data.schools,workspaces};
}
export function parseWorkspace(raw,fallbackWorkspace){
  if(!raw)return null;
  let input;try{input=JSON.parse(raw);}catch{throw Error('기존 저장 데이터의 JSON을 읽을 수 없습니다. 원본은 보존했습니다.');}
  return normalizeWorkspace(input,fallbackWorkspace);
}
export function parseBackup(raw,fallbackWorkspace){
  let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('백업 파일의 JSON 형식이 올바르지 않습니다.');}
  if(parsed?.format!==BACKUP_FORMAT)throw Error('지원하지 않는 백업 파일 형식입니다.');
  return normalizeWorkspace(parsed.data,fallbackWorkspace);
}
export function makeBackup(db){return JSON.stringify({format:BACKUP_FORMAT,createdAt:new Date().toISOString(),data:db},null,2);}
