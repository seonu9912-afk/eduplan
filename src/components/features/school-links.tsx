"use client";
import { useState } from "react";
import Link from "next/link";
import { BookOpen, Briefcase, ClipboardList, ExternalLink, Folder, Globe, Link2, Plus, School } from "lucide-react";
import { deleteSchoolLink, saveSchoolLink } from "@/app/actions";
import { Confirm, InlineNotice, Modal, SubmitButton, useMutation } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { linkCategories, linkIcons, externalUrl } from "@/lib/external-links";
import type { Context, Row } from "@/lib/models";
import "./school-extras.css";

type SchoolLink = Row<"school_links">;
const icons = { link: Link2, briefcase: Briefcase, school: School, folder: Folder, clipboard: ClipboardList, book: BookOpen, globe: Globe };
const previewLimit = 6;

function ShortcutItems({ links }: { links: SchoolLink[] }) {
  return <ul className="shortcut-list">{links.map((link) => {
    const url = externalUrl.safeParse(link.url);
    if (!url.success) return null;
    const Icon = icons[link.icon as keyof typeof icons] ?? Link2;
    return <li key={link.id}>
      <a href={url.data} target="_blank" rel="noopener noreferrer" className="shortcut-item">
        <span className="shortcut-icon"><Icon aria-hidden="true" /></span>
        <span className="shortcut-name">{link.name}<span className="sr-only"> (새 창)</span></span>
        <ExternalLink className="shortcut-external" aria-hidden="true" />
      </a>
    </li>;
  })}</ul>;
}

export function SchoolShortcuts({ context: c }: { context: Context }) {
  const links = c.schoolLinks?.filter((link) => externalUrl.safeParse(link.url).success) ?? [];
  const homepage = externalUrl.safeParse(c.school?.homepage_url);
  const items = homepage.success && !links.some((link) => new URL(link.url).href === new URL(homepage.data).href)
    ? [...links, { id: "homepage", workspace_id: c.workspace.id, name: "학교 홈페이지",
      url: homepage.data, category: "school", icon: "school", position: 9999 }]
    : links;
  return <section className="personal-widget">
    <header className="personal-day-heading">
      <h2><Link2 aria-hidden="true" />업무 바로가기</h2>
      {c.role === "admin" && <Link className="widget-link" href={`/app/${c.workspace.id}/settings?year=${c.year?.year}#school-links`}>
        바로가기 관리
      </Link>}
    </header>
    {c.schoolLinksError && <p className="personal-widget-note" role="status">등록된 바로가기를 불러오지 못했습니다.</p>}
    {items.length > 0 ? <ShortcutItems links={items.slice(0, previewLimit)} />
      : !c.schoolLinksError && <p className="personal-widget-note">등록된 바로가기가 없습니다.</p>}
    {items.length > previewLimit && <Disclosure label={`바로가기 더 보기 (${items.length - previewLimit}개)`} compact>
      <ShortcutItems links={items.slice(previewLimit)} />
    </Disclosure>}
  </section>;
}

export function SchoolLinkSettings({ context: c }: { context: Context }) {
  const [editing, setEditing] = useState<Partial<SchoolLink> | null>(null);
  const [deleting, setDeleting] = useState<SchoolLink | null>(null);
  const write = useMutation();
  const links = c.schoolLinks ?? [];
  return <section className="panel settings-form" id="school-links">
    <div className="personal-day-heading school-shortcut-settings-heading">
      <h2>업무 바로가기</h2>
      <Button type="button" variant="outline" onClick={() => {
        write.setNotice({ message: "", error: false });
        setEditing({ position: Math.min((links.at(-1)?.position ?? 0) + 10, 9999) });
      }}><Plus aria-hidden="true" />바로가기 추가</Button>
    </div>
    {c.schoolLinksError ? <p role="alert">바로가기 목록을 불러오지 못했습니다.</p> : !links.length && <p className="muted">등록된 바로가기가 없습니다.</p>}
    {links.length > 0 && <ul className="school-settings-link-list">{links.map((link) => (
      <li key={link.id}>
        <div><strong>{link.name}</strong>
          <small>{linkCategories[link.category as keyof typeof linkCategories]} · 순서 {link.position}</small></div>
        <Button type="button" variant="ghost" onClick={() => {
          write.setNotice({ message: "", error: false });
          setEditing(link);
        }} aria-label={`${link.name} 수정`}>수정</Button>
        <Button type="button" variant="ghost" onClick={() => {
          write.setNotice({ message: "", error: false });
          setDeleting(link);
        }} aria-label={`${link.name} 삭제`}>삭제</Button>
      </li>
    ))}</ul>}
    {!editing && <InlineNotice mutation={write} />}
    {editing && <Modal open title={editing.id ? "업무 바로가기 수정" : "업무 바로가기 추가"}
      onOpenChange={(open) => { if (!open && !write.pending) setEditing(null); }}>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        write.execute(() => saveSchoolLink({
          workspaceId: c.workspace.id, id: editing.id, name: data.get("name"), url: data.get("url"),
          category: data.get("category"), icon: data.get("icon"), position: Number(data.get("position")),
        }), () => setEditing(null));
      }}>
        <label>링크 이름<input name="name" defaultValue={editing.name} required maxLength={100} /></label>
        <label>URL<input name="url" type="url" defaultValue={editing.url} placeholder="https://" required maxLength={2048} /></label>
        <div className="form-two">
          <label>분류<select name="category" defaultValue={editing.category ?? "common"}>
            {Object.entries(linkCategories).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select></label>
          <label>아이콘<select name="icon" defaultValue={editing.icon ?? "link"}>
            {Object.entries(linkIcons).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select></label>
        </div>
        <label>표시 순서 <input name="position" type="number" min={0} max={9999} required defaultValue={editing.position} /></label>
        <p className="field-hint">숫자가 작은 링크부터 표시됩니다.</p>
        <InlineNotice mutation={write} />
        <SubmitButton pending={write.pending}>저장</SubmitButton>
      </form>
    </Modal>}
    {deleting && <Confirm open title="업무 바로가기 삭제"
      description={`‘${deleting.name}’ 바로가기를 학교 목록에서 삭제할까요?`}
      pending={write.pending} onOpenChange={(open) => { if (!open) setDeleting(null); }}
      onConfirm={() => write.execute(() => deleteSchoolLink(c.workspace.id, deleting.id), () => setDeleting(null), "삭제했습니다.")} />}
  </section>;
}
