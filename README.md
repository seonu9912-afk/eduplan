# EduPlan · 에듀플랜

**교육과정부터 수업까지, 하나의 계획으로.**

운영 주소: https://eduplan-silk.vercel.app

대한민국 초·중·고등학교의 개인·학교 작업공간, 학사일정, 입학년도별 교육과정 편성표를 연결하는 Next.js + Supabase 서비스입니다. 초등학교는 6개년, 중·고등학교는 3개년을 지원합니다. 상단 메뉴형 반응형 화면과 실제 DB 저장·조회 기능을 제공합니다.

- [복구와 통합 현황](STATUS.md)
- [버전별 비교와 인수 검증](docs/RECOVERY.md)
- [개발 및 배포](DEPLOYMENT.md)
- [복구 전 운영판 구현 현황](docs/STATUS.md)
- [데이터 구조와 권한](docs/ARCHITECTURE.md)
- [배포·인증 설정](docs/DEPLOYMENT.md)
- [테스트 결과와 재현 방법](docs/TESTING.md)
- [수업·평가 모듈과 사용 흐름](docs/TEACHING_MODULE.md)
- [기존 학사일정 프로그램 검토](docs/LEGACY_ACADEMIC_REVIEW.md)

## 실행

Node.js 24 LTS와 npm이 필요합니다.

```bash
npm ci
cp .env.example .env.local
# Supabase URL, publishable key, 현재 서비스 주소 입력
npm run dev
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

서비스 역할 키를 앱에 설정하지 않습니다. 실제 환경변수, 인증 정보, 테스트 계정은 Git에서 제외됩니다.

## 데이터베이스

전용 Supabase 프로젝트의 빈 DB에 `supabase/migrations/`를 이름 순서대로 적용합니다. 기존 EduPlan 프로젝트에는 이미 적용되어 있으므로 다시 실행하지 않습니다. 연결 전에 대상 project ref를 확인하세요.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

이메일 Auth와 이메일 확인을 사용합니다. 운영 배포 전 Site URL, Redirect URLs 및 실제 인증 이메일 전달을 [배포 안내](docs/DEPLOYMENT.md)에 따라 확인해야 합니다.

## 사용 흐름

1. 첫 화면에서 바로 로그인합니다. 회원가입은 별도 화면에서 진행하며, 이메일 확인 후 로그인합니다. 개인 작업공간은 가입 시 자동 생성됩니다.
2. 상단 ‘학교 만들기’에서 학교급을 선택해 학교를 개설합니다. 개설은 공식 재직 인증을 의미하지 않습니다.
3. 설정에서 학교급, 학년도, 학년별 학급 수를 저장합니다. 학기 날짜는 학사운영에서 조정합니다. 초등학교는 1~6학년, 중·고등학교는 1~3학년입니다. 개인 작업공간도 학교급을 바꿀 수 있습니다.
4. 학사운영에서 3월~다음 해 2월의 연간 기본안을 편성합니다. 방학·휴업·요일 교체, 학년별 교시, 반복 창체·제외일, 행사 교시를 정하고 연간 계획을 저장합니다. 수업일수·시수 점검, Excel 출력, 백업·복원을 제공합니다.
5. 학교업무의 월중·주간계획에서 학사일정을 확인하고 부서별 업무·출장·당직·협의사항을 추가합니다. 업무 자료는 학사일정과 별도로 편집합니다.
6. 교육과정에서 교과군·과목과 입학년도별 편성표를 만듭니다. 초등학교는 열두 학기, 중·고등학교는 여섯 학기 시수를 입력하거나 엑셀 셀을 붙여넣고 저장합니다.
7. 수업·평가에서 담당 수업과 여러 학급을 연결하고 교수학습계획·평가계획·채점기준을 작성합니다. 편성 시수·학사일정을 참고하며 검토·인쇄·이력 복원을 제공합니다.
8. 구성원에서 이메일과 역할을 지정해 초대 링크를 만들고 직접 전달합니다. 링크는 7일간 유효하며 재발급·철회할 수 있습니다.

관리자는 설정·구성원·편집, 편집자는 일정·교육과정 편집, 조회 전용 사용자는 열람할 수 있습니다. 접근 권한은 PostgreSQL RLS에서도 검증합니다.

## 검증 및 프로덕션 실행

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run start
```

Playwright와 RLS 통합 테스트에는 가상 계정 준비가 필요합니다. [TESTING.md](docs/TESTING.md)를 참고하세요.

## 범위

Phase 1~3의 기초 기능을 구현했습니다. 교원 수급, 시간표, 학생별 평가, 법정 시수 판정, Google Calendar 연동은 후속 단계입니다. 교시 행사 Excel 가져오기와 연간 학사일·시수 보고서 내보내기를 지원합니다. 교시 없는 행사는 웹에서 등록합니다. 시수의 정수·범위 검사와 합계를 제공하지만 법정 기준 충족 여부로 표시하지 않습니다. 학생 성적·상담·의료 정보를 수집하지 않습니다.

GitHub 연결의 쓰기 요청은 HTTP 403을 받았습니다. 복구 브랜치와 개발 브랜치의 이력은 동봉한 Git bundle에 있습니다. 검증용 Preview는 해당 소스 커밋에서 직접 빌드했습니다.

공공 API의 실제 요청·오류와 연결 상태는 [진단 기록](docs/PUBLIC_API_DIAGNOSTIC.md)을 참고하세요. 사용자가 제공한 교육과정 총론에 따른 초·중·고 편제 초안의 범위는 [CURRICULUM_DRAFT.md](docs/CURRICULUM_DRAFT.md)를 참고하세요.
