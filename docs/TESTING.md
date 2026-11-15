# 테스트 결과와 재현

## 실제 실행 결과

| 검증                              | 결과               | 범위·한계                                                                                                                |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Vitest                            | 55개 통과          | 날짜·윤년·수업일수와 교시 독립성·월/학기 합계 일치·두 해 공휴일 병합·운영 학년도 매핑·시수·붙여넣기·리디렉션·페이지 조회 |
| ESLint                            | 통과               | 오류·경고 없음                                                                                                           |
| TypeScript                        | 통과               | Next 타입 생성, tsc --noEmit                                                                                             |
| 프로덕션 빌드                     | 통과               | 실제 Supabase 환경 설정 사용                                                                                             |
| Playwright 로컬 프로덕션          | 9개 시나리오 통과  | 실제 사용 흐름, 데스크톱 1440px·모바일 390px                                                                             |
| Supabase RLS·학교급·연간 계획 SQL | 모두 통과          | 접근 제어·RPC·학교급별 유효 학년, 가상 데이터 rollback                                                                   |
| Security Advisor                  | Auth 경고 1건      | 유출 비밀번호 차단 비활성화. RLS·함수 검색 경로 경고 없음                                                                |
| 인증·복구 메일 수신               | 미검증             | 가상 example.com 가입은 email_address_invalid로 거절. 전달 성공으로 간주하지 않음                                        |
| Vercel 환경                       | 신규 3개 운영 검증 | 기존 5개 운영 검증 이력 및 통합 로그인·인증·학교급·일정·시수·초대·권한 회수·재로그인·프로필 저장 확인                    |
| 초등 편성표 인쇄                  | 통과               | 6개 학년·12학기·합계가 A4 가로 1페이지에 출력됨                                                                          |
| Vercel 런타임 로그                | 오류 없음          | 새 연간 계획 배포에서 운영 E2E 후 error/fatal 로그 없음. 지속 모니터링을 의미하지 않음                                   |

## 브라우저 범위

첫 화면 로그인 통합 → 회원가입 페이지 → 모바일 로그인 → 비인증 /app 리디렉션을 확인했습니다. 로그인·가입 진입 버튼 중복이 없고 기존 /login 및 초대 링크의 반환 경로가 유지되는지 확인했습니다.

확인된 가상 계정으로 실제 비밀번호 로그인 → 개인 공간 → 학교 개설 → 2026학년도·학급 2·3·4개 저장·새로고침 → 일정 등록 → 월중·주간계획 일치 → 제목 수정·재조회 → 교과군·과목 등록 → 2026 입학생 편성표 → 여섯 학기 붙여넣기·합계 306 → 저장·재조회 → 음수 거절 → 운영 학년도 매핑 → PDF → 조회 전용 초대 수락 → 편집 제한 → 권한 회수 즉시 반영 → 모바일 → 로그아웃·재로그인 → 시수 유지 → 일정 삭제를 검증했습니다. 운영 배포에서는 프로필 이름·기본 작업공간 저장과 /app 진입 시 해당 공간 선택도 확인했습니다. 브라우저 pageerror가 없었습니다.

초등학교 시나리오는 1~6학년 학급 저장·재조회, 6학년 대상 행사, 12학기 붙여넣기·총 120시간·저장·재조회, 4~6학년 자료가 있을 때 중·고등학교 변경 차단을 검사했습니다. 고등학교 생성 시 3학년까지만 표시되는 것도 확인했습니다.

가상 계정은 SQL로 이메일 확인 상태를 준비했으므로 이 테스트는 인증 이메일 발송·클릭의 성공을 증명하지 않습니다. 모바일 기본 배치와 화면 너비를 검사했으며 모든 기기 조합을 검사하지는 않았습니다.

## DB 검증

`supabase/tests/rls.sql`은 매번 새 가상 사용자를 생성하고 전체 작업을 rollback합니다.

