"use client";
import dynamic from "next/dynamic";
import { PwaInstallPanel, useOnline } from "@/components/pwa/pwa-provider";
import {
  useDeviceDirty,
  useEditGuard,
  clearDeviceData,
  deviceId,
} from "@/lib/device-session";
import { beginDraftSession } from "@/lib/draft-storage";
import { NotificationCenter } from "@/components/features/notification-center";
import { ServerPush } from "@/components/features/server-push";
import { ActivityRequests } from "@/components/features/activity-requests";
import { LessonLedger } from "@/components/features/lesson-ledger";
import { PlanningPermissions } from "@/components/features/planning-permissions";
import { LessonReminder } from "@/components/features/lesson-reminder";
const Staffing = dynamic(
  () => import("@/components/features/staffing").then((m) => m.Staffing),
  { loading: () => <p role="status">화면을 불러오는 중…</p> },
);
const TeachingModule = dynamic(
  () => import("@/components/features/teaching").then((m) => m.TeachingModule),
  { loading: () => <p role="status">화면을 불러오는 중…</p> },
);
const AcademicCalendar = dynamic(
  () =>
    import("@/components/features/academic-calendar").then(
      (m) => m.AcademicCalendar,
    ),
  { loading: () => <p role="status">화면을 불러오는 중…</p> },
);
const Timetable = dynamic(
  () => import("@/components/features/timetable").then((m) => m.Timetable),
  { loading: () => <p role="status">화면을 불러오는 중…</p> },
);
const WorkPlans = dynamic(
  () => import("@/components/features/work-plans").then((m) => m.WorkPlans),
  { loading: () => <p role="status">화면을 불러오는 중…</p> },
);
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Menu,
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
  Table2,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Modal, Notice } from "@/components/common";
