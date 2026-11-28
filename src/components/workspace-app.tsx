"use client";
import dynamic from "next/dynamic";
import { PwaInstallPanel } from "@/components/pwa/pwa-provider";
import {
  useDeviceDirty,
  useEditGuard,
  clearDeviceData,
  deviceId,
} from "@/lib/device-session";
import { beginDraftSession } from "@/lib/draft-storage";
import { NotificationCenter } from "@/components/features/notification-center";
import { usePublishedChanges } from "@/components/features/published-changes";
import { ServerPush } from "@/components/features/server-push";
import { ActivityRequests } from "@/components/features/activity-requests";
import { LessonLedger } from "@/components/features/lesson-ledger";
import { PlanningPermissions } from "@/components/features/planning-permissions";
import { LessonReminder } from "@/components/features/lesson-reminder";
import { LessonReminderSettings } from "@/components/features/lesson-reminder-settings";
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
import { useEffect, useState, type ReactNode } from "react";
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
  Users,
  ClipboardList,
  PanelTop,
  Table2,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemePreferenceControl } from "@/components/theme-preference";
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
import { PlanOverview } from "@/components/features/plan-overview";
import { OperationAudit } from "@/components/features/operation-audit";
import type { AuditCheck } from "@/lib/operation-audit";
import type { PlanOverviewRow } from "@/lib/plan-overview";
import { Members } from "@/components/features/members";
import { detachPreviousPushAccount } from "@/app/push-actions";
import { logout } from "@/app/actions";
import { academicYearOf, roles } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { canPlan } from "@/lib/planning-completion";
import { managementDomains } from "@/lib/school-publications";
import { OfficialTimetable } from "@/components/features/official-timetable";
import { OfficialCurriculum, OfficialSchedule, OfficialTeaching } from "@/components/features/school-plan-readers";
const sections: Record<string, string> = {
  home: "홈",
  curriculum: "교육과정",
  calendar: "학사일정",
  plans: "업무계획",
  timetable: "시간표",
  teaching: "수업·평가",
  teachers: "교원 관리",
  notifications: "알림",
  settings: "학교 설정",
  people: "구성원 관리",
};
export function WorkspaceApp({
  context: c,
  section,
  today,
  initialCohort,
  initialScheduleDate,
  initialQuickAdd,
  initialWorkItem,
  management = false,
  homePublicData,
  planOverview,
  operationAudit,
}: {
  context: Context;
  section: string;
  today: string;
  initialCohort?: string;
  initialScheduleDate?: string;
  initialQuickAdd?: boolean;
  initialWorkItem?: string;
  management?: boolean;
  homePublicData?: ReactNode;
  planOverview?: PlanOverviewRow[];
  operationAudit?: AuditCheck[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"school" | "profile" | "menu" | "notifications" | null>(
    null,
  );
  const [error, setError] = useState("");
  const changes = usePublishedChanges(c);
  const unreadCount = (c.operations?.notifications ?? []).filter((item) => !item.read_at).length + changes.items.length;
  const [editorDirty, setDirty] = useState(false);
  useEditGuard("workspace-editor", editorDirty);
  const dirty = useDeviceDirty();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const base = `/app/${c.workspace.id}`;
  const currentSchoolYear = academicYearOf(today);
  const yearOptions = [...new Set([
    ...c.years.map((y) => y.year),
    currentSchoolYear - 1,
    currentSchoolYear,
    currentSchoolYear + 1,
  ])].filter((year) => year >= 2000 && year <= 2100).sort((a, b) => b - a);
  const otherYears = Array.from({ length: 101 }, (_, index) => 2100 - index)
    .filter((year) => !yearOptions.includes(year));
  const schoolAdmin = c.role === "admin";
  const staffingAccess = schoolAdmin || canPlan(c, "staffing");
  const area = managementDomains[section];
  const sharedPlan = ["calendar", "plans", "curriculum", "timetable", "teaching"].includes(section);
  const mayManage = sharedPlan && (section === "teaching" || (area && (schoolAdmin || canPlan(c, area))));
  const visibleSection = (id: string) =>
    id === "settings" || id === "people" ? schoolAdmin : id === "teachers" ? staffingAccess : true;
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
  const readerTools = !management && ["calendar", "plans", "timetable"].includes(section);
  const managementLink = mayManage && <Button asChild variant="ghost" className="workspace-manage-link">
    <Link data-guarded-navigation href={`${base}/${section}${suffix}${management ? "" : suffix ? "&view=manage" : "?view=manage"}`}
      onClick={(event) => {
        if (!allowNavigation()) event.preventDefault();
        else setDirty(false);
      }}>
      <Settings2 aria-hidden="true" />
      {management ? "공개본 보기" : section === "teaching" ? "내 계획·관리"
        : area && canPlan(c, area) ? `${sections[section]} 관리` : "관리자 검토"}
    </Link>
  </Button>;
  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div className="header-inner">
          <Brand />
          <div className="workspace-pickers">
            <label className="sr-only" htmlFor="workspace-picker">
              작업공간 선택
            </label>
            <select
              id="workspace-picker"
              value={c.workspace.id}
              onChange={(e) => navigate(`/app/${e.target.value}/home`)}
            >
              {c.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="year-picker">
              학년도 선택
            </label>
            <select
              id="year-picker"
              value={c.year?.year ?? ""}
              onChange={(e) => navigate(`${base}/${section}?year=${e.target.value}${management ? "&view=manage" : ""}`)}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}학년도</option>
              ))}
              <optgroup label="다른 학년도">
                {otherYears.map((year) => <option key={year} value={year}>{year}학년도</option>)}
              </optgroup>
            </select>
          </div>
          <div className="workspace-actions">
            <Button variant="ghost" onClick={() => setModal("school")}>
              <Plus />
              학교 만들기
            </Button>
            {schoolAdmin && <Button
              variant="ghost"
              className={section === "people" ? "selected" : ""}
              aria-current={section === "people" ? "page" : undefined}
              onClick={() => navigate(`${base}/people${suffix}`)}
            >
              <Users />
              구성원
            </Button>}
            {schoolAdmin && <Button
              variant="ghost"
              aria-label="학교 설정"
              className={section === "settings" ? "selected" : ""}
              aria-current={section === "settings" ? "page" : undefined}
              onClick={() => navigate(`${base}/settings${suffix}`)}
            >
              <Settings2 />
              <span className="desktop-label">설정</span>
            </Button>}
          </div>
          <div className="header-right">
            <Button variant="ghost" size="icon" className="header-notification-trigger"
              aria-label={unreadCount ? `알림 (${unreadCount}개 읽지 않음)` : "알림"}
              aria-haspopup="dialog" aria-expanded={modal === "notifications"}
              onClick={() => setModal("notifications")}>
              <Bell aria-hidden="true" />
              {unreadCount > 0 && <span className="header-notification-count" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </Button>
            <button
              className="profile-trigger"
              aria-label="내 프로필"
              onClick={() => { setSignOutError(""); setModal("profile"); }}
            >
              <span className="avatar">
                {c.profile.display_name.slice(0, 1)}
              </span>
              <span>
                {c.profile.display_name}
                <small>{roles[c.role]}</small>
              </span>
            </button>
          </div>
        </div>
      </header>
      <nav className="main-nav no-print" aria-label="주요 메뉴">
        <div className="nav-inner" data-arrow-axis="layout">
          {[
            { id: "home", label: "홈", icon: House },
            { id: "curriculum", label: "교육과정", icon: BookOpen },
            { id: "calendar", label: sections.calendar, icon: CalendarDays },
            { id: "plans", label: sections.plans, icon: ClipboardList },
            { id: "timetable", label: sections.timetable, icon: Table2 },
            { id: "teaching", label: sections.teaching, icon: PanelTop },
            { id: "teachers", label: sections.teachers, icon: Users, disabled: false },
          ].filter(({ id }) => visibleSection(id)).map(({ id, label, icon: Icon, disabled }) =>
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
      <nav className="mobile-bottom-nav no-print" aria-label="모바일 주요 메뉴">
        {[
          { id: "home", label: "홈", icon: House },
          { id: "calendar", label: "학사일정", icon: CalendarDays },
          { id: "plans", label: "주간계획", icon: ClipboardList },
          { id: "timetable", label: "시간표", icon: Table2 },
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
      <main key={`${c.workspace.id}:${section}`} id="main-content" className="workspace-content workspace-motion-enter"
        data-surface={section === "settings" ? "form" : "wide"} data-section={section}>
        <Notice message={error} error />
        <LessonReminder context={c} showErrors={section === "notifications"} />
        {readerTools && <h1 className="sr-only">{sections[section]}</h1>}
        {sharedPlan && !readerTools && (
          <header className={management ? "workspace-view-tools no-print" : "page-heading no-print"}>
            {!management && <h1>{sections[section]}</h1>}
            {managementLink}
          </header>
        )}
        {section === "teachers" ? (
          <Staffing context={c} onDirtyChange={setDirty} />
        ) : null}
        {section === "notifications" && (
          <>
            <NotificationCenter context={c} changes={changes} />
            <section className="notifications-settings" aria-label="알림 설정">
              <h2>알림 설정</h2>
              <LessonReminderSettings workspaceId={c.workspace.id} userId={c.userId} />
              <ServerPush context={c} />
              <PwaInstallPanel />
            </section>
          </>
        )}
        {section === "home" ? <Dashboard context={c} today={today} publicData={homePublicData} /> : null}
        {section === "calendar" && management ? (
          <AcademicCalendar
            key={`${c.workspace.id}-${c.year?.id}`}
            context={c}
            onDirtyChange={setDirty}
            today={today}
            relatedTools={c.year && <ActivityRequests context={c} today={today} />}
          />
        ) : null}
        {section === "calendar" && !management && <>
          <OfficialSchedule key={`${c.year?.id}:calendar:${initialScheduleDate ?? ""}`} context={c} today={today} initialDate={initialScheduleDate} actions={managementLink} activityTools={<ActivityRequests context={c} today={today} embedded />} />
        </>}
        {section === "timetable" && management ? (
          <Timetable
            key={c.workspace.id + "-" + c.year?.id}
            context={c}
            onDirtyChange={setDirty}
            relatedTools={<LessonLedger context={c} today={today} />}
          />
        ) : null}
        {section === "timetable" && !management && <>
          <OfficialTimetable key={`${c.year?.id}:timetable:${initialScheduleDate ?? ""}`} context={c} today={today} actions={managementLink} initialDate={initialScheduleDate} />
          {!canPlan(c, "timetable") && c.operations?.directory.some((staff) => staff.user_id === c.userId) &&
            <div className="workspace-related-tools"><LessonLedger context={c} today={today} /></div>}
        </>}
        {section === "plans" && management ? (
          <WorkPlans
            key={`${c.workspace.id}-${c.year?.id}`}
            context={c}
            today={today}
            initialDate={initialScheduleDate}
            initialQuickAdd={initialQuickAdd}
            onDirtyChange={setDirty}
          />
        ) : null}
        {section === "plans" && !management && <OfficialSchedule key={`${c.year?.id}:plans:${initialScheduleDate ?? ""}:${initialWorkItem ?? ""}`} context={c} today={today} initialDate={initialScheduleDate} initialWorkItem={initialWorkItem} work actions={managementLink} />}
        {section === "curriculum" && management ? (
          <Curriculum
            context={c}
            initialCohort={initialCohort}
            onDirtyChange={setDirty}
          />
        ) : null}
        {section === "curriculum" && !management && <OfficialCurriculum context={c} />}
        {section === "settings" && schoolAdmin ? (
          <>
            <SchoolSettings
              key={`${c.year?.id}-${c.year?.version}`}
              context={c}
              overview={c.year ? <>{planOverview && <PlanOverview rows={planOverview} workspaceId={c.workspace.id} year={c.year.year} />}{operationAudit && <OperationAudit rows={operationAudit} workspaceId={c.workspace.id} year={c.year.year} />}{!planOverview && !operationAudit && <p role="status">계획 수립 및 점검 자료를 불러오지 못했습니다.</p>}</> : undefined}
              installPanel={<PwaInstallPanel />}
            />
          </>
        ) : null}
        {section === "teaching" && management ? (
          <TeachingModule context={c} onDirtyChange={setDirty} />
        ) : null}
        {section === "teaching" && !management && <OfficialTeaching context={c} />}
        {section === "people" && schoolAdmin ? (
          <Members
            context={c}
            relatedTools={c.role === "admin" && <PlanningPermissions context={c} />}
          />
        ) : null}
      </main>

      <Modal open={modal === "notifications"} onOpenChange={(v) => !v && setModal(null)}
        title="알림" description="새로운 학교 알림을 확인하세요.">
        <NotificationCenter context={c} changes={changes} onNavigate={() => {
          if (!allowNavigation()) return false;
          setDirty(false);
          setModal(null);
          return true;
        }} />
        <div className="notification-popup-footer">
          <Button variant="outline" onClick={() => {
            if (!allowNavigation()) return;
            setModal(null);
            navigate(`${base}/notifications${suffix}`);
          }}>알림 설정</Button>
        </div>
      </Modal>
      <Modal
        open={modal === "menu"}
        onOpenChange={(v) => !v && setModal(null)}
        title="전체 메뉴"
        description={`${c.workspace.name} · ${roles[c.role]}`}
      >
        <nav className="mobile-menu-grid" aria-label="모든 기능">
          {Object.entries(sections).filter(([id]) => visibleSection(id)).map(([id, label]) => (
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
        <ThemePreferenceControl />
        <div className="mobile-view-toolbar">
          <Button variant="outline" onClick={() => { setSignOutError(""); setModal("profile"); }}>
            내 프로필
          </Button>
          <Button variant="outline" onClick={() => setModal("school")}>
            학교 만들기
          </Button>
        </div>
      </Modal>
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
        <ThemePreferenceControl />
        <div className="profile-actions">
            <Notice message={signOutError} error />
            <button
              className="profile-sign-out"
              aria-label="로그아웃"
              disabled={signingOut}
              onClick={async () => {
                if (!allowNavigation()) return;
                setSignOutError("");
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
                  } else setSignOutError(result.error);
                } catch {
                  setSignOutError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              <LogOut size={17} aria-hidden="true" /> 로그아웃
            </button>
        </div>
      </Modal>
    </div>
  );
}
