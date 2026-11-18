"use client";

import type {Context} from "@/lib/models";
import {CurriculumSimpleV5} from "./curriculum-simple-v5";
import "./curriculum-enhanced.css";
import "./curriculum-workbench.css";

/**
 * Curriculum v5 intentionally exposes only the three teacher-facing steps.
 * Legacy Excel, draft and operating-year data remain untouched in storage
 * and existing feature modules, without duplicating them in the primary menu.
 */
export function Curriculum({context,initialCohort,onDirtyChange}:{
  context:Context;initialCohort?:string;
  onDirtyChange:(dirty:boolean)=>void;
}){
  return <CurriculumSimpleV5 context={context}
    initialCohort={initialCohort} onDirtyChange={onDirtyChange}/>;
}
