/**
 * A subject may be removed only if no saved/confirmed curriculum document
 * references actual instruction or an elective-choice relationship.
 * Invalid document structures are treated as in use (fail closed).
 */
export function subjectIsUsedInDesign(document: unknown, subjectId: string): boolean {
  if (!document || typeof document !== "object" || Array.isArray(document))
    return true;
  const doc = document as {
    cells?: {subjectId?:string;weekly?:number;manual?:number;adjustments?:{hours?:number}[]}[];
    choiceSets?: {subjectIds?:string[]}[];
  };
  if (!Array.isArray(doc.cells)) return true;
  if (doc.choiceSets?.some(choice=>choice.subjectIds?.includes(subjectId))) return true;
  return doc.cells.some(cell=>cell.subjectId===subjectId && (
    cell.weekly!==0 || cell.manual!==0 ||
    !Array.isArray(cell.adjustments) || cell.adjustments.length>0
  ));
}
