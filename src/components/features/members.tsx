"use client";
import { useState, type ReactNode } from "react";
import { Users, UserPlus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Confirm,
  Empty,
  Field,
  InlineNotice,
  Modal,
  SubmitButton,
  useMutation,
} from "@/components/common";
import {
  createInvitation,
  manageMember,
  revokeInvitation,
} from "@/app/actions";
import { roles } from "@/lib/domain";
import type { Context, Role } from "@/lib/models";
export function Members({ context: c, relatedTools }: { context: Context; relatedTools?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [change, setChange] = useState<{
    userId: string;
    role: Role | null;
    name: string;
  } | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const m = useMutation();
  const admin = c.role === "admin";
  const admins = c.members.filter((member) => member.role === "admin").length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>구성원 관리</h1>
        </div>
        {admin && c.workspace.kind === "school" ? (
          <Button onClick={() => setOpen(true)}>
            <UserPlus />
            구성원 초대
          </Button>
        ) : null}
      </div>
      {relatedTools && <div className="workspace-related-tools">{relatedTools}</div>}
      <InlineNotice mutation={m} />
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Users size={19} />
            작업공간 구성원
            <span className="count-chip">{c.members.length}명</span>
          </h2>
        </div>
        <div className="table-scroll">
          <table className="members-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {c.members.map((member) => (
                <tr key={member.user_id}>
                  <td>
                    <span className="member-name">
                      <span className="avatar">
                        {member.display_name.slice(0, 1)}
                      </span>
                      {member.display_name}
                      {member.user_id === c.userId ? (
                        <span className="scope-tag">나</span>
                      ) : null}
                    </span>
                  </td>
                  <td>{member.email || "—"}</td>
                  <td>
                    {admin && (member.role !== "admin" || admins > 1) ? (
                      <select
                        aria-label={`${member.display_name} 역할`}
                        value={member.role}
                        disabled={m.pending}
                        onChange={(e) =>
                          setChange({
                            userId: member.user_id,
                            role: e.target.value as Role,
                            name: member.display_name,
                          })
                        }
                      >
                        {Object.entries(roles).map(([key, value]) => (
                          <option key={key} value={key}>
                            {value}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="role-badge">
                        {roles[member.role as Role]}
                      </span>
                    )}
                  </td>
                  <td>
                    {admin && (member.role !== "admin" || admins > 1) ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setChange({
                            userId: member.user_id,
                            role: null,
                            name: member.display_name,
                          })
                        }
                      >
                        접근 권한 회수
                      </Button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {admin ? (
        <section className="panel invitations-panel">
          <div className="panel-heading">
            <h2>발급한 초대</h2>
            <span className="muted-small">최근 30건 · 유효기간 7일</span>
          </div>
          {c.invitations.length ? (
            <div className="table-scroll">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>초대 이메일</th>
                    <th>권한</th>
                    <th>만료일</th>
                    <th>상태</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {c.invitations.map((inv) => {
                    const status = inv.accepted_at
                      ? "참여 완료"
                      : inv.revoked_at
                        ? "철회됨"
                        : new Date(inv.expires_at) < new Date()
                          ? "만료"
                          : "초대 중";
                    return (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td>{roles[inv.role as Role]}</td>
                        <td>
                          {new Intl.DateTimeFormat("ko-KR", {
                            timeZone: "Asia/Seoul",
                            dateStyle: "medium",
                          }).format(new Date(inv.expires_at))}
                        </td>
                        <td>
                          <span className="scope-tag">{status}</span>
                        </td>
                        <td>
                          {status === "초대 중" ? (
                            <Button
                              variant="ghost"
                              onClick={() => setRevoke(inv.id)}
                            >
                              철회
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={<UserPlus />}
              title="아직 초대한 구성원이 없어요"
              description="이메일을 지정해 초대 링크를 만들고 동료에게 전달해 주세요."
            />
          )}
        </section>
      ) : null}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="학교 구성원 초대"
        description="초대한 이메일로 가입한 사용자만 참여할 수 있습니다."
      >
        <InviteForm context={c} />
      </Modal>
      <Confirm
        open={!!change}
        onOpenChange={(v) => !v && setChange(null)}
        title={
          change?.role
            ? "구성원의 역할을 변경할까요?"
            : "접근 권한을 회수할까요?"
        }
        description={
          change?.role
            ? `${change.name}님의 권한이 ${roles[change.role]}로 변경됩니다.`
            : `${change?.name}님은 이 학교의 자료에 더 이상 접근할 수 없습니다.`
        }
        pending={m.pending}
        onConfirm={() =>
          m.execute(
            () => manageMember(c.workspace.id, change!.userId, change!.role),
            () => setChange(null),
            "구성원 권한이 변경되었습니다.",
          )
        }
      />
      <Confirm
        open={!!revoke}
        onOpenChange={(v) => !v && setRevoke(null)}
        title="초대 링크를 철회할까요?"
        description="이 링크로는 더 이상 학교에 참여할 수 없습니다."
        pending={m.pending}
        onConfirm={() =>
          m.execute(
            () => revokeInvitation(c.workspace.id, revoke!),
            () => setRevoke(null),
            "초대가 철회되었습니다.",
          )
        }
      />
    </>
  );
}
function InviteForm({ context: c }: { context: Context }) {
  const m = useMutation();
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(
          () =>
            createInvitation({
              target: c.workspace.id,
              recipient: f.get("recipient"),
              member_role: f.get("role"),
            }),
          (data) => {
            setLink(`${window.location.origin}/invite/${data.token}`);
            setCopied(false);
          },
          "초대 링크가 생성되었습니다. 초대받을 분에게 직접 전달해 주세요.",
        );
      }}
    >
      <Field label="초대할 이메일" id="invite-email">
        <input
          id="invite-email"
          name="recipient"
          type="email"
          required
          placeholder="teacher@school.kr"
        />
      </Field>
      <Field label="참여 권한" id="invite-role">
        <select id="invite-role" name="role">
          <option value="editor">편집자 · 일정과 교육과정 편집</option>
          <option value="viewer">조회 전용 · 자료 열람</option>
        </select>
      </Field>
      <p className="field-hint">
        같은 이메일로 다시 발급하면 이전 미사용 초대는 철회됩니다.
      </p>
      <InlineNotice mutation={m} />
      {link ? (
        <div className="invite-link">
          <label htmlFor="invite-url">초대 링크 (지금 복사해 주세요)</label>
          <input id="invite-url" readOnly value={link} />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                m.setNotice({
                  message:
                    "자동 복사에 실패했습니다. 링크를 선택해 복사해 주세요.",
                  error: true,
                });
              }
            }}
          >
            <Copy />
            {copied ? "복사됨" : "링크 복사"}
          </Button>
        </div>
      ) : null}
      <SubmitButton pending={m.pending}>초대 링크 만들기</SubmitButton>
    </form>
  );
}
