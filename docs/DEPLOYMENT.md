# 배포와 인증 설정

## 운영 주소

https://eduplan-silk.vercel.app

배포 ID: `dpl_736yTbZ1DMBCFRi3aZ3Hv7MyQT5b` · 상태 READY · 로컬 소스 커밋 `001b9ce`. GitHub 업로드 없이 파일 직접 배포했습니다.

## 구성

- 저장소: https://github.com/seonu9912-afk/eduplan
- Supabase: `sssyjkwcsyeyfkqmdgnb`, `eduplan`, 서울 리전
- Vercel: `seonu-lab / eduplan`, Node.js 24, Next.js, 서울 함수 리전
- GitHub 업로드·Private 전환: 승인받았지만 연결 토큰 403으로 미완료. 사용자 선택에 따라 로컬 개발·직접 배포를 계속함.
- 운영·로컬 개발 환경에 Supabase 공개 설정 등록. Preview는 별도 Supabase 개발 프로젝트 연결 전까지 DB 환경변수를 제공하지 않음.

## Vercel

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`을 환경별로 설정합니다. 현재 운영 SITE_URL은 `https://eduplan-silk.vercel.app`으로 등록되어 있습니다. 운영 SITE_URL은 https 고정 운영 주소여야 합니다. 미설정 시 `VERCEL_PROJECT_PRODUCTION_URL`을 사용합니다. 값 변경 후 재배포합니다.

GitHub 원격이 비어 있으므로 Git 연결만으로 빌드할 수 없습니다. 검증한 로컬 소스를 직접 배포하거나 연결 권한 복구 후 main을 업로드해야 합니다. 배포에 `.env.local`, `.test-secrets*`, `.artifacts`, `node_modules`, `.git`을 포함하지 않습니다.

접근 보호 변경 요청은 자동 승인 검토에서 거절되었으며 적용되지 않았습니다. 기존 `all_except_custom_domains` 설정을 유지한 상태에서 운영 도메인의 HTTP 200과 EduPlan 랜딩 화면을 확인했습니다. 추가 접근 설정 변경은 필요하지 않습니다. 학교 자료는 앱 로그인과 RLS로 보호됩니다.

## 외부 공공 API

`HOLIDAY_API_KEY`, `NEIS_API_KEY`를 로컬 비추적 환경파일과 Vercel Production의 sensitive 환경변수에 등록했습니다. 브라우저 공개 변수로 만들지 않습니다. 공휴일 확인·원본 오류 표시·보존 병합과 기상청 단기/중기 예보 조회 화면을 제공합니다. 날씨 키가 별도라면 WEATHER_API_KEY를 설정하고, 제공받은 키가 동일한 현재 환경에서는 HOLIDAY_API_KEY를 함께 사용합니다. 나이스 학교정보는 정상 응답을 확인했고, 공휴일과 기상청은 운영 서버에서 정상 응답·실제 데이터 표시를 확인했습니다. 개발 환경 경유 호출의 코드 10 이력은 PUBLIC_API_DIAGNOSTIC.md에 기록했습니다.

## Supabase 인증

설정: https://supabase.com/dashboard/project/sssyjkwcsyeyfkqmdgnb/auth/url-configuration

운영 주소가 `https://eduplan-silk.vercel.app`이라면:

1. Site URL을 운영 주소로 설정합니다.
2. Redirect URLs에 다음을 추가합니다.
   - `https://eduplan-silk.vercel.app/auth/callback`
   - `https://eduplan-silk.vercel.app/auth/callback?next=/reset-password`
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/callback?next=/reset-password`
3. 이메일 가입과 이메일 확인을 유지합니다.
4. 실제 가입자에게 전송할 SMTP와 발신 도메인 인증을 설정합니다. Supabase 기본 메일에는 수신자·전송량 제한이 있으므로 실제 수신 확인이 필요합니다.
5. 운영 URL에서 가입 → 이메일 확인 → 로그인 → 로그아웃 → 비밀번호 재설정 → 새 비밀번호 로그인을 확인합니다. 기본 PKCE 링크는 요청한 브라우저에서 여세요.

선택적으로 이메일 템플릿에 token_hash 확인 경로를 사용할 수 있습니다. `/auth/confirm?token_hash=...&type=email` 및 `type=recovery`를 구현했습니다. 템플릿 변경 시 확인·복구 메일을 각각 검증해야 합니다.

최종 Security Advisor에서 유출 비밀번호 차단 비활성화 경고가 확인되었습니다. 요금제 지원 여부 확인 후 Auth에서 활성화를 검토하세요. 앱은 신규 비밀번호 10~128자를 요구합니다.

SMTP 비밀번호·서비스 역할 키·개인 토큰은 채팅이나 소스에 기록하지 않고 서비스의 비밀 설정에 직접 입력합니다.

## 수업·평가 배포 (2026-11-10)

- 운영 별칭 `eduplan-silk.vercel.app`, 수업 메뉴 `/app/{workspaceId}/teaching?year=2026`.
- Next.js / Node.js 24 / icn1. 소스 직접 배포, 빌드 약 37초, HTTP 200 및 운영 별칭 연결 확인.
- 여섯 새 테이블과 RLS·RPC를 추가했으며 기존 자료를 초기화하지 않았다. Supabase에 적용된 14개 마이그레이션의 실제 기록 버전과 로컬 파일명을 일치시켰다. 파일명만 정렬했으며 적용된 SQL이나 DB 이력을 다시 실행/변경하지 않았다.
- SQL 변경은 이미 적용되어 있다. 향후 변경은 새 마이그레이션으로 추가하며 기존 파일을 재실행하지 않는다.
- 운영 저장·재로그인·복원·복사·PDF·모바일 검증 통과. error/fatal 로그 0건(검증 직후 최근 15분). 가상 자료 정리 완료. 상세 결과는 TESTING.md 참고.


### 2026-11-11 school submission / HWPX release

Production source commit: `2908e3a41769580212c983499927d078b59d8d14`. Deployment `dpl_MxSTE17SPTH3auguCLgACusFRkHA` is READY on `eduplan-silk.vercel.app` (unique URL: `eduplan-l5k7rbemd-seonu-lab.vercel.app`), Node 24, icn1. Server build took approximately 33 seconds. Source files were deployed through the authenticated Vercel connector to the existing EduPlan project; GitHub upload permissions remain unchanged. Optional report schema migration `20261111061248_teaching_submission_reports` was applied before releasing the app, without updating existing document content.

Post-release verification: canonical-domain teaching lifecycle and curriculum/reference regression scenarios passed, including HWPX download. Runtime error/fatal scan returned no records. This verifies the exercised flows only, not ongoing monitoring or native Hancom pagination.

학교 관리자는 **설정 → 학교 기본정보 연결**에서 나이스 학교를 선택하거나 기존 연결을 갱신할 수 있습니다. 급식은 이 학교 코드와 한국 날짜를 사용합니다. 기상청 격자는 전국초중등학교위치표준데이터의 학교명과 도로명주소가 일치할 때 저장됩니다. 자동 확인이 어려우면 설정의 **학교 날씨 위치**에서 격자 X·Y를 입력합니다. [공공데이터포털 학교 위치 표준데이터](https://www.data.go.kr/data/15021148/standard.do)

학교 위치 자료를 갱신할 때는 공공데이터포털에서 JSON을 받아 `node scripts/build-school-weather-grid.mjs <다운로드 파일>`을 실행합니다. 생성한 인덱스는 학교명과 도로명주소의 해시 및 예보 격자만 보관합니다.
