"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { useDeviceDirty } from "@/lib/device-session";
import { buildInfo } from "@/lib/build-info";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type State = {
  installed: boolean;
  ios: boolean;
  supported: boolean;
  install: (() => Promise<void>) | null;
  waiting: boolean;
  error: string;
};
const PwaContext = createContext<State>({
  installed: false,
  ios: false,
  supported: false,
  install: null,
  waiting: false,
  error: "",
});
const subscribe = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
export function PwaProvider({ children }: { children: ReactNode }) {
  const online = useOnline(),
    dirty = useDeviceDirty(),
    [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [installed, setInstalled] = useState(false),
    [ios, setIos] = useState(false),
    [supported, setSupported] = useState(false),
    [registration, setRegistration] =
      useState<ServiceWorkerRegistration | null>(null),
    [waiting, setWaiting] = useState(false),
    [available, setAvailable] = useState(false),
    [error, setError] = useState(""),
    [notificationPath, setNotificationPath] = useState("");
  useEffect(() => {
    let alive = true;
    const standalone = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      setInstalled(
        standalone.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
      setIos(
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      );
      setSupported("serviceWorker" in navigator);
    };
    const onNotification = (event: MessageEvent) => {
      if (
        event.data?.type === "OPEN_NOTIFICATION" &&
        typeof event.data.path === "string" &&
        event.data.path.startsWith("/app/")
      )
        setNotificationPath(event.data.path);
    };
    navigator.serviceWorker?.addEventListener("message", onNotification);
    const timer = setTimeout(sync, 0);
    standalone.addEventListener("change", sync);
    const before = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", done);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/lesson-sw.js", { updateViaCache: "none" })
        .then((r) => {
          if (!alive) return;
          setRegistration(r);
          setWaiting(!!r.waiting);
          r.addEventListener("updatefound", () => {
            const worker = r.installing;
            worker?.addEventListener("statechange", () => {
              if (
                alive &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaiting(true);
            });
          });
        })
        .catch(() => {
          if (alive)
            setError(
              "앱 설치·오프라인 화면 초기화에 실패했습니다. 연결을 복구한 뒤 다시 실행하세요.",
            );
        });
    const viewport = () => {
      const view = window.visualViewport;
      document.documentElement.style.setProperty(
        "--visible-height",
        `${view?.height ?? window.innerHeight}px`,
      );
      document.documentElement.dataset.keyboard = String(
        !!view && window.innerHeight - view.height > 150,
      );
    };
    viewport();
    window.visualViewport?.addEventListener("resize", viewport);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onNotification);
      alive = false;
      clearTimeout(timer);
      standalone.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", done);
      window.visualViewport?.removeEventListener("resize", viewport);
    };
  }, []);
  useEffect(() => {
    if (!online) return;
    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await registration?.update();
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return;
        const version = await response.json();
        if (
          active &&
          version.commit &&
          buildInfo.commit &&
          version.commit !== buildInfo.commit
        )
          setAvailable(true);
      } catch {
        /* Keep the current document, including edits, during a connection failure. */
      }
    };
    const initial = setTimeout(check, 0),
      interval = setInterval(check, 600000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    return () => {
      active = false;
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
    };
  }, [online, registration]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.("a[href]");
      if (
        !link ||
        link.hasAttribute("data-guarded-navigation") ||
        link.hasAttribute("download") ||
        link.getAttribute("target") === "_blank"
      )
        return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const next = new URL(href, location.href);
      if (
        next.origin === location.origin &&
        (next.pathname !== location.pathname ||
          next.search !== location.search) &&
        !window.confirm(
          "저장하지 않은 변경사항이 있습니다. 입력을 버리고 이동할까요?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [dirty]);
  async function applyUpdate() {
    if (dirty || !online) return;
    try {
      await registration?.update();
      if (registration?.waiting) {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => window.location.reload(),
          { once: true },
        );
        registration.waiting.postMessage({ type: "APPLY_UPDATE" });
      } else window.location.reload();
    } catch {
      setError("업데이트를 확인하지 못했습니다. 현재 화면은 유지됩니다.");
    }
  }
  return (
    <PwaContext.Provider
      value={{
        installed,
        ios,
        supported,
        waiting,
        error,
        install: prompt
          ? async () => {
              await prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }
          : null,
      }}
    >
      {!online && (
        <aside className="connection-banner no-print" role="alert">
          오프라인 · 최신 학교 자료를 확인할 수 없습니다. 작성 내용은 유지하고
          연결 복구 후 저장하세요.
        </aside>
      )}
      {(waiting || available) && (
        <aside className="update-banner no-print" role="status">
          <span>
            새 버전이 준비되었습니다.{" "}
            {dirty
              ? "작성 중인 내용을 저장한 후 적용할 수 있습니다."
              : "다시 실행하면 새 버전이 적용됩니다."}
          </span>
          <Button
            variant="outline"
            disabled={dirty || !online}
            onClick={() => void applyUpdate()}
          >
            새 버전 적용
          </Button>
        </aside>
      )}
      {notificationPath && (
        <aside className="update-banner no-print">
          <span>
            선택한 알림이 있습니다.{" "}
            {dirty && "작성 내용을 저장한 뒤 열어 주세요."}
          </span>
          <Button
            disabled={dirty}
            onClick={() => {
              window.location.assign(notificationPath);
              setNotificationPath("");
            }}
          >
            관련 화면 열기
          </Button>
          <Button variant="ghost" onClick={() => setNotificationPath("")}>
            닫기
          </Button>
        </aside>
      )}
      {children}
    </PwaContext.Provider>
  );
}
export function PwaInstallPanel() {
  const state = useContext(PwaContext),
    [message, setMessage] = useState("");
  return (
    <details className="panel pwa-install-panel no-print">
      <summary>EduPlan 앱 설치</summary>
      <div className="pwa-install-content">
        {state.installed ? (
          <p>설치된 앱으로 실행 중입니다.</p>
        ) : (
          <>
            <p>
              같은 EduPlan을 홈 화면이나 PC 앱으로 열 수 있습니다. 설치 후에는
              다시 로그인해야 할 수 있습니다.
            </p>
            {state.install ? (
              <Button
                onClick={() =>
                  void state
                    .install?.()
                    .catch(() =>
                      setMessage(
                        "설치 창을 열지 못했습니다. 브라우저 메뉴의 앱 설치를 이용하세요.",
                      ),
                    )
                }
              >
                이 기기에 설치
              </Button>
            ) : state.ios ? (
              <p>
                Safari에서 <strong>공유 → 홈 화면에 추가</strong>를 선택하세요.
                iOS/iPadOS 16.4 이상에서 설치한 앱은 푸시 알림을 지원합니다.
              </p>
            ) : (
              <p>
                Chrome·Edge 등 지원 브라우저의 주소 표시줄 설치 아이콘 또는
                메뉴의 <strong>앱 설치 / 홈 화면에 추가</strong>를 사용하세요.
                설치 메뉴가 없으면 웹사이트로 모든 기능을 이용할 수 있습니다.
              </p>
            )}
          </>
        )}
        {!state.supported && (
          <p>이 환경에서는 설치·오프라인 실행 지원이 제한될 수 있습니다.</p>
        )}
        {(state.error || message) && (
          <p role="alert">{message || state.error}</p>
        )}
        <p className="field-hint">
          학교 자료와 로그인 응답은 오프라인 캐시에 저장하지 않습니다.
          교수학습계획의 기기 임시 초안은 최대 4시간 보존되며 로그아웃·계정 변경
          시 정리합니다.
        </p>
      </div>
    </details>
  );
}