- 가입 시 개인 작업공간 생성, 학년도·학급 원자적 저장
- 일정·시수 저장, 낡은 버전 저장 거절
- null 학급·버전·편성표 payload 거절, 기존 시수 보존
- 타 학교 조회·수정·삭제·외래키 연결 차단
- 편집자의 관리자 기능·권한 상승 차단, 조회 전용 편집 차단
- 멤버십 삭제 후 기존 JWT로 즉시 접근 불가
- 초대 이메일 불일치·재사용·재발급된 이전 링크·만료 차단
- 익명 테이블·특권 RPC 접근 차단

`supabase/tests/school_levels.sql`은 초·중·고 생성, 개인 공간 학교급, 학년별 학급 수, 초등 6학년 시수·행사 저장, 중·고 4학년 쓰기 차단, 편집자의 직접 쓰기 검사, 학교급 변경 권한·자료 보호를 검증하고 rollback합니다.

## 재실행

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run start
```

별도 테스트 Supabase를 권장합니다. 마이그레이션 적용 후 관리자 SQL 연결로 `supabase/tests/rls.sql`과 `supabase/tests/school_levels.sql`을 실행합니다.

```bash
node scripts/prepare-test-fixtures.mjs
# .test-secrets-setup.sql을 테스트 DB 관리자 SQL 연결로 실행
mkdir -p .artifacts
BASE_URL=http://localhost:3000 npm run test:e2e
# 반드시 .test-secrets-cleanup.sql을 같은 DB에서 실행해 가상 계정·공간 제거
```

현재 `/usr/bin/chromium`을 사용합니다. 다른 환경은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`을 설치된 Chromium 경로로 설정하세요. `.test-secrets*`는 임시 비밀번호를 포함하므로 커밋·공유하지 않습니다. 준비 파일을 덮어쓰기 전에 기존 정리 SQL을 실행하세요.

JSON·스크린샷·PDF는 `.artifacts/`에 저장되고 Git에서 제외됩니다. 인증 정보가 추적 파일에 남지 않도록 Playwright trace와 Next 개발 서버의 serverFunctions 인자 로깅을 비활성화했습니다.

## 발견 후 수정

- 저장 직후 이전 데이터 표시: Supabase 조회 no-store, 개발 HMR 캐시 비활성화. 프로덕션 저장·재조회 통과.
- 2월 말일 고정값: 윤년을 포함한 실제 월 말일 계산으로 수정.
- Supabase 기본 1,000행 제한: 이벤트·시수 페이지 조회.
- 직접 RPC의 null payload: DB에서 거절, 기존 시수 보존 테스트 추가.
- Next 알림 영역과 테스트 선택자 충돌: 오류 내용으로 선택자를 한정.
- 편집자 학교급 검사: 관리자 전용 workspace UPDATE RLS 때문에 직접 행 잠금에서 범위를 읽지 못하는 문제를 SQL 테스트로 발견. 현재 편집 권한을 명시적으로 확인하는 private 잠금 함수로 수정하고 두 SQL 테스트를 통과.

## 클라우드 브라우저 인증서 환경

이 환경의 Chromium은 NSS DB를 쓰기 가능하게 열어야 기존 CA를 읽을 수 있습니다. 기본 샌드박스에서 홈의 NSS DB가 읽기 전용이어서 배포 사이트 탐색이 ERR_CERT_AUTHORITY_INVALID로 실패했습니다. 사용자의 인증서 등록 승인을 받은 뒤 동일 CA가 기존 OpenAI-nebula-dns 이름으로 이미 등록되어 있음을 확인했습니다. 테스트 명령에 `/home/agent/.pki/nssdb` 디렉터리 쓰기 권한만 부여하여 기존 CA를 사용합니다. TLS 검증을 끄거나 ignoreHTTPSErrors를 사용하지 않습니다.

## 검증한 소스 버전

