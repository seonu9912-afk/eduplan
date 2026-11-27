import { departmentBadgeInfo } from "@/lib/department-badge";
import "./department-badge.css";

export function DepartmentBadge({ department }: { department?: string }) {
  const badge = departmentBadgeInfo(department);
  return <span className="schedule-department-badge" data-color={badge.color} title={badge.name} aria-label={badge.name}>{badge.short}</span>;
}
