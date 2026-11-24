# 구현 현황

**2026-11-24 개발 브랜치 업데이트:** 아래 표는 과거 배포 시점의 기록이며 현재 코드와 차이가 있다. 교원 명부·수급·개인 시간표·학사 연계를 구현한 최신 작업 범위, 검증 및 미완료 사항은 [통합 운영 개선 보고서](WORKSPACE_INTEGRATION_20261124.md)를 기준으로 확인한다. 이 변경은 운영에 배포하지 않았다. 입학년도별 교육과정 개선은 [교육과정 결과 보고서](CURRICULUM_RELIABILITY_20261122.md)에 별도로 기록했다.

실제 DB를 사용하는 Phase 1~3의 기초 기능을 구현했습니다. 외부 연결과 인증 메일 검증이 남아 있으므로 최초 배포 전체 완료 기준은 아직 충족하지 않았습니다.

| 항목                              | 상태      | 실제 결과·남은 범위                                                                                                                                                                                       |
| --------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상단 메뉴·디자인·반응형·오류 처리 | 완료      | Next.js, TypeScript, Tailwind, shadcn/ui, Pretendard                                                                                                                                                      |
| 첫 화면 로그인·로그아웃·세션      | 완료      | 소개와 실제 로그인 통합, 중복 진입 버튼 제거, 기존 로그인·초대 링크 유지                                                                                                                                  |
| 가입·이메일 확인·비밀번호 재설정  | 부분 구현 | 코드·콜백 구현. 운영 인증 주소·실제 메일 수신 검증 필요                                                                                                                                                   |
| 프로필·기본 작업공간              | 완료      | 이름·기본 공간 저장                                                                                                                                                                                       |
| 개인 작업공간 자동 생성           | 완료      | DB 트리거·RLS 테스트                                                                                                                                                                                      |
| 학교 생성·전환·학교급             | 완료      | 초·중·고 선택, 개인 공간 학교급 변경, 저장·재로그인 검증                                                                                                                                                  |
| 구성원 초대·역할·권한 회수        | 완료      | 이메일 지정 링크, 7일 만료·재발급·철회·1회 사용. 자동 메일 발송 없음                                                                                                                                      |
| 학교 데이터 격리                  | 완료      | 익명·타 학교·조회 전용·편집자·권한 회수·RPC 검증                                                                                                                                                          |
| 학년도·학기·학년·학급             | 완료      | 두 학기와 초등 1~6/중·고 1~3학년 학급 저장, 버전 충돌 검사                                                                                                                                                |
| 대시보드                          | 완료      | 실제 학급·일정·편성안·구성원·최근 작업                                                                                                                                                                    |
| 일정 CRUD·달력                    | 완료      | 날짜·유형·대상 학년·부서·설명                                                                                                                                                                             |
| 월중·주간 업무계획·인쇄           | 완료      | 학교 행사 연동 + 별도 부서 업무·출장·당직·협의사항, 부서 목록 설정                                                                                                                                        |
| 교과군·과목 등록·삭제             | 완료      | 삭제 시 영향받는 편성표·시수 확인, 연결 시수 원자적 삭제, 편성표 버전 증가·충돌 차단. 이름 수정은 후속                                                                                                    |
| 입학년도별 편성표                 | 완료      | 초등 6개년/12학기, 중·고 3개년/6학기, 키보드·붙여넣기·합계·저장                                                                                                                                           |
| 시수 저장·운영 학년도 연결        | 완료      | 버전 충돌 차단·재로그인 유지·Y-G+1 매핑                                                                                                                                                                   |
| 법정 기준·창체 세부·학교자율시간  | 미구현    | 확인되지 않은 법정 기준 사용 안 함                                                                                                                                                                        |
| 수업·평가 계획·검토·출력          | 구현      | 다중 학급·성취기준·평가·루브릭·권한·DB 저장·복원·편성/학사 연동. TEACHING_MODULE.md 참고                                                                                                                  |
| 교원 수급·시간표                  | 미구현    | 예정 표시, 후속 단계                                                                                                                                                                                      |
| 연간 학사일정 이관                | 구현      | 초기 화면의 연간·학기별 수업일수, 3월~다음 2월 연간표·월별 수업일수, 방학 수정·중복 검사, 날짜/기간 수정·휴업·요일 교체·교시·반복 활동·제외일·학년별 행사 영역·집계                                       |
| 학사일정 Excel·백업·이력          | 구현      | 교시 행사 가져오기, 학사일·시수·주별 집계·활동·업무 내보내기, JSON 백업·복원, 이전 30개 저장본                                                                                                            |
| 학년도 복사·Google Calendar       | 미구현    | 별도 OAuth 연결·동기화 필요                                                                                                                                                                               |
| Supabase DB·마이그레이션          | 완료      | 서울 리전, 저장소의 버전별 마이그레이션 적용                                                                                                                                                              |
| Vitest·Playwright·SQL·빌드        | 완료      | TESTING.md 참고                                                                                                                                                                                           |
| GitHub 업로드·Private 전환        | 미완료    | 승인받았으나 토큰 403. 로컬 개발·배포 계속 승인                                                                                                                                                           |
| Vercel 배포·운영 접속             | 완료      | https://eduplan-silk.vercel.app · READY, HTTP 200, 전체 E2E 통과. 기존 접근 보호 유지                                                                                                                     |
| 기존 학사일정 프로그램 검토       | 완료      | 기능 분석·화면/내보내기 계산 차이 재현, LEGACY_ACADEMIC_REVIEW.md 참고                                                                                                                                    |
| 공휴일·나이스·기상청              | 운영 확인 | 서버 전용 키 저장, 나이스 정상 응답. 운영 서버에서 공휴일 학년도 전체 23일(다음 해 1~2월 5일 포함) 가져오기·저장·재조회, 기상청 단기/중기 육상/기온 모두 00·실제 예보 표시. 개발 환경 경유 요청은 코드 10 |