`f2ff21e`의 운영 배포 `dpl_6K1EtSs9p8fKN5fPUdyySCnwPbdC`에서 브라우저 시나리오 5개를 모두 통과했습니다. 미사용 과목 삭제, 시수가 있는 과목의 삭제 취소·확정, 두 입학년도 연결 시수 정리, 재로그인 후 다른 과목 보존, 조회 전용 삭제 버튼 미노출을 검증했습니다. 연간표 12개월·31행, 월별 달력 전환, 첫 화면 수업일수·월/학기 합계, 날짜 사용 해제·Excel 요약 일치, 방학 추가·수정·삭제에 따른 일수 변화, 복원 후 업무 보존을 확인했습니다. 운영 상태 READY, HTTP 200입니다. 이후 변경은 검증 결과 문서입니다.

## 공공 API 연결 확인

나이스 학교정보는 HTTP 200, INFO-000으로 정상 응답했습니다. 공휴일은 개발 환경의 코드 10과 달리 운영 서버에서 정상 코드 00, 공휴일 22개 파싱에 성공했습니다. 단기·중기 육상·중기 기온예보도 모두 00 / NORMAL_SERVICE로 실제 예보를 표시했습니다. 동일한 연 조회 요청을 개발 환경에서 재확인하면 HTTP 400 / 코드 10입니다. 키를 바꾸지 않고 운영 서버에서 성공했으며 정확한 네트워크 계층 원인은 확정하지 않았습니다. [요청·응답 진단](PUBLIC_API_DIAGNOSTIC.md)을 참고하세요.

## 테스트 자료 정리

E2E용 가상 사용자 두 명과 이들이 소유한 모든 개인·학교 작업공간을 삭제했습니다. 후속 DB 조회에서 잔여 테스트 사용자 0명, 잔여 테스트 작업공간 0개를 확인했습니다. 로컬 임시 비밀번호·준비 SQL도 삭제했습니다.

## 연간 계획 이관 검증

날짜·교시 계산 5개와 공휴일 XML 파서 2개 테스트를 추가했습니다. 사용 해제일의 시수 제외, 실제 학기 경계, 방학/수동 수정 우선순위, 6학년, 요일 교체, 창체 제외일, 행사 우선 배정, 중복 교시, 불완전 XML과 데이터 수 불일치·잘못된 날짜를 검사합니다. `supabase/tests/annual_plans.sql`은 문서 구조 검증, 초기 저장·버전 증가, 이전 저장본, 낡은 버전 거절과 타 공간 읽기·쓰기 차단을 검증하고 rollback합니다. 기존 RLS·학교급 SQL도 새 마이그레이션 적용 후 다시 통과했습니다.

브라우저 연간 시나리오는 3월 1일 기본값·삼일절·12개월 표시, 저장·사용 해제일 수정·재조회, Excel 다운로드와 실제 파일의 해당 날짜 0시간 확인, 이전 버전 복원, 모바일 너비, 부서 업무 추가·저장·재조회를 검사합니다.

연간 시나리오는 실제 Excel 다운로드까지 성공한 뒤 테스트 실행기의 CommonJS/ESM import 차이로 파일 읽기 단계가 실패했습니다. 테스트의 default import를 수정한 뒤 Excel 내용 검사·복원·업무 저장까지 통과했습니다(29.2초). 기존 3개 시나리오도 통과했습니다.

최종 운영 검증 후 새 테스트 사용자 2명과 이들의 개인·학교 공간을 모두 삭제했습니다. 재조회한 테스트 사용자·작업공간은 모두 0이며 임시 인증 파일도 삭제했습니다.

## 과목 삭제와 연간 화면 개선

`supabase/tests/subject_deletion.sql`은 사용 중인 과목의 다중 편성표 시수 삭제, 편성표 자체와 다른 과목 보존, 버전 증가·오래된 편성표 저장 거절, 조회 전용·외부 사용자 삭제 거절, 편집자의 미사용 과목 삭제와 활동 기록을 검증하고 rollback했습니다.

