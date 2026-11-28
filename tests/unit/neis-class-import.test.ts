import {it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({unstable_cache:(f:unknown)=>f}));
import {parseNeisClassPreview} from "../../src/lib/neis";
const row=(grade:string,name:string)=>({ATPT_OFCDC_SC_CODE:"C10",SD_SCHUL_CODE:"7201238",AY:"2026",SCHUL_NM:"테스트중학교",GRADE:grade,CLASS_NM:name,SCHUL_CRSE_SC_NM:"중학교",DGHT_CRSE_SC_NM:"주간"});
const parse=(rows:Record<string,unknown>[])=>parseNeisClassPreview(rows,"C10","7201238",2026,[1,2,3],"중학교");
it("counts ordinary consecutive class numbers but keeps missing grades unknown",()=>{
 expect(parse([row("1","1"),row("1","2"),row("1","2"),row("2","2"),row("3","특수")])).toMatchObject({grades:[{grade:1,count:2},{grade:2,count:null},{grade:3,count:null}],excluded:1});
 expect(parse([])).toBeNull();
});
it("rejects mismatched years and conflicting course identities",()=>{
 expect(()=>parse([{...row("1","1"),AY:"2025"}])).toThrow();
 expect(()=>parse([row("1","1"),{...row("1","1"),DDDEP_NM:"다른 학과"}])).toThrow();
});
