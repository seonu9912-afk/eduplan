"use client";
import { Disclosure } from "@/components/ui/disclosure";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  GraduationCap,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  Field,
  InlineNotice,
  SubmitButton,
  useMutation,
} from "@/components/common";
import { saveYear, setSchoolType } from "@/app/actions";
import {
  monthRange,
  schoolTypes,
} from "@/lib/domain";
import type { Context } from "@/lib/models";
import { buildInfo } from "@/lib/build-info";
export function SchoolSettings({ context: c }: { context: Context }) {
  const editable = c.role === "admin";
  if (!c.year) return null;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>작업공간 설정</h1>
        </div>
      </div>
      <div className="settings-layout">
        <div className="settings-main">
          <div className="panel settings-intro">
            <div className="tile-icon">
              <GraduationCap />
            </div>
            <div>
              <h2>{c.workspace.name}</h2>
              <p>{c.schoolType}</p>
            </div>
            <span className="scope-tag">
              {c.role === "admin" ? "관리자" : "조회 전용"}
            </span>
          </div>
          <SchoolTypeForm key={c.schoolType} context={c} />
          <YearForm
            key={`${c.year.id}-${c.schoolType}`}
            context={c}
            year={c.year.year}
            editable={editable}
          />
        </div>
        <aside className="settings-help panel">
          <span className="tile-icon">
            <ShieldCheck />
          </span>
          <h3>학교 운영의 공통 기준</h3>
          <p>
            여기에서 설정한 학년도는 학사일정과 교육과정 화면에서 함께
            사용합니다.
          </p>
          <ul>
            <li>학년도는 3월부터 다음 해 2월까지입니다.</li>
            <li>1·2학기 기간과 방학은 학사운영에서 설정합니다.</li>
            <li>학급 수는 학년별로 입력합니다.</li>
            <li>설정 변경은 관리자만 가능합니다.</li>
          </ul>
          {editable && <Disclosure className="info-box" compact label="버전 및 배포 정보">
            <dl className="build-info">
              <dt>버전</dt><dd>{buildInfo.version}</dd>
              <dt>환경</dt><dd>{buildInfo.deployment === "production" ? "Production" : buildInfo.deployment === "preview" ? "Preview" : "Development"}</dd>
              <dt>배포 빌드 시각</dt><dd>{buildInfo.builtAt ? new Intl.DateTimeFormat("ko-KR", {
                dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Seoul",
              }).format(new Date(buildInfo.builtAt)) : "개발 실행"}</dd>
              <dt>Git 커밋</dt><dd>{buildInfo.commit ? <code title={buildInfo.commit}>{buildInfo.commit.slice(0, 12)}</code> : "제공되지 않음"}</dd>
              {buildInfo.id && <><dt>Vercel 배포 ID</dt><dd><code>{buildInfo.id}</code></dd></>}
            </dl>
          </Disclosure>}
          <div className="info-box">
            학생 이름이나 성적 등 민감한 개인정보는 입력하지 않습니다.
          </div>
        </aside>
      </div>
    </>
  );
}
function YearForm({
  context: c,
  year,
  editable,
}: {
  context: Context;
  year: number;
  editable: boolean;
}) {
  const m = useMutation();
  const router = useRouter();
  const term = (n: number) => c.semesters.find((s) => s.number === n);
  const defaults = [
    { start_date: `${year}-03-01`, end_date: `${year}-07-20` },
    { start_date: `${year}-08-17`, end_date: monthRange(`${year + 1}-02`).end },
  ];
  return (
    <form
      className="panel settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(
          () =>
            saveYear({
              target: c.workspace.id,
              school_year: year,
              expected_version: c.year!.version,
              terms: [1, 2].map((n) => ({
                start_date: term(n)?.start_date ?? defaults[n - 1].start_date,
                end_date: term(n)?.end_date ?? defaults[n - 1].end_date,
              })),
              class_counts: c.grades.map((n) => Number(f.get(`classes-${n}`))),
            }),
          () => router.push(`/app/${c.workspace.id}/settings?year=${year}`),
        );
      }}
    >
      <fieldset disabled={!editable || m.pending}>
        <div className="settings-section">
          <div className="section-label">
            <CalendarDays size={20} />
            <h2>{year}학년도</h2>
          </div>
          <p className="muted">
            학년도는 3월 1일부터 다음 해 2월 말까지입니다. 학기 기간과 방학은
            학사운영에서 조정하세요.
          </p>
          <Link
              className="text-link"
              href={`/app/${c.workspace.id}/calendar?year=${year}`}
            >
              학사운영에서 학기 설정하기 →
          </Link>
        </div>
        <div className="settings-section">
          <div className="section-label">
            <GraduationCap size={20} />
            <h2>학년·학급 구성</h2>
          </div>
          <p className="muted">
            학년별 학급 수를 입력하면 학급이 자동으로 구성됩니다.
          </p>
          <div className="class-counts">
            {c.grades.map((n) => (
              <Field key={n} label={`${n}학년 학급 수`} id={`class-count-${n}`}>
                <div className="unit-input">
                  <input
                    id={`class-count-${n}`}
                    name={`classes-${n}`}
                    type="number"
                    min={0}
                    max={30}
                    defaultValue={c.classes.filter((x) => x.grade === n).length}
                    required
                  />
                  <span>학급</span>
                </div>
              </Field>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="settings-save">
        <InlineNotice mutation={m} />
        {editable ? (
          <SubmitButton pending={m.pending}>
            <Save />
            학년도 설정 저장
          </SubmitButton>
        ) : (
          <p className="muted">관리자에게 설정 변경을 요청해 주세요.</p>
        )}
      </div>
    </form>
  );
}

function SchoolTypeForm({ context: c }: { context: Context }) {
  const m = useMutation();
  return (
    <form
      className="panel school-type-settings"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(() =>
          setSchoolType(c.workspace.id, String(f.get("school_type"))),
        );
      }}
    >
      <Field
        label="학교급"
        id="settings-school-type"
        hint="초등학교는 1~6학년, 중·고등학교는 1~3학년으로 구성됩니다."
      >
        <select
          id="settings-school-type"
          name="school_type"
          defaultValue={c.schoolType}
          disabled={c.role !== "admin" || m.pending}
        >
          {schoolTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </Field>
      <InlineNotice mutation={m} />
      {c.role === "admin" ? (
        <SubmitButton pending={m.pending}>학교급 저장</SubmitButton>
      ) : null}
    </form>
  );
}