수업일수 계산 테스트는 시간표 미입력 상태, 실제 학기 경계, 윤년 2월, 방학·재량휴업·수동 요일 교체, 두 연도 공휴일의 학년도 필터와 일부 조회 실패 시 전체 반영 거절을 검사합니다.

로컬 브라우저에서 날짜 편집창의 같은 이름을 가진 닫기 버튼 두 개가 검증 중 발견되어 중복 버튼을 제거했습니다. 포커스도 원래 선택한 날짜로 돌아오도록 보완했습니다. 수정 후 연간 시나리오와 운영 전체 시나리오가 통과했습니다.

공휴일 버튼 1개에서 2026년과 2027년을 함께 조회하고 학년도 범위 23일을 반영했습니다. 다음 해 1~2월 5일 포함, 수동 요일 교체·방학·업무 보존을 저장 후 JSON 내보내기와 별도 SQL 조회로 확인했습니다. 응답 원문 보조 캡처의 도구 제약은 PUBLIC_API_DIAGNOSTIC.md에 구분해 기록했습니다.

최종 테스트 사용자 2명, 이들이 소유한 작업공간 13개 및 세션을 제거했습니다. SQL 재조회에서 사용자·작업공간·세션이 각각 0개입니다. 시수 외래키 때문에 발생한 테스트 정리 순서 문제를 해결하고, 생성 스크립트의 정리 SQL도 시수→과목→교과군→작업공간 순으로 보완했습니다. 임시 인증 파일과 원시 전송 오류 로그는 제거했습니다.

## 2026-11-09 편제·학사운영·업무계획 개선 검증

- 타입 검사·프로덕션 빌드·ESLint 통과, 단위 테스트 43개 통과.
- `planning_refinement.sql`: 학기 편집자 권한·낡은 버전/중복 기간 거절·학급 보존, 초안 원자적 생성·기존 편성표 덮어쓰기 차단, 조회 전용/타 공간 차단, 교육활동 영역 및 선택적 당직/업무 메타데이터 저장을 실제 DB에서 검증 후 롤백.
- 기존 브라우저 5개 시나리오와 신규 1개 시나리오를 확인. 새 학기 설정과 기존 방학 설정이 같은 CSS 클래스를 사용하여 발생한 테스트 선택자 중복은 ‘방학 설정’ 텍스트로 한정해 수정. 수정 후 연간 계획·신규 개선 시나리오 2개 재실행 통과(85.7초).
- 신규 검증: 학교 설정에서 학기 입력 제거, 학사운영의 학기 수정 후 수업일수 5일 감소, 학급 수/학기 날짜 재저장 보존, 행사 진로 영역→교시 배정 연결, 중학교 3,366시간 초안 저장·재조회·중복 생성 차단, 부서 업무의 시간/장소/참석자, 당직 숨김→저장·재접속→재표시 시 기록 유지.
- 390px 화면에서 긴 공휴일명 54자 주입 후 전체 페이지 및 연간표 각 셀의 가로 넘침 없음. 월중 달력과 목록도 페이지 너비 유지.
- 주간 6열/월중 7열, 데스크톱·모바일 스크린샷 확인. 월중 인쇄에서 빈 출장/당직 행과 과도한 최소 높이를 제거하여 검증 자료가 가로 1페이지로 출력됨. 실제 일정량에 따라 페이지 수는 늘어날 수 있음.

## 최종 운영 배포 확인 (2026-11-09)

