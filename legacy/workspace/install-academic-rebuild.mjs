import {readFileSync,writeFileSync} from 'node:fs';

const file='app/page.jsx';
const source=readFileSync(file,'utf8');
if (!source.includes("../components/AcademicRebuild")) {
  const entry=/\{nav==='calendar'\s*&&\s*<Calendar(?:Planner|V12Port)\b[^\n]*?\/>\}/g;
  const entries=[...source.matchAll(entry)];
  if(entries.length!==1||!entries[0][0].includes('key={schoolId}'))throw Error('학사일정 진입점의 작업공간을 확인할 수 없습니다.');
  const componentsLine=/^(import .* from ['"]\.\.\/components\/Calendar(?:V12Port|Planner)(?:\.jsx)?['"];?)$/m;
  if(!componentsLine.test(source))throw Error('학사일정 컴포넌트 import를 확인할 수 없습니다.');
  const page=source.replace(componentsLine,"$1\nimport AcademicRebuild from '../components/AcademicRebuild';");
  writeFileSync(file,page.replace(entry,original=>"{nav==='calendar' && <AcademicRebuild space={space} workspaceId={schoolId} focusDate={calendarFocus}>"+original+"</AcademicRebuild>}"));
}
