import {NextResponse} from 'next/server';
import {buildMipProblem,parseMipSchedule} from '../../../../legacy/workspace/lib/timetable-mip.js';
import {timetableConfig} from '../../../../legacy/workspace/lib/timetable-solver.js';
import {createClient} from '@/lib/supabase/server';
export const runtime='nodejs';
export const maxDuration=150;
export const dynamic='force-dynamic';
// Stateless computation: no timetable is written to disk, a database, or logs.
// Keep strict request-size and work limits until authenticated rate limiting exists.
export async function POST(request){
  try{
    const raw=await request.text();
    if(raw.length>650000)return NextResponse.json({ok:false,errors:['자동편성 입력 용량을 초과했습니다.'],slots:[]},{status:413});
    const body=JSON.parse(raw);
    const id = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if(!id(body.workspaceId)||!id(body.yearId))return NextResponse.json({ok:false,errors:['작업공간과 학년도를 확인해 주세요.']},{status:400});
    const db=await createClient();
    const auth=await db.auth.getUser();
    if(!auth.data.user)return NextResponse.json({ok:false,errors:['로그인이 필요합니다.']},{status:401});
    const member=await db.from('workspace_members').select('role').eq('workspace_id',body.workspaceId).eq('user_id',auth.data.user.id).maybeSingle();
    const year=await db.from('academic_years').select('id').eq('workspace_id',body.workspaceId).eq('id',body.yearId).maybeSingle();
    if(member.error||year.error||!member.data||!year.data||!['admin','editor'].includes(member.data.role))
      return NextResponse.json({ok:false,errors:['이 작업공간에서 시간표를 생성할 권한이 없습니다.']},{status:403});
    const plan=body?.plan;
    if(!plan||!Array.isArray(plan.classes)||!Array.isArray(plan.teachers)||plan.classes.length>28||plan.teachers.length>90||!Array.isArray(plan.subjects)||plan.subjects.length>90)
      return NextResponse.json({ok:false,errors:['지원하지 않는 시간표 데이터 크기입니다.'],slots:[]},{status:400});
    const config=body.config||timetableConfig(plan);
    if(!Array.isArray(config.lessons)||config.lessons.length>800)return NextResponse.json({ok:false,errors:['수업 배정표는 최대 800행까지 지원합니다.'],slots:[]},{status:400});
    const model=buildMipProblem(plan,config,Number(body.variant)||0);
    if(model.errors?.length)return NextResponse.json({ok:false,errors:model.errors,warnings:model.warnings,slots:[],stats:{reason:'invalid-input'}});
    const loadHighs=(await import('highs')).default;
    const highs=await loadHighs();
    const started=Date.now();
    const result=highs.solve(model.lp,{output_flag:false,time_limit:Math.min(100,Math.max(5,Number(body.limitSeconds)||65)),mip_rel_gap:0.05});
    const stats={reason:'mip',durationMs:Date.now()-started,taskCount:model.tasks.length,candidates:model.candidates.length,modelStatus:result?.Status,resourceConstraints:model.resourceConstraints,qualityConstraints:model.qualityConstraints};
    try{
      const slots=parseMipSchedule(plan,config,model,result);
      return NextResponse.json({ok:true,errors:[],warnings:model.warnings,slots,stats:{...stats,placedHours:slots.length}});
    }catch{
      return NextResponse.json({ok:false,errors:[result?.Status==='Infeasible'?'필수조건을 만족하는 시간표가 없습니다. 교사의 하루 최대·연속수업 제한과 공통시간·연속수업·특별실 조건을 확인해 주세요. 조건을 유지할 수 없다면 수업 배정부터 조정해야 합니다.':`제한 시간 내에 완전한 시간표를 찾지 못했습니다 (${result?.Status||'미확인'}). 조건 조정이나 재시도가 필요합니다.`],warnings:model.warnings,slots:[],stats});
    }
  }catch(e){return NextResponse.json({ok:false,errors:[`자동편성 계산을 수행하지 못했습니다: ${e?.message||'요청 오류'}`],slots:[]},{status:500});}
}
