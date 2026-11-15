import Link from "next/link";
import { BookOpen } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="EduPlan 홈"
    >
      <span className="brand-symbol">
        <BookOpen size={23} strokeWidth={2.2} />
      </span>
      <span>
        Edu<span className="brand-plan">Plan</span>
      </span>
      <span className="brand-korean">에듀플랜</span>
    </Link>
  );
}
