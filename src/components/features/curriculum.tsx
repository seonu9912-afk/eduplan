"use client";

import type {Context} from "@/lib/models";
import {CurriculumSimpleFlow} from "./curriculum-simple-flow";
import "./curriculum-enhanced.css";

/**
 * Curriculum entrypoint: one guided sequence instead of parallel legacy menus.
 * Previous source components and all persisted rows remain untouched.
 */
export function Curriculum({context,initialCohort,onDirtyChange}:{
  context:Context;initialCohort?:string;
  onDirtyChange:(dirty:boolean)=>void;
}){
  return <CurriculumSimpleFlow key={context.workspace.id} context={context}
    initialCohort={Number(initialCohort)||undefined}
    onDirtyChange={onDirtyChange}/>;
}
