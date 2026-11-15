"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMutation, InlineNotice } from "@/components/common";
import { curriculumDraft, curriculumSource } from "@/lib/curriculum-draft";
import { createCurriculumDraft } from "@/app/actions";
import type { Context } from "@/lib/models";
export function CurriculumDraft({
  context: c,
  onCreated,
}: {
  context: Context;
  onCreated: (year: number) => void;
}) {
  const [vocational, setVocational] = useState(false),
    [year, setYear] = useState(
      Math.max(
        c.year?.year ?? 2026,
        c.schoolType === "초등학교"
          ? 2028
          : c.schoolType === "고등학교"
            ? 2026
            : 2025,
      ),
    );
  const d = curriculumDraft(c.schoolType, vocational),
    m = useMutation();
  return (
    <section className="annual-section">
      <h2>총론 기반 편제 초안</h2>
      <p>
        {curriculumSource} · 본문 {d.page}쪽 · 단위: {d.unit}
      </p>
      <div className="info-box">
        교과군 기준량을 학기에 나눈 출발안입니다. 과목별
        배분·집중이수·학교자율시간·자유학기·창체 영역·교육청 지침을 검토한 최종
        편성표는 아닙니다. 기존 편성표는 덮어쓰지 않습니다.
      </div>
      {c.schoolType === "초등학교" && (
        <p>
          건강한 생활을 포함한 1~2학년 배당표는 2028년 3월 시행입니다. 이 초안은
          2028년 이후 입학생용입니다. 학년군 합계: 1~2학년 1,744 / 3~4학년 1,972
          / 5~6학년 2,176시간.
        </p>
      )}
      {c.schoolType === "고등학교" && (
        <>
          <label>
            고등학교 편제 유형{" "}
            <select
              aria-label="고등학교 편제 유형"
              value={vocational ? "vocational" : "general"}
              onChange={(e) => setVocational(e.target.value === "vocational")}
            >
              <option value="general">일반고 기준</option>
              <option value="vocational">
                특성화고·산업수요 맞춤형고 기준
              </option>
            </select>
          </label>
          <p>
            교과 174학점 + 창체 18학점(288시간). 자율 이수와 묶음 교과는 실제
            과목으로 배분해야 합니다. 특목·자율고의 예외 기준은 별도 검토가
            필요합니다. 1학점은 50분 기준 16회입니다.
          </p>
        </>
      )}
      <p>
        {c.schoolType === "중학교"
          ? "정보교육 68시간 이상, 학교스포츠클럽 총 136시간, 자유학기와 학기별 1주 분량의 학교자율시간 배분을 추가 검토하세요."
          : c.schoolType === "초등학교"
            ? "정보교육 34시간 이상, 3~6학년 학교자율시간 및 체육·예술 감축 금지 등 운영 조건을 추가 검토하세요."
            : "공통 과목 이수, 필수 학점, 국어·수학·영어 합계 제한과 진로별 선택 과목을 추가 검토하세요."}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>교과군 / 배분 항목</th>
              {c.grades.flatMap((g) =>
                [1, 2].map((s) => (
                  <th key={`${g}-${s}`}>
                    {g}학년 {s}학기
                  </th>
                )),
              )}
              <th>합계</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.name}>
                <th>{r.name}</th>
                {r.values.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
                <td>{r.values.reduce((a, b) => a + b, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={c.grades.length * 2 + 1}>총계 ({d.unit})</th>
              <td>{d.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <InlineNotice mutation={m} />
      {c.role !== "viewer" && (
        <form
          className="annual-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            m.execute(
              () => createCurriculumDraft(c.workspace.id, year, vocational),
              () => onCreated(year),
              "총론 기반 초안을 만들었습니다. 학교의 세부 편성 기준을 검토해 주세요.",
            );
          }}
        >
          <label>
            초안 입학년도{" "}
            <input
              aria-label="초안 입학년도"
              type="number"
              min={d.minCohort}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <Button
            disabled={m.pending || c.plans.some((p) => p.cohort_year === year)}
          >
            이 초안으로 편성표 만들기
          </Button>
          {c.plans.some((p) => p.cohort_year === year) && (
            <span>이미 편성표가 있는 입학년도입니다.</span>
          )}
        </form>
      )}
    </section>
  );
}
