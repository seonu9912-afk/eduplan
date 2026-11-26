"use client";
import { Disclosure } from "@/components/ui/disclosure";
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
    <Disclosure className="panel no-print" label="업무별 편집 권한">
      <p>
        계획을 작성하고 공개할 사람을 업무별로 지정합니다. 학교 관리자가 직접 편집할 때도 해당 업무를 지정하세요.
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
            {c.members.map((user) => (
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
                            checked={p?.can_edit ?? false}
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
    </Disclosure>
  );
}
