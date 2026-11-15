"use client";

import { AnnualAcademic } from "@/components/features/annual-academic";
import { TeachingModule } from "@/components/features/teaching";
import type { Context } from "@/lib/models";

export function RecoveryPreview({ context, section }: { context: Context; section: string }) {
  return section === "teaching"
    ? <TeachingModule context={context} onDirtyChange={() => {}} />
    : <AnnualAcademic context={context} today="2027-03-04" onDirtyChange={() => {}} />;
}
