# 수업·평가 모듈 구현 기록

> 사용자 정정 반영: HWPX 제공의 핵심 목적은 실제 교수학습·평가 계획의 내용과 작성 논리를 분석하는 것이다. 주차별 수업과 평가과제의 준비·실시·피드백 연결, 실제 과제 진행 단계와 채점수준 구분을 추가했다. 최신 설계 기준과 남은 범위는 [첨부 운영계획 내용 분석](TEACHING_AUTHORING_ANALYSIS.md)에 기록한다. 출력보다 교사의 설계와 연결 검토를 우선한다.

요청: 2026-11-09 사용자가 첨부한 수업·평가 모듈 개발 지시서 전체. 기존 EduPlan에 실제 저장/권한/출력/연동 기능 추가.

## 확인 및 설계

- GitHub seonu9912-afk/eduplan은 조회 가능하나 size 0, public. 기존 업로드 403과 사용자의 로컬 개발·직접 배포 선택을 유지한다. 실제 최신 코드는 로컬 f608a00 이후 및 Vercel 배포에 있음.
- 기존 public 테이블 15개 모두 RLS 사용. 담당 수업/수업·평가 계획 테이블이나 활성 라우트는 없음. 기존 teaching 메뉴는 비활성 상태.
- 작업공간, 학년도/학기, 과목, 학급, 프로필 및 역할을 재사용한다.
- 수업은 1학기/2학기/연간 단위. 연간 교수학습계획은 하나의 단원 목록, 평가계획은 1·2학기를 각각 관리한다.
- 나만 보기: 소유자만 열람/편집. 학교 공유: 같은 공간 구성원 열람, 소유자/학교 관리자 편집. viewer는 생성/편집 불가. 개인 공간은 기존 단독 멤버 정책 유지.
- 새 테이블: teaching_courses, teaching_course_classes, achievement_standards, teaching_plans, teaching_standard_links, teaching_plan_versions.
- 단원/평가/루브릭은 제한된 JSON 문서로 원자적 저장하며 성취기준 연결은 FK가 있는 관계 테이블로 함께 저장. 수업/학급/성취기준의 workspace·year 범위와 CAS 버전을 DB RPC에서 검사한다.
- 성취기준은 사용자 직접 등록 자료로 표시. 공식 자료/학생별 성적/실제 시간표/학교 결재 연동을 가장하지 않는다.
- 단계: 기본 저장/권한 검증 → 루브릭/검토/출력/이력 → 편성·학사 변경 영향/복사 및 운영 검증.

## 사용 흐름

1. 로그인 후 상단 **수업·평가**를 선택한다. 주소는 `/app/{workspaceId}/teaching?year=2026`이다.
2. **새 수업 설정**에서 학년·학기(또는 연간), 기존/직접 등록 과목, 담당교사와 여러 학급을 지정한다. 기존 편성 시수가 있으면 재사용하고, 없으면 기준 차시를 직접 입력한다.
3. **교수학습계획** 표에서 단원·시기·내용·성취기준·차시 등을 편집한다. 행 추가/복제/이동/삭제와 Tab 이동을 지원한다. 차시 칸의 Enter는 다음 행으로 이동한다.
4. **평가계획**에서 평가 항목과 요소별 채점기준을 작성한다. 수행평가 100%, 정기시험 혼합, 비율 없는 자유학기 평가를 지원한다. 연간 수업의 평가는 1·2학기를 별도로 저장한다.
5. **검토·출력**에서 오류/확인 필요/정상을 확인하고 교수학습계획표와 평가계획서를 각각 A4 가로로 인쇄하거나 브라우저 PDF로 저장한다.

탭을 바꿔도 필터와 작성 내용을 유지한다. 미저장 이동은 확인하고 저장 실패 시 내용을 남긴다. 다른 탭에서 먼저 저장한 경우 이전 버전의 덮어쓰기를 거절한다. 저장 중에는 편집을 잠그고, 서버 재조회가 미저장 내용을 덮어쓰지 않도록 처리한다.

## 저장 구조와 보존