import {
  CreateSchoolForm,
  ProfileForm,
} from "@/components/features/workspace-forms";
import { Dashboard } from "@/components/features/dashboard";
const Curriculum = dynamic(
  () => import("@/components/features/curriculum").then((m) => m.Curriculum),
  { loading: () => <p role="status">화면을 불러오는 중…</p> },
);
import { SchoolSettings } from "@/components/features/settings";
import { Members } from "@/components/features/members";
import { detachPreviousPushAccount } from "@/app/push-actions";
import { logout } from "@/app/actions";
import { roles, dateLabel } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { buildInfo } from "@/lib/build-info";
const sections: Record<string, string> = {
  home: "홈",
  teachers: "교원 관리",
  calendar: "학사운영",
  timetable: "시간표",
  plans: "학교업무",
  teaching: "수업·평가",
  curriculum: "교육과정",
  settings: "작업공간 설정",
  people: "구성원 관리",
  notifications: "알림",
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
  const [modal, setModal] = useState<"school" | "profile" | "menu" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [editorDirty, setDirty] = useState(false);
  useEditGuard("workspace-editor", editorDirty);
  const dirty = useDeviceDirty(),
    online = useOnline();
  const [signingOut, setSigningOut] = useState(false);
  const base = `/app/${c.workspace.id}`;
  const activeYearId = c.year?.id;
  const suffix = c.year ? `?year=${c.year.year}` : "";
  useEffect(() => {
    void beginDraftSession(c.userId).catch(() =>
      setError(
        "기기 임시 초안을 정리하지 못했습니다. 공용 기기에서는 브라우저의 사이트 데이터를 정리해 주세요.",
      ),
    );
  }, [c.userId]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration()
      .then(async (r) => {
        const sub = await r?.pushManager?.getSubscription();
        if (sub) {
          const result = await detachPreviousPushAccount(sub.toJSON());
          if (!result.ok) setError(result.error);
        }
      })
      .catch(() => setError("기기의 알림 연결 확인에 실패했습니다."));
  }, [c.userId]);
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
    if (!activeYearId || dirty) return;
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        router.refresh();
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, section, activeYearId, dirty]);
  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div className="header-inner">
          <Brand />
          <button
            className="icon-button mobile-menu-trigger"
            aria-label="전체 메뉴 열기"
            onClick={() => setModal("menu")}
          >
            <Menu size={22} />
          </button>
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
                  const subscription = await (
                    await navigator.serviceWorker?.getRegistration()
                  )?.pushManager?.getSubscription();
                  const result = await logout(
                    deviceId(),
                    subscription?.endpoint ?? null,
                  );
                  if (result.ok) {
                    try {
                      await clearDeviceData();
                    } catch (e) {
                      window.alert(
                        e instanceof Error
                          ? e.message
                          : "로그아웃했습니다. 공용 기기에서는 사이트 데이터를 정리해 주세요.",
                      );
                    }
                    setDirty(false);
                    router.replace("/login");
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
          <div className="nav-inner" data-arrow-axis="horizontal">
            {[
              { id: "home", label: "홈", icon: House },
              { id: "curriculum", label: "교육과정", icon: BookOpen },
              { id: "calendar", label: "학사운영", icon: CalendarDays },
              { id: "timetable", label: "시간표", icon: Table2 },
              {
                id: "teachers",
                label: "교원 관리",
                icon: Users,
                disabled: false,
              },
              {
                id: "teaching",
                label: "수업·평가",
                icon: PanelTop,
              },
              { id: "plans", label: "월중·주간계획", icon: Building2 },
              { id: "notifications", label: "알림", icon: Bell },
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
                  data-guarded-navigation
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
        <p className="data-freshness" role="status">
          {online
            ? dirty
              ? "작성 내용 유지 중 · 원본 변경 확인은 저장 후 자동 재개"
              : "서버 조회 시각 " +
                new Date(c.loadedAt ?? "").toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })
            : "오프라인 · 최신 데이터 확인 불가"}
        </p>
        <LessonReminder context={c} />
        {section === "teachers" ? (
          <Staffing context={c} onDirtyChange={setDirty} />
        ) : null}
        {section === "notifications" && (
          <>
            <NotificationCenter context={c} />
            <ServerPush context={c} />
            <PwaInstallPanel />
          </>
        )}
        {section === "home" ? <Dashboard context={c} today={today} /> : null}
        {section === "calendar" && (
          <ActivityRequests context={c} today={today} />
        )}
        {section === "timetable" && <LessonLedger context={c} today={today} />}
        {section === "people" && <PlanningPermissions context={c} />}
        {section === "calendar" ? (
          <AcademicCalendar
            key={`${c.workspace.id}-${c.year?.id}`}
            context={c}
            onDirtyChange={setDirty}
            today={today}
          />
        ) : null}
        {section === "timetable" ? (
          <Timetable
            key={c.workspace.id + "-" + c.year?.id}
            context={c}
            onDirtyChange={setDirty}
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
          <>
            <PwaInstallPanel />
            <SchoolSettings
              key={`${c.year?.id}-${c.year?.version}`}
              context={c}
            />
          </>
        ) : null}
        {section === "teaching" ? (
          <TeachingModule context={c} onDirtyChange={setDirty} />
        ) : null}
        {section === "people" ? <Members context={c} /> : null}
      </main>
      <nav className="mobile-bottom-nav no-print" aria-label="모바일 주요 메뉴">
        {[
          { id: "home", label: "홈", icon: House },
          { id: "calendar", label: "일정", icon: CalendarDays },
          { id: "timetable", label: "시간표", icon: Table2 },
          { id: "notifications", label: "알림", icon: Bell },
        ].map(({ id, label, icon: Icon }) => (
          <Link
            data-guarded-navigation
            key={id}
            href={`${base}/${id}${suffix}`}
            aria-current={section === id ? "page" : undefined}
            onClick={(e) => {
              if (!allowNavigation()) e.preventDefault();
              else setDirty(false);
            }}
          >
            <Icon />
            <span>{label}</span>
            {id === "notifications" &&
              c.operations?.notifications.some((n) => !n.read_at) && (
                <span className="nav-unread" aria-label="읽지 않은 알림">
                  ●
                </span>
              )}
          </Link>
        ))}
        <button
          onClick={() => setModal("menu")}
          aria-expanded={modal === "menu"}
        >
          <Menu />
          <span>전체 메뉴</span>
        </button>
      </nav>
      <Modal
        open={modal === "menu"}
        onOpenChange={(v) => !v && setModal(null)}
        title="전체 메뉴"
        description={`${c.workspace.name} · ${roles[c.role]}`}
      >
        <nav className="mobile-menu-grid" aria-label="모든 기능">
          {Object.entries(sections).map(([id, label]) => (
            <Link
              data-guarded-navigation
              key={id}
              href={`${base}/${id}${suffix}`}
              aria-current={section === id ? "page" : undefined}
              onClick={(e) => {
                if (!allowNavigation()) e.preventDefault();
                else {
                  setDirty(false);
                  setModal(null);
                }
              }}
            >
              {label}
              <ChevronRight size={16} />
            </Link>
          ))}
        </nav>
        <div className="mobile-view-toolbar">
          <Button variant="outline" onClick={() => setModal("profile")}>
            내 프로필
          </Button>
          <Button variant="outline" onClick={() => setModal("school")}>
            학교 만들기
          </Button>
        </div>
      </Modal>
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
