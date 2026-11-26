"use client";

import { useEffect } from "react";
import { arrowOffset, nextGridIndex, nextHorizontalIndex, type ArrowKey } from "@/lib/keyboard-navigation";

const arrows = new Set<string>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const focusables = 'button:not([disabled]):not([tabindex="-1"]),a[href]:not([tabindex="-1"]),input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]';

function available(element: HTMLElement) {
  return !element.closest('[hidden],[inert],[aria-hidden="true"]')
    && !element.matches(':disabled,[aria-disabled="true"]')
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== "hidden";
}

function cellControls(cell: HTMLTableCellElement) {
  return Array.from(cell.querySelectorAll<HTMLElement>(focusables))
    .filter((element) => element.closest("td,th") === cell && available(element));
}

function moveInTable(active: HTMLElement, key: ArrowKey): HTMLElement | null {
  const cell = active.closest<HTMLTableCellElement>("tbody td,tbody th");
  const body = cell?.closest("tbody");
  if (!cell || !body || cell.closest("table") !== body.closest("table")) return null;
  const rows = Array.from(body.rows);
  const matrix: HTMLTableCellElement[][] = [];
  for (let r = 0; r < rows.length; r++) {
    matrix[r] ??= [];
    let col = 0;
    for (const current of Array.from(rows[r].cells)) {
      while (matrix[r][col]) col++;
      for (let dy = 0; dy < current.rowSpan; dy++) {
        matrix[r + dy] ??= [];
        for (let dx = 0; dx < current.colSpan; dx++) matrix[r + dy][col + dx] = current;
      }
      col += current.colSpan;
    }
  }
  const originRow = rows.indexOf(cell.parentElement as HTMLTableRowElement);
  const originCol = matrix[originRow]?.indexOf(cell) ?? -1;
  if (originRow < 0 || originCol < 0) return null;
  const { row: dr, column: dc } = arrowOffset(key);
  const controlIndex = cellControls(cell).indexOf(active);
  let r = originRow + dr, c = originCol + dc;
  while (r >= 0 && r < rows.length && c >= 0 && c < (matrix[r]?.length ?? 0)) {
    const nextCell = matrix[r][c];
    if (nextCell && nextCell !== cell) {
      const controls = cellControls(nextCell);
      if (controls.length) {
        const index = dr ? Math.min(Math.max(controlIndex, 0), controls.length - 1) : dc < 0 ? controls.length - 1 : 0;
        return controls[index];
      }
    }
    r += dr;
    c += dc;
  }
  return null;
}

function moveInCalendarGrid(active: HTMLElement, root: HTMLElement, key: ArrowKey) {
  const columns = Number(root.dataset.arrowColumns);
  const children = Array.from(root.children);
  const current = children.indexOf(active);
  if (current < 0) return null;
  const next = nextGridIndex(current, key, children.length, columns);
  if (next === null) return null;
  const element = children[next];
  return element instanceof HTMLElement && element.matches(focusables) && available(element) ? element : null;
}

function moveInLinearGroup(active: HTMLElement, group: HTMLElement, key: ArrowKey) {
  const items = Array.from(group.querySelectorAll<HTMLElement>('button,a[href],[role="tab"]')).filter(available);
  const current = items.indexOf(active);
  if (current < 0) return null;
  const vertical =
    group.dataset.arrowAxis === "layout" &&
    getComputedStyle(group).flexDirection === "column";
  let direction = key;
  if (vertical && key === "ArrowUp") direction = "ArrowLeft";
  if (vertical && key === "ArrowDown") direction = "ArrowRight";
  const next = nextHorizontalIndex(current, direction, items.length);
  return next === null ? null : items[next];
}

function onArrowKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.shiftKey || !arrows.has(event.key)) return;
  if (!(event.target instanceof HTMLElement)) return;
  const active = event.target;
  if (active.isContentEditable) return;
  const isInput = active.matches('input,select,textarea,[contenteditable]');
  // Never take the caret, select-list, number-spinner, or date-picker arrows.
  // Alt+arrows is an explicit navigation shortcut while editing a field.
  if (isInput && !event.altKey) return;
  const key = event.key as ArrowKey;
  const inTable = active.closest("tbody td,tbody th");
  if (inTable) {
    const target = moveInTable(active, key);
    if (target) {
      event.preventDefault();
      target.focus();
      // Only yearly date buttons opt in to selection on arrow movement.
      // The regular click handler retains the unsaved-change confirmation.
      if (target.matches('button[data-arrow-activate="date"]')) target.click();
    }
    else if (event.altKey) event.preventDefault(); // Avoid browser back/forward at the edge.
    return;
  }
  const calendarGrid = active.closest<HTMLElement>("[data-arrow-columns]");
  if (calendarGrid) {
    const target = moveInCalendarGrid(active, calendarGrid, key);
    if (target) { event.preventDefault(); target.focus(); }
    else if (event.altKey) event.preventDefault();
    return;
  }
  const group = active.closest<HTMLElement>(
    '[data-arrow-axis="horizontal"],[data-arrow-axis="layout"],[role="tablist"]',
  );
  if (group) {
    const target = moveInLinearGroup(active, group, key);
    if (target) { event.preventDefault(); target.focus(); }
    else if (event.altKey) event.preventDefault();
    return;
  }
  // In ordinary forms, move between fields only when Alt is held. Plain arrows
  // remain available for text editing and native browser controls.
  const form = event.altKey && isInput ? active.closest<HTMLElement>("fieldset,form") : null;
  if (form) {
    const controls = Array.from(form.querySelectorAll<HTMLElement>(focusables))
      .filter((candidate) => candidate.matches("input,select,textarea") && available(candidate));
    const current = controls.indexOf(active);
    if (current >= 0) {
      const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
      const target = controls[current + step];
      event.preventDefault();
      target?.focus();
    }
  }
}

/** Keyboard navigation is focus-only: Enter/Space still activate the focused control. */
export function KeyboardNavigation() {
  useEffect(() => {
    document.addEventListener("keydown", onArrowKey);
    return () => document.removeEventListener("keydown", onArrowKey);
  }, []);
  return null;
}
