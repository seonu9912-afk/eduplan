"use client";
import { useRouter } from "next/navigation";
import { InlineNotice, useMutation } from "@/components/common";
import { savePlanningPermission } from "@/app/planning-completion-actions";
import {
  planningDomains,
  type PlanningDomain,
} from "@/lib/planning-completion";
import type { Context } from "@/lib/models";
export function PlanningPermissions({ context: c }: { context: Context }) {
  const m = useMutation(),
    router = useRouter();
  if (c.role !== "admin") return null;
  return (
    <details className="panel no-print">
      <summary>업무별 편집 권한</summary>
      <p>
        편집 구성원의 담당 업무를 지정합니다. 기존 권한은 유지하며 여기서 변경한
        항목부터 적용됩니다. 관리자는 모든 업무를 관리하고 조회 구성원은 본인
        수업 확인·교육활동 요청을 할 수 있습니다.
      </p>
      <div className="operations-scroll">
        <table className="operations-table">
          <thead>
            <tr>
              <th>구성원</th>
              {Object.values(planningDomains).map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.members
              .filter((x) => x.role === "editor")
              .map((user) => (
                <tr key={user.user_id}>
                  <td>{user.display_name}</td>
                  {(Object.keys(planningDomains) as PlanningDomain[]).map(
                    (domain) => {
                      const p = c.completion?.permissions.find(
                        (x) =>
                          x.user_id === user.user_id && x.domain === domain,
                      );
                      return (
                        <td key={domain}>
                          <input
                            aria-label={`${user.display_name} ${planningDomains[domain]} 권한`}
                            type="checkbox"
                            disabled={m.pending}
                            checked={p?.can_edit ?? domain !== "calendar"}
                            onChange={(e) =>
                              m.execute(
                                () =>
                                  savePlanningPermission({
                                    workspaceId: c.workspace.id,
                                    member: user.user_id,
                                    domain,
                                    allowed: e.target.checked,
                                    version: p?.version ?? 0,
                                  }),
                                () => router.refresh(),
                              )
                            }
                          />
                        </td>
                      );
                    },
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <InlineNotice mutation={m} />
    </details>
  );
}