| 테이블                    | 저장하는 정보                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `teaching_courses`        | 기존 workspace/year/subject, 소유자, 공개 범위, 학년·학기, 기준 차시, 참고 원본 버전, 보관 상태, 저장 버전 |
| `teaching_course_classes` | 기존 classes와 공통 계획 연결. 작업공간·학년도·학년 복합 외래키                                            |
| `achievement_standards`   | 교육과정 버전·학교급·과목·학년군·코드·내용·등록 출처                                                       |
| `teaching_plans`          | 단원, 학기별 평가, 가변 단계 루브릭을 검증된 JSON 문서로 원자적 저장                                       |
| `teaching_standard_links` | 단원/평가와 성취기준의 복합 외래키 연결                                                                    |
| `teaching_plan_versions`  | 변경 전후 모든 저장 버전, 작성자·시각·동작, 당시 수업 설정 및 계획                                         |

- 기존 15개 테이블의 자료를 초기화하지 않았다. `classes`에 범위 검증용 유일 제약만 추가했다.
- 여섯 테이블 모두 RLS를 적용했다. 임의 직접 UPDATE 대신 권한·범위·JSON 구조·버전을 검사하는 RPC로 저장한다.
- 수업 보관/해제는 내용을 삭제하지 않는다. 최신 50개 이력을 화면에서 조회하고 이전 계획 내용을 새 버전의 작성 중 상태로 복원한다. DB에는 50개 이전 이력도 보존한다.
- 성취기준은 등록 후 불변 참조이다. 현재 정정/삭제 UI는 없으며 잘못 등록한 기준은 새 코드로 등록 후 연결을 바꾼다.
- 과목을 삭제해도 수업의 과목명·작성 계획·이력·기존 기준 차시는 보존한다. 이후 수동 기준으로 수정할 수 있다.
- 연결된 학급 삭제는 DB에서 거절한다. 수업 설정에서 연결을 해제한 뒤 학급 수를 줄인다. 작업공간 전체 삭제 시에는 연결 자료가 함께 정리되도록 학급·성취기준 FK를 트랜잭션 종료 시 검증한다. 개별 참조 삭제가 허용되는 것은 아니다.
- 수업 설정의 학년도·학년·학기·연결 과목을 바꾸려면 새 수업에 계획을 복사한다. 복사는 같은 작업공간과 같은 기간 유형에서 가능하며 원본의 날짜·내용을 보존하고 상태를 작성 중으로 초기화한다.

## 실제 연결 범위

- 편성표: `학년도 - 학년 + 1` 입학년도에 해당하는 과목·학기 시수를 참조한다. 고등학교 편성 단위가 학점이면 1학점=16회 기준 환산을 명시한다.
- 학사운영: 현재 학기 경계, 학교 수업일수, 방학·공휴일·휴업일·행사를 참고 영역에서 보여 준다. 해당 과목의 실제 날짜별 차시로 표현하지 않는다.
- 편성·학사 원본의 버전 변화는 **원본 변경 확인 필요**로 안내한다. 사용자가 기준 갱신을 확인해야 반영하며 작성한 단원·평가·배당 차시는 변경하지 않는다.
- 성취기준은 교사가 확인한 원문을 직접 등록한다. 공식 성취기준 데이터 수집/자동 생성은 하지 않았다.
- 학급별 실제 운영/학생 점수/고급 루브릭 도구/공식 심의·결재/Excel 및 학교별 출력 서식은 후속 범위다. 우선순위는 공식 성취기준 검증·가져오기 → 학교별 서식 → 시간표 기반 실제 차시 연동이다.

## 검증

