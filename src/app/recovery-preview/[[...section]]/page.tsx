import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { buildInfo } from "@/lib/build-info";
import { recoveryPreviewContext } from "../fixture";
import { RecoveryPreview } from "../preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "EduPlan 통합 검증 미리보기", robots: { index: false, follow: false } };

export default async function RecoveryPreviewPage({ params }: {
  params: Promise<{ section?: string[] }>;
}) {
  if (buildInfo.deployment !== "preview" && process.env.EDUPLAN_LOCAL_PREVIEW !== "1") notFound();
  const { section: path = [] } = await params;
  const section = path[0] ?? "calendar";
  if (path.length > 1 || !["calendar", "teaching", "curriculum", "operations"].includes(section)) notFound();
  return (
    <div className="workspace-content">
      <header className="page-heading no-print">
        <div>
          <Brand />
          <p>통합 미리보기 · 가상 학교의 조회용 자료</p>
        </div>
        <nav aria-label="통합 미리보기 메뉴" className="heading-actions">
          <Button asChild variant={section === "operations" ? "default" : "outline"}><Link href="/recovery-preview/operations">통합 운영 실습</Link></Button>
          <Button asChild variant={section === "calendar" ? "default" : "outline"}>
            <Link href="/recovery-preview/calendar">학사운영</Link>
          </Button>
          <Button asChild variant={section === "teaching" ? "default" : "outline"}>
            <Link href="/recovery-preview/teaching">수업·평가</Link>
          </Button>
          <Button asChild variant={section === "curriculum" ? "default" : "outline"}>
            <Link href="/recovery-preview/curriculum">교육과정 실습</Link>
          </Button>
        </nav>
      </header>
      <main id="main-content">
        <RecoveryPreview context={recoveryPreviewContext()} section={section} />
      </main>
    </div>
  );
}
