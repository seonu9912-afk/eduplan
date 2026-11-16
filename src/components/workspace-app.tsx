"use client";
import { TeachingModule } from "@/components/features/teaching";
import { AnnualAcademic } from "@/components/features/annual-academic";
import { WorkPlans } from "@/components/features/work-plans";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  House,
  LogOut,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
  Building2,
  UserRound,
  PanelTop,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Modal, Notice } from "@/components/common";
import {
  CreateSchoolForm,
  ProfileForm,
} from "@/components/features/workspace-forms";
import { Dashboard } from "@/components/features/dashboard";
import { Curriculum } from "@/components/features/curriculum";
import { SchoolSettings } from "@/components/features/settings";
import { Members } from "@/components/features/members";
import { logout } from "@/app/actions";
import { roles, dateLabel } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { buildInfo } from "@/lib/build-info";
const sections: Record<string, string> = {
  home: "홈",
  calendar: "학사운영",
  plans: "학교업무",
  teaching: "수업·평가",
  curriculum: "교육과정",
  settings: "작업공간 설정",
  people: "구성원 관리",
};
export function WorkspaceApp({
  context: c,
  section,
  today,
  initialCohort,
}: {
  context: Context;
  section: string;
  today: string;
  initialCohort?: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"school" | "profile" | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const base = `/app/${c.workspace.id}`;
  const activeYearId = c.year?.id;
  const suffix = c.year ? `?year=${c.year.year}` : "";
  function allowNavigation() {
    return (
      !dirty ||
      window.confirm(
        "저장하지 않은 변경사항이 있습니다. 변경 내용을 버리고 이동할까요?",
      )
    );
  }
  function navigate(path: string) {
    if (allowNavigation()) {
      setDirty(false);
      router.push(path);
    }
  }
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if ((section !== "calendar" && section !== "teaching") || !activeYearId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, section, activeYearId]);
  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div className="header-inner">
          <Brand />
          <div className="header-right">
            <span className="version-chip">v{buildInfo.version}</span>
            <span className="header-date">
              {today.slice(0, 4)}년 {dateLabel(today)}
            </span>
            <button
              className="profile-trigger"
              onClick={() => setModal("profile")}
            >
              <span className="avatar">
                {c.profile.display_name.slice(0, 1)}
              </span>
              <span>
                {c.profile.display_name}
                <small>{roles[c.role]}</small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label="로그아웃"
              disabled={signingOut}
              onClick={async () => {
                if (!allowNavigation()) return;
                setSigningOut(true);
                try {
                  const result = await logout();
                  if (result.ok) {
                    router.push("/login");
                    router.refresh();
                  } else setError(result.error);
                } catch {
                  setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav className="main-nav" aria-label="주요 메뉴">
          <div className="nav-inner">
            {[
              { id: "home", label: "홈", icon: House },
              { id: "curriculum", label: "교육과정", icon: BookOpen },
              { id: "calendar", label: "학사운영", icon: CalendarDays },
              {
                id: "teachers",
                label: "교원 관리",
                icon: Users,
                disabled: true,
              },
              {
                id: "teaching",
                label: "수업·평가",
                icon: PanelTop,
              },
              { id: "plans", label: "학교업무", icon: Building2 },
            ].map(({ id, label, icon: Icon, disabled }) =>
              disabled ? (
                <span
                  key={id}
                  className="nav-item nav-disabled"
                  aria-disabled="true"
                >
                  <Icon size={17} />
                  {label}
                  <small>예정</small>
                </span>
              ) : (
                <Link
                  key={id}
                  href={`${base}/${id}${suffix}`}
                  className={`nav-item ${section === id ? "active" : ""}`}
                  aria-current={section === id ? "page" : undefined}
                  onClick={(e) => {
                    if (!allowNavigation()) e.preventDefault();
                    else setDirty(false);
                  }}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              ),
            )}
          </div>
        </nav>
      </header>
      <div className="workspace-bar no-print">
        <div className="workspace-inner">
          <div className="workspace-pickers">
            <span className="workspace-icon">
              {c.workspace.kind === "school" ? (
                <Building2 size={18} />
              ) : (
                <UserRound size={18} />
              )}
            </span>
            <label className="sr-only" htmlFor="workspace-picker">
              작업공간 선택
            </label>
            <select
              id="workspace-picker"
              value={c.workspace.id}
              onChange={(e) => navigate(`/app/${e.target.value}/${section}`)}
            >
              {c.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.kind === "personal" ? " · 개인" : ""}
                </option>
              ))}
            </select>
            <span className="picker-divider" />
            <label className="sr-only" htmlFor="year-picker">
              학년도 선택
            </label>
            <select
              id="year-picker"
              value={c.year?.year ?? ""}
              onChange={(e) =>
                navigate(`${base}/${section}?year=${e.target.value}`)
              }
            >
              {!c.years.length ? (
                <option value="">학년도 미설정</option>
              ) : (
                c.years.map((y) => (
                  <option key={y.id} value={y.year}>
                    {y.year}학년도
                  </option>
                ))
              )}
            </select>
            <span className="scope-tag">
              {c.workspace.kind === "school" ? "학교 공동" : "개인 작업공간"}
            </span>
          </div>
          <div className="workspace-actions">
            <Button variant="ghost" onClick={() => setModal("school")}>
              <Plus />
              학교 만들기
            </Button>
            <Button
              variant="ghost"
              className={section === "people" ? "selected" : ""}
              onClick={() => navigate(`${base}/people${suffix}`)}
            >
              <Users />
              구성원
            </Button>
            <Button
              variant="ghost"
              aria-label="작업공간 설정"
              className={section === "settings" ? "selected" : ""}
              onClick={() => navigate(`${base}/settings${suffix}`)}
            >
              <Settings2 />
              <span className="desktop-label">설정</span>
            </Button>
          </div>
        </div>
      </div>
      <main id="main-content" className="workspace-content">
        <div className="breadcrumb no-print">
          {c.workspace.name}
          <ChevronRight size={13} />
          <span>{sections[section]}</span>
        </div>
        <Notice message={error} error />
        {section === "home" ? <Dashboard context={c} today={today} /> : null}
        {section === "calendar" ? (
          <AnnualAcademic
            key={`${c.workspace.id}-${c.year?.id}`}
            context={c}
            onDirtyChange={setDirty}
            today={today}
          />
        ) : null}
        {section === "plans" ? (
          <WorkPlans
            key={`${c.workspace.id}-${c.year?.id}`}
            context={c}
            today={today}
            onDirtyChange={setDirty}
          />
        ) : null}
        {section === "curriculum" ? (
          <Curriculum
            context={c}
            initialCohort={initialCohort}
            onDirtyChange={setDirty}
          />
        ) : null}
        {section === "settings" ? (
          <SchoolSettings
            key={`${c.year?.id}-${c.year?.version}`}
            context={c}
          />
        ) : null}
        {section === "teaching" ? (
          <TeachingModule context={c} onDirtyChange={setDirty} />
        ) : null}
        {section === "people" ? <Members context={c} /> : null}
      </main>
      <footer className="app-footer no-print">
        <span>EduPlan · 교육과정부터 수업까지, 하나의 계획으로.</span>
        <span>
          <ShieldCheck size={14} />
          학교별 데이터 분리 · 대한민국 표준시
        </span>
      </footer>
      <Modal
        open={modal === "school"}
        onOpenChange={(v) => !v && setModal(null)}
        title="학교 작업공간 만들기"
        description="학교의 교육과정과 일정을 함께 관리할 공간을 개설합니다."
      >
        <CreateSchoolForm onDone={() => setModal(null)} />
      </Modal>
      <Modal
        open={modal === "profile"}
        onOpenChange={(v) => !v && setModal(null)}
        title="내 프로필"
        description="이름과 로그인 후 기본 작업공간을 설정합니다."
      >
        <ProfileForm context={c} />
      </Modal>
    </div>
  );
}
