import { PersonalDay } from "./personal-day";
import type { ReactNode } from "react";
import type { Context } from "@/lib/models";
import { SchoolShortcuts } from "./school-links";

export function Dashboard({ context: c, today, publicData }: { context: Context; today: string; publicData?: ReactNode }) {
  return <>
    <h1 className="sr-only">홈</h1>
    <PersonalDay context={c} today={today} publicData={publicData} />
    <div className="home-shortcuts"><SchoolShortcuts context={c} /></div>
  </>;
}
