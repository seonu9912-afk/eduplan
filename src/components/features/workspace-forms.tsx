"use client";
import { useRouter } from "next/navigation";
import { Building2, ShieldCheck } from "lucide-react";
import { createSchool, saveProfile, acceptInvitation } from "@/app/actions";
import {
  Field,
  InlineNotice,
  SubmitButton,
  useMutation,
} from "@/components/common";
import { schoolTypes } from "@/lib/domain";
import type { Context } from "@/lib/models";
import "./school-plan-readers.css";
export function CreateSchoolForm({ onDone }: { onDone?: () => void }) {
  const m = useMutation();
  const router = useRouter();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(
          () =>
            createSchool({
              school_name: f.get("school_name"),
              school_region: f.get("school_region"),
              school_type: f.get("school_type"),
            }),
          (id) => {
            onDone?.();
            router.push(`/app/${id}/settings`);
          },
        );
      }}
    >
      <div className="info-box">
        <Building2 size={20} />
        <p>
          학교 작업공간 개설은 공식 재직 인증을 의미하지 않습니다. 학교의 운영
          규정에 따라 자료를 관리해 주세요.
        </p>
      </div>
      <Field label="학교명" id="school_name">
        <input
          id="school_name"
          name="school_name"
          placeholder="예: 에듀중학교"
          maxLength={80}
          required
        />
      </Field>
      <Field label="지역" id="school_region">
        <input
          id="school_region"
          name="school_region"
          placeholder="예: 서울특별시"
          maxLength={40}
          required
        />
      </Field>
      <Field label="학교급" id="school_type">
        <select id="school_type" name="school_type" defaultValue="중학교">
          {schoolTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </Field>
      <InlineNotice mutation={m} />
      <SubmitButton pending={m.pending}>학교 작업공간 만들기</SubmitButton>
    </form>
  );
}
export function SchoolOnboarding({ hasArchive }: { hasArchive: boolean }) {
  const router = useRouter();
  const m = useMutation();
  return (
    <main id="main-content" className="workspace-content">
      <header className="page-heading"><h1>학교 시작하기</h1></header>
      <div className="school-entry">
        <section className="panel">
          <h2>학교 참여</h2>
          <form className="form-stack" onSubmit={(event) => {
            event.preventDefault();
            const input = String(new FormData(event.currentTarget).get("invite") ?? "").trim();
            const token = input.match(/(?:^|\/invite\/)([0-9a-f]{64})\/?$/i)?.[1];
            m.execute(
              () => token ? acceptInvitation(token.toLowerCase()) : Promise.resolve({
                ok: false, error: "학교 관리자가 보낸 초대 링크를 입력하세요.",
              }),
              (id) => router.push(`/app/${id}/home`),
            );
          }}>
            <Field id="school-invite" label="초대 링크">
              <input id="school-invite" name="invite" maxLength={2000} required />
            </Field>
            <InlineNotice mutation={m} />
            <SubmitButton pending={m.pending}>학교 참여</SubmitButton>
          </form>
        </section>
        <section className="panel">
          <h2>새 학교 개설</h2>
          <CreateSchoolForm />
        </section>
      </div>
      {hasArchive && <a className="text-link" href="/app/personal-archive" download>기존 개인 자료 내려받기</a>}
    </main>
  );
}
export function ProfileForm({ context }: { context: Context }) {
  const m = useMutation();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(() =>
          saveProfile({
            display_name: f.get("display_name"),
            default_workspace_id: f.get("default_workspace_id"),
          }),
        );
      }}
    >
      <Field label="이메일" id="profile-email">
        <input id="profile-email" value={context.email} readOnly />
      </Field>
      <Field label="이름" id="profile-name">
        <input
          id="profile-name"
          name="display_name"
          defaultValue={context.profile.display_name}
          maxLength={40}
          required
        />
      </Field>
      <Field label="기본 작업공간" id="default-workspace">
        <select
          id="default-workspace"
          name="default_workspace_id"
          defaultValue={
            context.profile.default_workspace_id ?? context.workspace.id
          }
        >
          {context.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <InlineNotice mutation={m} />
      <SubmitButton pending={m.pending} />
      {context.hasPersonalArchive && <a className="text-link" href="/app/personal-archive" download>기존 개인 자료 내려받기</a>}
    </form>
  );
}
export function AcceptInvitation({ token }: { token: string }) {
  const m = useMutation();
  const router = useRouter();
  return (
    <div className="invitation-card">
      <span className="tile-icon">
        <ShieldCheck />
      </span>
      <h1>학교 작업공간 초대</h1>
      <p>
        초대받은 이메일로 로그인하셨나요?
        <br />
        참여하면 학교의 일정과 교육과정을 함께 볼 수 있습니다.
      </p>
      <InlineNotice mutation={m} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.execute(
            () => acceptInvitation(token),
            (id) => router.push(`/app/${id}/home`),
            "학교에 참여했습니다.",
          );
        }}
      >
        <SubmitButton pending={m.pending}>초대 수락하고 참여하기</SubmitButton>
      </form>
      <small>초대 링크는 발급 후 7일 동안 한 번만 사용할 수 있습니다.</small>
    </div>
  );
}
