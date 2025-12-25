/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoxedExpressionDiff, DecisionTableDiff, DecisionTableColumnDiff } from "../types";
import { DMN15__tDecisionTable } from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_5/ts-gen/types";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
import { DiffCellTooltip } from "./DiffCellTooltip";
import { MIN_UUID_CLASS_LENGTH, MOUSEMOVE_THROTTLE_MS } from "../constants";
import {
  OVERLAY_ADDED_BG,
  OVERLAY_ADDED_BORDER,
  OVERLAY_REMOVED_BG,
  OVERLAY_REMOVED_BORDER,
  OVERLAY_REMOVED_TEXT,
  OVERLAY_REMOVED_OPACITY,
  OVERLAY_MODIFIED_BG,
  OVERLAY_MODIFIED_BORDER,
  OVERLAY_MODIFIED_TEXT,
} from "../styles/diffHighlightStyles";
import { throttle, sanitizeForCSS } from "../utils/domUtils";

export interface DecisionTableDiffOverlayProps {
  diff: BoxedExpressionDiff;
  expressionHolderId: string;
  baseExpression: DMN15__tDecisionTable | undefined;
  currentExpression: DMN15__tDecisionTable | undefined;
}

interface TooltipState {
  isVisible: boolean;
  x: number;
  y: number;
  previousValue: string;
  newValue: string;
}

interface CellDiffData {
  previous: string;
  current: string;
}

/**
 * Formats column diff changes into a tooltip string.
 */
function formatColumnDiffTooltip(columnDiff: DecisionTableColumnDiff, type: "previous" | "current"): string {
  return Object.entries(columnDiff)
    .filter(([key]) => key !== "__$$element")
    .map(([key, change], index: number) => {
      const value = type === "previous" ? change?.previousValue : change?.currentValue;
      return `${index + 1}. ${key}: ${value ?? "(empty)"}`;
    })
    .join("\n");
}

/**
 * Detects if an entire table was added or removed based on diff structure.
 */
function detectFullTableChange(diff: DecisionTableDiff): "added" | "removed" | null {
  const hasOnly = (
    section: { added?: string[]; removed?: string[]; modified?: Record<string, unknown> },
    type: "added" | "removed"
  ) => {
    const hasItems = type === "added" ? (section.added?.length ?? 0) > 0 : (section.removed?.length ?? 0) > 0;
    const noOpposite = type === "added" ? (section.removed?.length ?? 0) === 0 : (section.added?.length ?? 0) === 0;
    const noModified = Object.keys(section.modified ?? {}).length === 0;
    return hasItems && noOpposite && noModified;
  };

  const allAdded = hasOnly(diff.input, "added") && hasOnly(diff.output, "added") && hasOnly(diff.rules, "added");
  const allRemoved =
    hasOnly(diff.input, "removed") && hasOnly(diff.output, "removed") && hasOnly(diff.rules, "removed");

  if (allAdded) return "added";
  if (allRemoved) return "removed";
  return null;
}

/**
 * Converts an expressionReplacement diff into a DecisionTableDiff
 * where all columns and rows are marked as added or removed.
 */
function convertExpressionReplacementToDecisionTableDiff(
  diff: BoxedExpressionDiff,
  baseExpression: DMN15__tDecisionTable | undefined,
  currentExpression: DMN15__tDecisionTable | undefined
): DecisionTableDiff | null {
  if (diff.kind !== "expressionReplacement") {
    return null;
  }

  const isAdded = diff.previousType === "undefined";
  const isDeleted = diff.currentType === "undefined";

  const currentAsBoxed = currentExpression as Normalized<BoxedExpression> | undefined;
  const baseAsBoxed = baseExpression as Normalized<BoxedExpression> | undefined;

  if (isAdded && currentAsBoxed?.__$$element !== "decisionTable") {
    return null;
  }
  if (isDeleted && baseAsBoxed?.__$$element !== "decisionTable") {
    return null;
  }

  const table = (isAdded ? currentExpression : baseExpression) as DMN15__tDecisionTable;

  const inputIds = (table.input ?? []).map((col) => col["@_id"]).filter((id): id is string => !!id);
  const outputIds = (table.output ?? []).map((col) => col["@_id"]).filter((id): id is string => !!id);
  const annotationIds = (table.annotation ?? []).map((col) => col["@_name"]).filter((id): id is string => !!id);
  const ruleIds = (table.rule ?? []).map((rule) => rule["@_id"]).filter((id): id is string => !!id);

  return {
    kind: "decisionTable",
    input: {
      added: isAdded ? inputIds : [],
      removed: isDeleted ? inputIds : [],
      modified: {},
    },
    output: {
      added: isAdded ? outputIds : [],
      removed: isDeleted ? outputIds : [],
      modified: {},
    },
    annotation: {
      added: isAdded ? annotationIds : [],
      removed: isDeleted ? annotationIds : [],
      modified: {},
    },
    rules: {
      added: isAdded ? ruleIds : [],
      removed: isDeleted ? ruleIds : [],
      modified: {},
    },
  };
}
/**
 * CSS-based diff overlay for Decision Tables.
 */