## 다음 단계

1. Supabase 인증 URL·SMTP 설정과 실제 가입·복구 메일 검증.
2. GitHub 권한 복구 후 main 업로드 및 승인된 Private 전환.
3. 연간 학사일정 사용자 피드백 반영, 공휴일·기상청 운영 데이터 활용과 학교 위치 설정 보완.
4. 별도 월중·주간계획 프로그램 검토와 동일 원본 연결.
5. 총론 기반 편제 초안 구현 완료. 세부 과목 배분·교육청 지침과 법정 기준 판정은 후속 검토.
6. 교육과정 시수와 구분되는 개설 수업·교사 담당 시수 위에 교원 수급·시간표 구현.

## 2026-11-09 사용자 피드백 반영

- 총론 기반 초·중·고 편제 초안, 출처·시행일·시수/학점 구분. 자세한 범위는 CURRICULUM_DRAFT.md.
- 학기 기간을 학사운영으로 이동. 여름방학 전후 날짜 맞춤, 수업일수 즉시 재집계.
- 연간 기본안 월별 달력 선택 제거, 긴 공휴일명 모바일 열 너비 고정.
- 행사 교육활동 영역과 등록 행사→교시 배정 연결.
- 주간 6열 카드·미니달력·공지, 월중 7열 달력/목록, 날짜별 업무·출장 입력, 선택적 당직 표시 및 기록 보존.

## 2026-11-10 수업·평가

상단 수업·평가 메뉴 활성화. 교수학습계획, 사용자 등록 성취기준, 학기별 평가와 루브릭, 검토·A4 출력, 버전 이력/복원, 비공개/학교 공유, 편성 시수·학사 참고 및 명시적 변경 반영을 추가했다. 운영 소스 `001b9ce`, 상세 범위는 TEACHING_MODULE.md에 기록했다.

### School submission reports (2026-11-11)

Implemented the supplied HWPX structure as a reusable school report format: weekly teaching columns, evaluation policies/achievement levels and performance detail; editable HWPX download for combined or separate documents; per-plan format snapshots and validated JSON format transfer. Existing document/history JSON remains backward compatible. Local production E2E, independent OWPML/package checks and transactional database regression checks passed. Native Hancom rendering remains unverified.

Released to production at https://eduplan-silk.vercel.app (deployment `dpl_MxSTE17SPTH3auguCLgACusFRkHA`, source `2908e3a`). Production browser flows and downloaded HWPX validation passed. Test fixtures were removed; runtime error/fatal scan was clean.

## 2026-11-11 teaching authoring update

Implemented the supplied school plan's authoring relationships: weekly lesson ↔ assessment links with preparation/execution/feedback roles; student task and evidence; actual task stages supporting multiple rubric criteria; criterion ↔ achievement standard and evidence; separate rating levels. A review map links back to editable lessons/tasks. Weekly school-calendar drafts leave actual subject hours blank, and weekly hours are edited in lesson operating settings. School-wide policy templates and verified official standard ingestion remain outside this update.

Existing documents/history are preserved. Task-only copy remaps nested IDs and does not assign existing lessons; whole-plan copy and history restore preserve internal links. Deleting a stage/task cleans references without deleting other authored content. Supabase migration `20261111140434` adds optional fields plus database reference validation. Unit and transactional database checks passed; release verification details are in TESTING.md and DEPLOYMENT.md.