- `dae4c56` 배포에서 연간 계획/복원/업무 연동과 총론 초안/학기/행사 영역/당직 설정 시나리오 2개 통과(60.8초). 실제 공휴일 API 불러오기 성공, 저장된 23일 중 다음 해 1~2월 5일 포함.
- 실제 DB에서 중학교 초안 합계 3,366·단위 hours, 변경된 2학기 시작일 2026-08-24, 진로 행사 1개, 업무 2개 및 당직 설정 보존을 별도 조회로 확인.
- `c7309f6` 배포 `dpl_Dj3VLQxndavn77Gr6tqAjJ9euSX8`: 고등학교 192학점 초안·학점 셀 저장/재조회·삭제 영향 8학점 표기·삭제 취소를 운영 브라우저에서 통과(11.6초). 학교 생성 직후 이전 공간의 링크를 누르던 테스트 경합은 새 공간의 설정 URL과 학교급 표시를 기다리도록 수정. 앱 생성 결과는 고등학교로 정상 저장됨.
- 운영 주소 https://eduplan-silk.vercel.app, READY, 별칭 연결 정상. 위 두 배포의 검증 기간 error/fatal 로그 조회 결과 없음. 지속 운영 전체에 대한 무오류 보장은 아님.
- 테스트용 계정/소유 작업공간/세션 삭제 후 잔여 수 각각 0 확인. 로컬 임시 비밀번호 파일과 준비·정리 SQL도 삭제함. 일반 사용자 자료를 수정하지 않음.
- 현재 실행 코드는 `c7309f6`, 이후 커밋은 검증 기록과 테스트 대기 조건만 변경함.

## 2026-11-10 수업·평가 모듈

- TypeScript·ESLint·프로덕션 빌드 통과. Vitest 55개 통과(신규 12개: 초안 구조, 수행평가 100%, 혼합 100/90%, 소수 비율, 비율 없는 평가, 루브릭 합계/누락/초과, 성취기준, 차시, 기간 경계, 학기별 평가, 입력 형식, 편성 원본 비교).
- 기존 브라우저 7개 회귀 시나리오 모두 통과. 신규 2개 시나리오도 통과. 두 번째 시나리오의 새 학년도 개설 버튼 선택 누락을 수정한 뒤 해당 시나리오 전체를 재실행해 통과했다. 앱 오류 수정이 필요한 실패는 아니었다.
- 신규 첫 시나리오: 2026학년도 2학년 국어·2개 학급 연결, 단원과 직접 등록 성취기준, 행 복제/이동/삭제, 34차시 저장, 수행평가 100%와 단계별 루브릭, 정기시험 40%+수행 60%, 90% 경고와 초안 저장, 자유학기 모드, 재로그인, 확정 수정→작성 중, 버전 복원, 계획 복사, 필터 유지, 390px 화면, 두 종류의 A4 PDF.
- 신규 두 번째 시나리오: 연간 수업 1·2학기 평가 분리, 저장 후 학기 선택 유지, 편성 136→138차시 변경 알림·명시적 갱신 후 교사 작성 34차시 유지, 네트워크 실패 후 입력 보존·재시도, 두 탭의 오래된 버전 저장 거절·최신 내용 유지, 2026/2027 및 개인/학교 공간 전환 격리.
- 실제 PDF를 텍스트 추출 및 이미지로 확인했다. 검증 자료 기준 교수학습계획과 평가계획이 각각 A4 가로 1쪽에 출력되며, 성취기준·루브릭·한국어 내용이 보존된다. 실제 자료량에 따라 여러 페이지가 된다.
- 모바일 평가 방식·비율 안내가 가늘게 눌리는 문제를 수정하고 390px에서 너비/높이와 전체 페이지 넘침을 검사했다. 교수학습 표는 컨테이너 안에서 가로 스크롤한다.
- `supabase/tests/teaching.sql` 실제 DB 검증 및 rollback 통과: 다중 학급, 비공개/공유, 관리자·편집자·조회 전용·외부 사용자, 교차 학년도/학교 연결 거절, 직접 UPDATE 차단, CAS·확정 수정·복원·보관·복사, 편성 원본 변경/삭제 후 계획 보존·수동 기준 입력. 기존 subject_deletion.sql과 school_levels.sql도 통과.
- 앱 소스와 브라우저 번들에서 private 환경변수 값이 노출되지 않는지 검사했다. Security Advisor의 기존 Auth 유출 비밀번호 차단 비활성화 경고 1건 외에 새 RLS/함수 경고는 없었다.
- 가상 테스트 계정의 이메일 발송 자체는 검증하지 않는다.

