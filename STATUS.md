# EduPlan 개발 현황

| 항목 | 2026-11-16 확인 |
|---|---|
| 개발 버전 | `0.2.0-recovery.2` |
| 운영 배포 | `eduplan-silk.vercel.app` · `dpl_BJrGMgmx6AMHcKF22ccKxywc5vM2` |
| GitHub | `recovery/eduplan-integration`에 복구 기준 보존. `develop`에서 통합 개발 |
| 테스트 DB | 별도 `eduplan-acceptance`에 마이그레이션 19개 적용. Vercel Preview 전용 연결 |
| 자동 검증 | 단위 테스트 85개, Workspace 테스트 162개, 격리된 Supabase SQL 테스트 파일 7개 통과. TypeScript, ESLint, Next.js 빌드 통과 |

## 구현된 기능

- 연간 학사력과 행사, 교육과정 목표, 교수학습계획 주차 비고 연계
- 요일별 운영 교시, 날짜별 학년 예외, 행사 교시의 학급 예외 및 학급별 시수 집계·통합 Excel
- 학사일정의 동시 저장 비교, 날짜별 변경 조회·복원, 확정본 기준정보 보존
- 학교 공유 수업의 공동작성 담당자 지정, 교수학습·평가 선택 복사, 학교 공유 계획의 월별 평가 집계
- 기존 교육과정·월중·주간계획·교수학습·평가·개별 HWPX 기능 보존
- 작업공간 설정의 버전, 빌드 시각, Git SHA, 배포 환경 표시

## 남은 작업

- 기존 Playwright 전체 시나리오의 브라우저 검증. 이번 실행은 Chromium의 소켓 생성 제한으로 시작 단계에서 멈췄습니다.
- 시간표 자동편성, 교원 관리, 학교별 서식, 기숙사 일지 등 이전 Workspace 모듈의 인증형 통합 및 브라우저 저장 자료 이관
- 교수학습·평가의 셀 단위 실시간 편집, 학교 취합 출력, 공식 성취기준 전수 확인, 한컴 원본 대조
- 운영 공휴일 API 및 가입·재설정 메일의 실제 수신 검증, 운영 전환 승인 및 배포

[초기 복구와 버전 비교](docs/RECOVERY.md) · [개발 및 배포](DEPLOYMENT.md)
