"use client";
import { deviceId } from "@/lib/device-session";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, InlineNotice, useMutation } from "@/components/common";
import {
  loadPushSettings,
  savePushSubscription,
  type PushSettings,
  type PushSubscriptionStatus,
} from "@/app/push-actions";
import type { Context } from "@/lib/models";
export function ServerPush({ context: c }: { context: Context }) {
  const [settings, setSettings] = useState<PushSettings | null>(null),
    [statuses, setStatuses] = useState<PushSubscriptionStatus[]>([]),
    [lead, setLead] = useState(5),
    [deviceLabel, setDeviceLabel] = useState("내 기기"),
    [showDetails, setShowDetails] = useState(false),
    [notifyChanges, setNotifyChanges] = useState(true),
    [permission, setPermission] = useState("상태 확인 전"),
    [loaded, setLoaded] = useState(false),
    m = useMutation();
  const refresh = () =>
    m.execute(
      () => loadPushSettings(c.workspace.id),
      (v) => {
        setSettings(v.settings);
        setStatuses(v.subscriptions);
        setLoaded(true);
        setPermission(
          !("Notification" in window) || !("PushManager" in window)
            ? "이 환경에서 푸시 미지원"
            : Notification.permission === "granted"
              ? "권한 허용"
              : Notification.permission === "denied"
                ? "권한 거부 · 브라우저 설정에서 변경"
                : "권한 미설정",
        );
        const current = v.subscriptions.find(
          (s) => s.deviceId === deviceId() && s.enabled,
        );
        if (current) {
          setLead(current.lead);
          setDeviceLabel(current.deviceLabel ?? "내 기기");
          setShowDetails(!!current.showDetails);
          setNotifyChanges(current.notifyChanges !== false);
        }
      },
    );
  async function subscribe() {
    try {
      if (!settings?.enabled)
        throw Error("서버 알림을 아직 사용할 수 없습니다.");
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw Error(
          "이 브라우저는 서버 푸시를 지원하지 않습니다. iPhone·iPad에서는 홈 화면에 추가한 웹 앱에서 확인하세요.",
        );
      if ((await Notification.requestPermission()) !== "granted")
        throw Error("브라우저 알림 권한을 허용해야 합니다.");
      const registration =
        await navigator.serviceWorker.register("/lesson-sw.js");
      // Wait for this exact registration; an unrelated worker must not receive the subscription.
      if (!registration.active)
        await new Promise<void>((resolve, reject) => {
          const worker = registration.installing ?? registration.waiting;
          if (!worker) {
            reject(Error("알림 서비스 설치를 확인하세요."));
            return;
          }
          const timeout = setTimeout(
            () =>
              reject(
                Error("알림 서비스 설치가 지연되었습니다. 다시 시도하세요."),
              ),
            15000,
          );
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") {
              clearTimeout(timeout);
              resolve();
            } else if (worker.state === "redundant") {
              clearTimeout(timeout);
              reject(Error("알림 서비스 설치에 실패했습니다."));
            }
          });
        });
      const bytes = Uint8Array.from(
        atob(settings.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (x) => x.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      const saved = await savePushSubscription({
        workspaceId: c.workspace.id,
        subscription: subscription.toJSON(),
        active: true,
        deviceId: deviceId(),
        deviceLabel,
        showDetails,
        notifyChanges,
        lead,
      });
      if (saved.ok) {
        try {
          localStorage.setItem(
            `eduplan-server-push:${c.workspace.id}:${c.userId}`,
            "true",
          );
        } catch {}
      }
      setPermission(
        Notification.permission === "granted" ? "권한 허용" : "권한 미설정",
      );
      return saved;
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "푸시를 설정하지 못했습니다.",
      };
    }
  }
  return (
    <details className="panel no-print">
      <summary>브라우저를 닫아도 받는 수업 알림</summary>
      <p>
        회원 계정에 연결된 교원의 확정 수업만 안내합니다. 발송 직전과 수신 직후
        최신 시간표를 확인하며, 로그인이 만료되거나 연결 확인에 실패하면 알림을
        표시하지 않습니다.
      </p>
      {!c.operations?.directory.some((t) => t.user_id === c.userId) && (
        <p className="info-box">
          학교 및 교원 설정에서 본인 계정을 교원 명부에 연결해야 개인 수업
          알림을 받을 수 있습니다.
        </p>
      )}
      <Button variant="outline" disabled={m.pending} onClick={refresh}>
        서버 알림 상태 확인
      </Button>
      {loaded && (
        <>
          <p>
            {settings?.enabled
              ? `서버 알림 설정 활성 · 최근 실행 ${settings.lastRunAt ? new Date(settings.lastRunAt).toLocaleString("ko-KR") : "아직 실행되지 않음"}`
              : "검증 환경의 알림 서버 구성이 필요합니다."}
          </p>
          {settings?.lastError && <p role="alert">{settings.lastError}</p>}
          <p role="status">{permission}</p>
          <label>
            기기 이름
            <input
              maxLength={60}
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={showDetails}
              onChange={(e) => setShowDetails(e.target.checked)}
            />
            잠금 화면에 수업·학교 정보 표시 (기본 꺼짐)
          </label>
          <label>
            <input
              type="checkbox"
              checked={notifyChanges}
              onChange={(e) => setNotifyChanges(e.target.checked)}
            />
            시간표 변경·교육활동 요청 결과 알림
          </label>
          <Field label="수업 시작 전 알림" id="server-push-lead">
            <select
              id="server-push-lead"
              value={lead}
              onChange={(e) => setLead(Number(e.target.value))}
            >
              {[1, 3, 5, 10, 15].map((n) => (
                <option value={n} key={n}>
                  {n}분 전
                </option>
              ))}
            </select>
          </Field>
          <Button
            disabled={!settings?.enabled || m.pending}
            onClick={() => m.execute(subscribe, refresh)}
          >
            이 브라우저에서 알림 켜기·시간 변경
          </Button>
          {statuses.map((s, i) => (
            <div className="info-box" key={s.id}>
              <p>
                {s.deviceLabel ?? `등록 브라우저 ${i + 1}`}{" "}
                {s.deviceId === deviceId() ? "(이 기기)" : ""} ·{" "}
                {s.enabled ? `${s.lead}분 전 알림` : "꺼짐"} · 최근 전달{" "}
                {s.lastSentAt
                  ? new Date(s.lastSentAt).toLocaleString("ko-KR")
                  : "없음"}
              </p>
              <p className="field-hint">
                전달 성공은 푸시 서비스 접수 상태입니다. 기기의 실제 표시 여부는
                운영체제 설정에 따라 달라집니다.
              </p>
              {s.lastError && <p role="alert">{s.lastError}</p>}
              {s.enabled && (
                <Button
                  variant="outline"
                  disabled={m.pending}
                  onClick={() =>
                    m.execute(
                      () =>
                        savePushSubscription({
                          workspaceId: c.workspace.id,
                          subscription: { endpoint: s.endpoint },
                          active: false,
                          lead: s.lead,
                        }),
                      () => {
                        try {
                          localStorage.removeItem(
                            `eduplan-server-push:${c.workspace.id}:${c.userId}`,
                          );
                        } catch {}
                        refresh();
                      },
                    )
                  }
                >
                  이 등록의 서버 알림 끄기
                </Button>
              )}
            </div>
          ))}
        </>
      )}
      <InlineNotice mutation={m} />
    </details>
  );
}
