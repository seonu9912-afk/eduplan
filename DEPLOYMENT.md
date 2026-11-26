# EduPlan 개발 및 배포

## 브랜치와 운영 주소

- `recovery/eduplan-integration`에서 복구 기준과 기능 통합의 변경 이력을 확인합니다.
- `develop`은 다음 개발과 Preview 빌드에 사용합니다. 기능별 브랜치에서 검증한 뒤 합칩니다.
- `main`은 운영 배포용입니다. Git 연결과 인증된 인수 검증을 마치고 운영 반영 승인을 받은 뒤 배포합니다.
- 기존 Workspace Preview와 Prototype 프로젝트의 배포 이력은 비교·복구에 사용할 수 있습니다.
- 공식 운영 주소는 [eduplan-silk.vercel.app](https://eduplan-silk.vercel.app)입니다.

## 복구 Git 이력 가져오기

압축 파일 안의 `eduplan-recovery.bundle`에서 브랜치 이력을 복원할 수 있습니다. 저장소에 쓰기 권한이 있는 Git 인증을 사용합니다.

```bash
git clone --branch recovery/eduplan-integration eduplan-recovery.bundle eduplan
cd eduplan
git remote set-url origin https://github.com/seonu9912-afk/eduplan.git
git push --set-upstream origin recovery/eduplan-integration
```

## 개발과 검증

Node.js 24에서 의존성을 설치합니다. `.env.example`의 공개 URL 및 publishable key는 **격리된 개발 DB**에서 가져오고 `.env.local`에 보관합니다. 학교 공휴일·나이스 연동 값은 서버에 설정합니다.

```bash
npm ci
npm run check
npm run build
npm --prefix legacy/workspace ci
npm --prefix legacy/workspace test
```

Vercel Preview는 별도 Supabase `eduplan-acceptance`를 사용합니다. 운영 변수를 로컬 검증에 사용하지 마세요. Vercel은 `npm run check && npm run build`를 실행하며, 운영 대상으로 판정된 빌드는 `main` 출처를 요구합니다. 잠금 파일과 마이그레이션을 반영한 후 가상 계정으로 로그인, 작업공간 접근, 달력 등록·저장, 다시 접속, 수업 계획 작성, RLS, 문서 출력을 확인합니다. 별도 백엔드 없이 화면을 보려면 Preview 배포의 `/recovery-preview`에서 가상 학교의 연간 학사일정과 수업·평가를 확인합니다. 이 경로는 운영 빌드에서 404를 반환합니다.

## 운영 전환과 복원

1. `develop`의 Preview Git SHA와 테스트 결과를 대조합니다. 운영 도메인과 현재 Production 변수의 적용 범위를 확인합니다.
2. 현재 공식 배포 ID `dpl_BJrGMgmx6AMHcKF22ccKxywc5vM2`와 원본 소스 해시, Supabase 백업 지점을 기록합니다.
3. 기존 데이터 호환성과 운영 전환 영향을 보고하고 승인을 받습니다. 승인 후 운영 프로젝트에 미적용 순서대로 학사일정 확정·학급별 예외·공동작성 마이그레이션을 적용하고 `main`으로 운영을 배포합니다.
4. 운영 반영 뒤 공식 주소의 배포 ID와 로그인·읽기·권한·출력을 검증합니다. 문제가 생기면 기존 Vercel 배포를 운영 주소에 다시 연결합니다.
5. DB 복구 시 Vercel 롤백과 DB 복원을 별개의 작업으로 처리합니다. 운영의 신규·기존 기록을 확인하고 데이터가 유실될 수 있는 복구는 승인 후 진행합니다.

[기존 Vercel·인증 구성 기록](docs/DEPLOYMENT.md)

## 학교 중심 구조 전환

- 학교 소속은 기존 회원 테이블에 남고, 학년도 행은 해당 학교에서 선택한 첫 요청에 생성됩니다. 신규 계정의 기본 경로는 학교 참여·개설입니다. 기존 개인 자료는 소유자의 프로필 또는 가입 화면에서 JSON으로 내려받을 수 있습니다.
- 기존 업무별 지정 권한은 그대로 적용됩니다. 이전의 포괄 편집 역할은 업무로 자동 변환하지 않습니다. 학교 관리자는 **구성원 → 업무별 편집 권한**에서 본인을 포함한 담당자를 지정합니다.
- 학사일정과 월중·주간계획은 관리 화면에서 초안을 저장하고 적용일을 지정해 공개합니다. 기존 학사일정 확정본은 공개 이력에 포함합니다. 기존 초안은 관리 화면에서 열 수 있습니다.
- 교육과정과 학교 공유 수업·평가계획의 적용일과 변경 내용은 공개 시점에 버전과 함께 기록합니다. 적용일 전까지는 이전 공식본이 표시됩니다. 학교 구성원에게 공동작성 권한을 지정하면 해당 수업의 계획을 함께 편집할 수 있습니다.
- 전환 마이그레이션은 영향받는 원본의 사본을 `private.school_reform_backup`에 기록합니다. 인증 비밀과 초대 토큰은 제외합니다. 이 테이블은 DB 소유자만 열 수 있습니다. 전환 전후 학교·학년도·개인 공간과 계획 원본의 건수를 비교하고 검증 환경에서 학교 간 접근 및 공개·초안 분리를 확인합니다.
- 배포 전환 실패 시 통합 마이그레이션은 트랜잭션에서 롤백됩니다. 적용 이후 복구가 필요하면 당시의 앱 커밋과 DB 정책을 함께 복구합니다. 전환 이후의 저장 자료와 공개 이력을 별도 확인한 뒤 백업과 대조합니다.