- TypeScript, ESLint, 프로덕션 빌드 통과. 단위 테스트 55개(수업·평가 신규 12개) 통과.
- `supabase/tests/teaching.sql`: 실제 DB에서 다중 학급, 비공개/공유 권한, 관리자·편집자·조회 전용·외부 사용자, 교차 학년도/학교 FK, 직접 쓰기 차단, CAS, 확정 수정, 복원, 보관, 복사, 편성 변경 확인, 과목 삭제 후 내용 보존을 검증하고 rollback.
- 브라우저 기본 저장/재로그인·평가 운영 방식·복원·복사·PDF·390px 시나리오 통과. 기존 7개 회귀와 신규 연동/충돌/격리 시나리오도 통과했다. 최종 배포 결과는 TESTING.md에 기록한다.
- Security Advisor: 새 RLS/함수 보안 경고 없음. 기존 [유출 비밀번호 차단 비활성화](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) Auth 경고 1건은 유지된다.


## School submission format and HWPX (2026-11-11)

The supplied school HWPX establishes a baseline, not a universal statutory form. Its weekly teaching table and assessment sections are now represented as structured editable data. School/teacher names, policies and the source file's achievement standards are not silently imported or seeded into other workspaces. In particular, source codes may refer to different curriculum revisions and require human review.

- Weekly month/week/day, assessment methods, weekly hours; separate evaluation purpose, direction, policy and absence/transfer handling.
- Variable achievement-rate bands, semester levels, assessment-specific standard levels, competencies, methods and lesson counts; existing rubric minimum scores are calculated only when complete.
- Each plan stores a format snapshot: titles, column order/labels/relative widths/visibility, evaluation section order/titles/visibility, orientations and end note. JSON format export/import contains only these settings; normal course copying also reuses the snapshot. Changing one plan never changes previously saved plans. This does not auto-import arbitrary school HWPX layouts.
- Both HTML print and HWPX consume the same report model. HWPX contains real OWPML paragraphs and tables, separate landscape/portrait sections, repeated table headers and full achievement/rubric text. Weighted-only score fields are omitted for descriptive evaluation. Long assessment summaries are split into groups of four columns. Existing legacy plans and historical snapshots remain valid.
- HWPX is generated locally in the browser by dynamically loaded JSZip; there is no document upload to a conversion service. The package is validated independently with python-hwpx 6.11.0 (developer tooling only). Actual Hancom application opening is not available in this Linux environment; schema/package validation does not certify identical Hancom pagination.

### HWPX implementation resources

`src/lib/hwpx-resources.json` contains only blank/default OWPML resources, generated from `HwpxDocument.new()` in [python-hwpx 6.11.0](https://github.com/airmang/python-hwpx) (Apache-2.0), with dedicated report paragraph/character/border styles appended. It contains no original school document, student/teacher content, embedded images or source document metadata. The library is used for independent validation, not bundled or called by production. `scripts/validate-teaching-hwpx.py` checks both OWPML and package integrity.

## 작성 흐름 보완 (2026-11-11)

교수학습계획에서 주차별 수업을 쓰거나 **학사일정으로 주차 초안**을 추가한다. 학교 수업일/휴업일은 참고값이며 실제 과목 차시는 교사가 입력한다. **평가과제 연결**에서 준비·실시·피드백 역할과 진행 단계를 선택하고, 연결 칩으로 평가 설계 화면에 이동한다. 평가 화면에서도 수업을 연결할 수 있다.

평가는 학생의 수행 과제와 확인할 증거부터 구체화한다. 독서→활동지→프로젝트와 같은 실제 단계에 여러 채점 요소를 배치하고 각 요소의 성취기준·증거·평정수준별 판단 기준을 작성한다. 공통 평가 운영 기준은 별도로 펼쳐 편집한다. **검토·출력**의 첫 패널에서 수업·기준·채점 요소·증거를 연결해 살펴본다.

Migration `20261111140434_teaching_authoring_connections`는 새 선택 필드 및 문서 내 참조 검사를 추가한다. 기존 JSON·이력은 수정하지 않는다. 잘못된 과제/단계 참조, 중복 연결, 과제에 포함되지 않은 기준 참조는 서버와 DB에서 거절한다. 확정된 평가에 연결된 수업 내용을 변경하면 평가 상태도 작성 중으로 돌아간다. 수업/과제의 삭제·단계 삭제는 관련 연결을 정리하고 나머지 작성 내용은 보존한다. 복사 및 복원 방식은 분석 문서 6절 참조.
