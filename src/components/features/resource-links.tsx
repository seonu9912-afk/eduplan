import { ExternalLink, Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readableResources, resourceLimit, type ResourceLink } from "@/lib/external-links";
import "./school-extras.css";

export function ResourceLinks({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const links = readableResources(value);
  if (!links.length) return null;
  const list = <ul className="resource-links">{links.map(({ name, url }, index) => (
    <li key={index}><a href={url} target="_blank" rel="noopener noreferrer">
      <ExternalLink aria-hidden="true" />{name}<span className="sr-only"> (새 창)</span>
    </a></li>
  ))}</ul>;
  return compact ? <details className="resource-details no-print">
    <summary><Link2 aria-hidden="true" />관련 자료 <span>{links.length}</span></summary>
    {list}
  </details> : <div className="no-print">{list}</div>;
}

export function ResourceLinkEditor({ value, onChange, disabled = false }: {
  value: ResourceLink[];
  onChange: (links: ResourceLink[]) => void;
  disabled?: boolean;
}) {
  return <fieldset className="resource-editor annual-wide" disabled={disabled}>
    <legend>관련 자료</legend>
    {value.map((link, index) => <div className="resource-editor-row" key={index}>
      <label>자료 이름 <input type="text" required maxLength={100} value={link.name}
        onChange={(event) => onChange(value.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>
      <label>자료 URL <input type="url" required maxLength={2048} value={link.url} placeholder="https://"
        onChange={(event) => onChange(value.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} /></label>
      <Button type="button" variant="ghost" size="icon" aria-label={`자료 ${index + 1} 삭제`}
        onClick={() => onChange(value.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    {value.length < resourceLimit && <Button type="button" variant="outline" onClick={() => onChange([...value, { name: "", url: "" }])}>
      <Plus aria-hidden="true" />자료 링크 추가
    </Button>}
  </fieldset>;
}