## 수업·평가 최종 운영 확인 (2026-11-10)

- 배포 `dpl_736yTbZ1DMBCFRi3aZ3Hv7MyQT5b`, 앱 소스 `001b9ce`, 상태 READY. 운영 주소 https://eduplan-silk.vercel.app 및 두 운영 별칭 연결 확인. 이후 소스 변경은 검증 기록·테스트 대기 조건·적용 DB 마이그레이션 기록이며 앱 실행 코드는 동일하다.
- 위 운영 주소를 BASE_URL로 지정한 수업 생명주기 브라우저 테스트가 45.7초(실행 전체 47.4초)에 통과했다. 생성·성취기준·여러 학급·단원 행 조작·100%/혼합/90%/비율 없는 평가·루브릭·재로그인·복원·복사·390px·별도 PDF를 확인했다. 학교 전환 테스트는 새 작업공간의 링크가 반영된 뒤 클릭하도록 대기 조건을 명시했다.
- 별도 SQL 조회에서 원본 국어 수업: 2학년/1학기, 2개 학급, 기준 및 계획 34차시, 평가 항목 2개, 저장 버전·이력 각 9개. 복사 수업도 같은 단원과 평가 내용을 독립된 버전으로 저장했다.
- 교수학습계획과 평가계획 PDF 각각 A4 가로 1쪽(검증 자료 기준) 및 한국어 내용 확인. 검증 직후 해당 배포의 최근 15분 error/fatal 로그 0건.
- 전체 작업공간 정리 시 기존 학급/성취기준과 수업 연결의 삭제 순서가 충돌할 수 있어, 두 참조 FK를 트랜잭션 종료 시 검증하도록 마이그레이션했다. 실제 SQL에서 개별 참조 학급 삭제 거절·학급 보존과 전체 가상 작업공간 cascade 정리를 모두 확인했다. 범위 FK·RLS는 유지된다.
- 가상 사용자·작업공간·세션·수업·계획·성취기준·버전 이력 제거 후 잔여 수 모두 0. 별도 재조회에서도 사용자·작업공간·세션 0을 확인했다. 로컬 임시 비밀번호와 준비/정리 SQL도 제거했다.
- 적용된 DB 마이그레이션 14개의 실제 버전과 로컬 파일명을 맞췄다. DB 이력을 수정하거나 기존 마이그레이션을 재적용하지 않았다. 최종 TypeScript·ESLint 및 git diff --check 통과.

## School submission reports / HWPX — 2026-11-11

- Expanded the teaching lifecycle E2E to enter weekly fields, assessment purpose/direction/policy/absence handling, achievement bands/levels, detailed assessment competencies and school-specific report format. Verified actual Supabase persistence after reload, downloaded HWPX text, history, copying, mobile widths, and both PDF orientations. Both teaching E2Es passed on a fresh local production server (2.0m). An earlier run encountered a transient save/login response timeout; rerun on a fresh final build passed.
- All prior unit tests passed (60 including the first five report tests); additional long-table export test covers 72 weekly rows, 4,320 repeated text segments, complete final row and repeated headers.
- Supabase transaction tests passed and rolled back: JSON compatibility with old plans, new report save and history restore, rejection of duplicate column keys; existing isolation/RLS/CAS/cascade checks remain intact. Migration 20261111061248 adds optional JSON fields and retains the existing authorization and version checks.
- Independent `python-hwpx==6.11.0` schema and package validation reports zero issues for the synthetic sample and actual browser download (two sections, nine editable tables). Synthetic long-table output is also validated. Use `python scripts/validate-teaching-hwpx.py <file.hwpx>`.
- Inspected landscape lesson PDF and portrait evaluation PDF and mobile report controls. HWPX uses the same report content model as print, but native Hancom opening/pagination is not verified: Hancom is unavailable here and LibreOffice cannot load even the user's original HWPX. Do not present the PDF screenshot as a native Hancom rendering.

