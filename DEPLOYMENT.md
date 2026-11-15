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
npm run typecheck
npm run lint
npm test
npm run build
npm --prefix legacy/workspace ci
npm --prefix legacy/workspace test
```

Preview 프로젝트에는 운영 DB 대신 별도 테스트 DB를 연결합니다. 잠금 파일과 마이그레이션을 반영한 후 가상 계정으로 로그인, 작업공간 접근, 달력 등록·저장, 다시 접속, 수업 계획 작성, RLS, 문서 출력을 확인합니다. 별도 백엔드 없이 화면을 보려면 Preview 배포의 `/recovery-preview`에서 가상 학교의 연간 학사일정과 수업·평가를 확인합니다. 이 경로는 운영 빌드에서 404를 반환합니다.

## 운영 전환과 복원

1. GitHub의 검증된 브랜치와 Vercel을 연결하고 운영 도메인과 기존 환경변수 적용 범위를 점검합니다.
2. 현재 공식 배포 ID `dpl_BJrGMgmx6AMHcKF22ccKxywc5vM2`와 원본 소스 해시, Supabase 백업 지점을 기록합니다.
3. 기존 데이터 호환성과 운영 전환 영향을 보고하고 승인을 받습니다. 신규 마이그레이션은 격리 검증 결과로 확인합니다.
4. 운영 반영 뒤 공식 주소의 배포 ID와 로그인·읽기·권한·출력을 검증합니다. 문제가 생기면 기존 Vercel 배포를 운영 주소에 다시 연결합니다.
5. DB 복구 시 Vercel 롤백과 DB 복원을 별개의 작업으로 처리합니다. 운영의 신규·기존 기록을 확인하고 데이터가 유실될 수 있는 복구는 승인 후 진행합니다.

[기존 Vercel·인증 구성 기록](docs/DEPLOYMENT.md)