export function DecisionTableDiffOverlay({
  diff,
  expressionHolderId,
  baseExpression,
  currentExpression,
}: DecisionTableDiffOverlayProps) {
  // Convert expressionReplacement to DecisionTableDiff if needed
  const decisionTableDiff = useMemo<DecisionTableDiff | null>(() => {
    if (diff.kind === "expressionReplacement") {
      return convertExpressionReplacementToDecisionTableDiff(diff, baseExpression, currentExpression);
    }
    if (diff.kind === "decisionTable") {
      return diff;
    }
    return null;
  }, [diff, baseExpression, currentExpression]);

  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    isVisible: false,
    x: 0,
    y: 0,
    previousValue: "",
    newValue: "",
  });

  const diffMapRef = useRef<Map<string, CellDiffData>>(new Map());

  useEffect(() => {
    if (!decisionTableDiff) {
      return;
    }

    if (!styleElementRef.current) {
      styleElementRef.current = document.createElement("style");
      styleElementRef.current.id = `dmn-diff-overlay-${expressionHolderId}`;
      document.head.appendChild(styleElementRef.current);
    }

    const styles: string[] = [];
    diffMapRef.current.clear();

    const getColumnDomIndex = (columnId: string, type: "input" | "output" | "annotation"): number | undefined => {
      const inputLength = currentExpression?.input?.length ?? 0;
      const outputLength = currentExpression?.output?.length ?? 0;

      if (type === "input") {
        const index = currentExpression?.input?.findIndex((col) => col["@_id"] === columnId);
        return index !== undefined && index >= 0 ? index + 1 : undefined;
      } else if (type === "output") {
        const index = currentExpression?.output?.findIndex((col) => col["@_id"] === columnId);
        return index !== undefined && index >= 0 ? 1 + inputLength + index : undefined;
      } else if (type === "annotation") {
        const index = currentExpression?.annotation?.findIndex((col) => col["@_name"] === columnId);
        return index !== undefined && index >= 0 ? 1 + inputLength + outputLength + index : undefined;
      }
      return undefined;
    };

    // Detect full table add/remove
    const fullTableChange = detectFullTableChange(decisionTableDiff);

    if (fullTableChange) {
      const backgroundColor = fullTableChange === "added" ? OVERLAY_ADDED_BG : OVERLAY_REMOVED_BG;
      const borderColor = fullTableChange === "added" ? OVERLAY_ADDED_BORDER : OVERLAY_REMOVED_BORDER;
      const opacity = fullTableChange === "added" ? 1 : OVERLAY_REMOVED_OPACITY;

      styles.push(`
        [data-expression-holder-id="${expressionHolderId}"] th,
        [data-expression-holder-id="${expressionHolderId}"] td {
          background-color: ${backgroundColor} !important;
          border: 2px solid ${borderColor} !important;
          opacity: ${opacity};
        }
        [data-expression-holder-id="${expressionHolderId}"] table {
          border: 2px solid ${borderColor} !important;
        }
      `);
    }

    const addColumnStyles = (
      ids: string[],
      type: "input" | "output" | "annotation",
      styleType: "added" | "removed"
    ) => {
      ids.forEach((columnId) => {
        if (!columnId || typeof columnId !== "string") return;
        const domIndex = getColumnDomIndex(columnId, type);
        if (domIndex !== undefined) {
          const sanitizedId = sanitizeForCSS(columnId);
          if (styleType === "added") {
            styles.push(`
              th.${sanitizedId},
              td[data-ouia-component-id="expression-column-${domIndex}"] {
                background-color: ${OVERLAY_ADDED_BG} !important;
                border: 2px solid ${OVERLAY_ADDED_BORDER} !important;
              }
            `);
          } else {
            styles.push(`
              th.${sanitizedId},
              td[data-ouia-component-id="expression-column-${domIndex}"] {
                background-color: ${OVERLAY_REMOVED_BG} !important;
                border: 2px solid ${OVERLAY_REMOVED_BORDER} !important;
                opacity: ${OVERLAY_REMOVED_OPACITY};
              }
              th.${sanitizedId}::after {
                 content: " (Removed)";
                 font-size: 0.8em;
                 color: ${OVERLAY_REMOVED_TEXT};
              }
            `);
          }
        }
      });
    };

    addColumnStyles(decisionTableDiff.input?.added ?? [], "input", "added");
    addColumnStyles(decisionTableDiff.output?.added ?? [], "output", "added");
    addColumnStyles(decisionTableDiff.annotation?.added ?? [], "annotation", "added");

    addColumnStyles(decisionTableDiff.input?.removed ?? [], "input", "removed");
    addColumnStyles(decisionTableDiff.output?.removed ?? [], "output", "removed");
    addColumnStyles(decisionTableDiff.annotation?.removed ?? [], "annotation", "removed");

    const addModifiedColumnStyles = (
      modifiedDiffs: Record<string, DecisionTableColumnDiff>,
      type: "input" | "output" | "annotation"
    ) => {
      Object.entries(modifiedDiffs).forEach(([columnId, columnDiff]) => {
        if (!columnId || typeof columnId !== "string") return;
        const domIndex = getColumnDomIndex(columnId, type);
        if (domIndex !== undefined) {
          const sanitizedId = sanitizeForCSS(columnId);

          // Check if column was reordered
          const hasIndexChange = columnDiff.index !== undefined;
          const reorderBadge = hasIndexChange ? " ↕" : "";

          // Store tooltip data
          // Use a class-based key to be robust against header DOM structure (rowspans, nested headers etc)
          diffMapRef.current.set(`class-${sanitizedId}`, {
            previous: formatColumnDiffTooltip(columnDiff, "previous"),
            current: formatColumnDiffTooltip(columnDiff, "current"),
          });

          styles.push(`
             th.${sanitizedId} {
               background-color: ${OVERLAY_MODIFIED_BG} !important;
               border: 2px solid ${OVERLAY_MODIFIED_BORDER} !important;
               cursor: pointer !important;
             }
             th.${sanitizedId}::after {
                content: " (Modified${reorderBadge})";
                font-size: 0.8em;
                color: ${OVERLAY_MODIFIED_TEXT};
             }
           `);
        }
      });
    };

    addModifiedColumnStyles(decisionTableDiff.input?.modified ?? {}, "input");
    addModifiedColumnStyles(decisionTableDiff.output?.modified ?? {}, "output");
    addModifiedColumnStyles(decisionTableDiff.annotation?.modified ?? {}, "annotation");

    Object.entries(decisionTableDiff.rules?.modified ?? {}).forEach(([ruleId, ruleDiff]) => {
      if (!ruleId || typeof ruleId !== "string") return;
      const sanitizedRuleId = sanitizeForCSS(ruleId);

      const resolveColumnId = (
        list: Array<{ "@_id"?: string; "@_name"?: string }> | undefined,
        index: number,
        type: "input" | "output" | "annotation"
      ) => {
        const item = list?.[index];
        return type === "annotation" ? item?.["@_name"] : item?.["@_id"];
      };

      const addEntryStyles = (
        entries: Record<number, import("../types").DiffPropertyChange[]> | undefined,
        type: "input" | "output" | "annotation"
      ) => {
        Object.entries(entries ?? {}).forEach(([currentIndexStr, change]) => {
          const currentIndex = parseInt(currentIndexStr, 10);
          const list =
            type === "input"
              ? currentExpression?.input
              : type === "output"
                ? currentExpression?.output
                : currentExpression?.annotation;

          const columnId = resolveColumnId(list, currentIndex, type);
          const domIndex = columnId ? getColumnDomIndex(columnId, type) : undefined;

          if (domIndex !== undefined) {
            const changes = change as import("../types").DiffPropertyChange[];
            const textChange = changes.find((c) => c.property === "text") || changes[0];
            const oldValue = textChange?.previousValue ?? "";
            const newValue = textChange?.currentValue ?? "";

            diffMapRef.current.set(`${ruleId}-${domIndex}`, {
              previous: String(oldValue),
              current: String(newValue),
            });

            styles.push(`
               tr.${sanitizedRuleId} td[data-ouia-component-id="expression-column-${domIndex}"] {
                  background-color: ${OVERLAY_MODIFIED_BG} !important;
                  border: 2px solid ${OVERLAY_MODIFIED_BORDER} !important;
                  cursor: pointer !important;
                }
              `);
          }
        });
      };

      addEntryStyles(ruleDiff?.inputEntries, "input");
      addEntryStyles(ruleDiff?.outputEntries, "output");
      addEntryStyles(ruleDiff?.annotationEntries, "annotation");
    });

    (decisionTableDiff.rules?.removed ?? []).forEach((ruleId: string) => {
      if (!ruleId || typeof ruleId !== "string") return;
      const sanitizedRuleId = sanitizeForCSS(ruleId);
      styles.push(`
          tr.${sanitizedRuleId} {
            background-color: ${OVERLAY_REMOVED_BG} !important;
            border-left: 4px solid ${OVERLAY_REMOVED_BORDER} !important;
            opacity: ${OVERLAY_REMOVED_OPACITY};
          }
          tr.${sanitizedRuleId} td {
             background-color: transparent !important; /* Allow row color to show */
          }
       `);
    });

    (decisionTableDiff.rules?.added ?? []).forEach((ruleId: string) => {
      if (!ruleId || typeof ruleId !== "string") return;
      const sanitizedRuleId = sanitizeForCSS(ruleId);
      styles.push(`
          tr.${sanitizedRuleId} {
            background-color: ${OVERLAY_ADDED_BG} !important;
            border-left: 4px solid ${OVERLAY_ADDED_BORDER} !important;
          }
          tr.${sanitizedRuleId} td {
             background-color: transparent !important; /* Allow row color to show */
          }
       `);
    });

    styleElementRef.current.textContent = styles.join("\n");

    const handleMouseMove = throttle((e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const th = target.closest("th");
      if (th) {
        const classList = Array.from(th.classList);
        for (const cls of classList) {
          // Look for a key that matches this class
          // This is generally safe because we prefix keys with "class-"
          // and the class itself is sanitized.
          const diffData = diffMapRef.current.get(`class-${cls}`);
          if (diffData) {
            setTooltip({
              isVisible: true,
              x: e.clientX,
              y: e.clientY,
              previousValue: diffData.previous,
              newValue: diffData.current,
            });
            return;
          }
        }
      }

      const td = target.closest("td");
      if (!td) {
        setTooltip((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
        return;
      }

      const tr = td.closest("tr");
      if (!tr) {
        setTooltip((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
        return;
      }

      const ruleId = Array.from(tr.classList).find((cls) => cls.startsWith("_") && cls.length > MIN_UUID_CLASS_LENGTH);
      const columnIdAttr = td.getAttribute("data-ouia-component-id");

      if (!ruleId || !columnIdAttr) {
        setTooltip((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
        return;
      }

      const columnIndexParts = columnIdAttr.split("-");
      const columnIndex = columnIndexParts[columnIndexParts.length - 1];

      const key = `${ruleId}-${columnIndex}`;
      const diffData = diffMapRef.current.get(key);

      if (diffData) {
        setTooltip({
          isVisible: true,
          x: e.clientX,
          y: e.clientY,
          previousValue: diffData.previous,
          newValue: diffData.current,
        });
      } else {
        setTooltip((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
      }
    }, MOUSEMOVE_THROTTLE_MS);

    // Scope mousemove listener to table container
    const tableContainer = document.querySelector(`[data-expression-holder-id="${expressionHolderId}"]`);

    if (tableContainer) {
      tableContainer.addEventListener("mousemove", handleMouseMove);
    }
    const diffMap = diffMapRef.current;

    return () => {
      // Cleanup
      setTooltip({ isVisible: false, x: 0, y: 0, previousValue: "", newValue: "" });
      diffMap.clear();

      if (styleElementRef.current) {
        styleElementRef.current.remove();
        styleElementRef.current = null;
      }
      // Remove listener from the same element it was added to
      if (tableContainer) {
        tableContainer.removeEventListener("mousemove", handleMouseMove);
      }
    };
  }, [decisionTableDiff, expressionHolderId, currentExpression]);

  if (!currentExpression) {
    return null;
  }

  return (
    <DiffCellTooltip
      x={tooltip.x}
      y={tooltip.y}
      previousValue={tooltip.previousValue}
      newValue={tooltip.newValue}
      isVisible={tooltip.isVisible}
    />
  );
}