Final verification: all 61 unit tests, lint and production build passed. The same two browser scenarios passed on https://eduplan-silk.vercel.app (48.3s + 38.4s). The actual production HWPX passed independent OWPML/package validation with zero issues; the independent text reader recovered all selected new fields. All synthetic users/sessions/workspaces/courses were removed and independently counted as zero; the pre-existing non-test teaching plan remains.

## 교수학습·평가 작성 논리 보완 — 2026-11-11

- Vitest 71개 통과: 세 주↔독서 과제, 세 진행 단계/네 채점 요소, 과제 복사 시 ID 분리, 단계·과제·기준 삭제 후 내용 보존, 잘못된 참조/중복, 학습 기회·증거 누락, 교육과정 버전을 구분한 기준 문장 비교, 실제 학사일정 기반 주차 초안과 미확정 과목 차시, 비수업 활동 구분. 공유 출력 모델에도 관계/과제/단계/증거가 포함된다.
- `supabase/tests/teaching.sql` 실제 DB 트랜잭션 검사 후 rollback 통과. 동일 수업의 같은 역할을 서로 다른 단계에 연결할 수 있고, 존재하지 않는 과제/단계, 중복 연결, 과제에 포함되지 않은 기준, 중복 단계 ID를 거절한다. 저장·계획 전체 복사·구버전 및 신버전 복원, 연결 수정 시 확정 평가를 작성 중으로 되돌리는 동작을 확인했다. 기존 RLS·CAS·교차 학교/학년도·조회 전용·직접 UPDATE 제한도 통과했다.
- 새 브라우저 시나리오: 3주 수업, 과제 수행/증거, 독서→활동지→프로젝트의 3단계, 4채점 요소(프로젝트 2요소), 요소별 기준/증거/평정수준, 양방향 연결 편집/이동, 저장·재접속, 단계 삭제와 내용 보존, 이력 복원, 과제 단독 복사와 수업 연결 재지정, 연결된 과제 삭제, 계획 전체 복사, 학사일정 주차 추가와 실제 과목 시수 빈칸 보존. 최종 로컬 실행 52.7초 통과. 첫 실행은 새 주차 목록을 `li`로 찾는 테스트 선택자를 `p`로 수정했다.
- 390px 모바일에서 페이지 가로 넘침 없음; 연결 검토의 준비/실시/피드백이 세로 배치됨을 실제 이미지로 확인했다. 데스크톱에서도 단계별 여러 채점 요소와 증거가 함께 표시된다.
- TypeScript, ESLint, 프로덕션 빌드 통과. 새 보안 Advisor 경고 없음(기존 Auth 유출 비밀번호 차단 비활성화 1건 유지). 비공개 환경변수 값이 배포 대상 소스에 포함되지 않음을 검사했다.
- 자동 점검은 연결·누락·합계를 확인한다. 교육과정 문장의 의미적 적절성, 학교 규정 준수, 실제 시간표 시수는 자동 인증하지 않는다.
- 기존 두 브라우저 회귀도 로컬 프로덕션 서버에서 통과(수업 생명주기 약 1.1분, 편성 참조·연간 학기·실패 재시도·동시 수정·공간/학년도 격리 58.1초). 새 과제/단계/증거를 포함한 HWPX는 독립 검증에서 OWPML·패키지 오류 0건(2섹션, 11개 편집 가능 표). 실제 한컴 렌더링 검증은 포함하지 않는다.
