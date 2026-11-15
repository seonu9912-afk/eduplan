"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, InlineNotice, useMutation } from "@/components/common";
import { saveSemesters } from "@/app/actions";
import { monthRange } from "@/lib/domain";
import { effectiveAcademicTerms, type AnnualPlan } from "@/lib/academic";
import type { Context } from "@/lib/models";
export function SemesterSettings({
  context: c,
  plan,
}: {
  context: Context;
  plan: AnnualPlan;
}) {
  const y = c.year!,
    m = useMutation();
  const [terms, setTerms] = useState(
    [1, 2].map((n) => ({
      start_date:
        c.semesters.find((t) => t.number === n)?.start_date ??
        `${y.year}-03-01`,
      end_date:
        c.semesters.find((t) => t.number === n)?.end_date ??
        monthRange(`${y.year + 1}-02`).end,
    })),
  );
  const effective = effectiveAcademicTerms(y.year, plan, c.semesters);
  const automaticStart = effective !== c.semesters
    ? effective.find((term) => term.number === 2)?.start_date
    : null;
  return (
    <details className="panel vacation-settings no-print">
      <summary>
        학기 설정{" "}
        <span>
          1학기 {terms[0].start_date} ~ {terms[0].end_date} · 2학기{" "}
          {terms[1].start_date} ~ {terms[1].end_date}
        </span>
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.execute(
            () =>
              saveSemesters({
                target: c.workspace.id,
                school_year: y.year,
                expected_version: y.version,
                terms,
                class_counts: c.grades.map(() => 0),
              }),
            undefined,
            "학기 기간을 저장했습니다.",
          );
        }}
      >
        <p className="muted">
          학기와 방학 기간을 함께 확인하세요. 학기 밖 날짜는 수업일수에서
          제외됩니다.
        </p>
        <fieldset disabled={c.role !== "admin" || m.pending}>
          {terms.map((t, i) => (
            <div className="term-row" key={i}>
              <strong>{i + 1}학기</strong>
              {(["start_date", "end_date"] as const).map((k, j) => (
                <Field
                  key={k}
                  label={`${i + 1}학기 ${j === 0 ? "시작일" : "종료일"}`}
                  id={`term-${j === 0 ? "start" : "end"}-${i + 1}`}
                >
                  <input
                    id={`term-${j === 0 ? "start" : "end"}-${i + 1}`}
                    type="date"
                    min={`${y.year}-03-01`}
                    max={monthRange(`${y.year + 1}-02`).end}
                    value={t[k]}
                    required
                    onChange={(e) =>
                      setTerms(
                        terms.map((a, n) =>
                          n === i ? { ...a, [k]: e.target.value } : a,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
            </div>
          ))}
          {automaticStart && (
            <Button type="button" variant="outline" onClick={() => setTerms(
              effective.map((term) => ({ start_date: term.start_date, end_date: term.end_date })))}>
              자동 산정한 2학기 시작일 적용 ({automaticStart})
            </Button>
          )}
          {c.role !== "viewer" && (
            <Button disabled={m.pending}>학기 기간 저장</Button>
          )}
        </fieldset>
        <InlineNotice mutation={m} />
      </form>
    </details>
  );
}
