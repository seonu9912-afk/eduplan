"use client";

import { AcademicCalendar } from "@/components/features/academic-calendar";
import { TeachingModule } from "@/components/features/teaching";
import type { Context } from "@/lib/models";

export function RecoveryPreview({ context, section }: { context: Context; section: string }) {
  return section === "teaching"
    ? <TeachingModule context={context} onDirtyChange={() => {}} />
    : <AcademicCalendar context={context} today="2027-03-04" preview />;
}
