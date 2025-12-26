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
import type { BoxedExpressionDiff, RelationDiff, DiffPropertyChange } from "../types";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { BoxedRelation, BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
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

export interface RelationDiffOverlayProps {
  diff: BoxedExpressionDiff;
  expressionHolderId: string;
  baseExpression: Normalized<BoxedRelation> | undefined;
  currentExpression: Normalized<BoxedRelation> | undefined;
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
function formatColumnDiffTooltip(changes: DiffPropertyChange[], type: "previous" | "current"): string {
  return changes
    .map((change, index) => {
      const value = type === "previous" ? change.previousValue : change.currentValue;
      return `${index + 1}. ${change.property}: ${value ?? "(empty)"}`;
    })
    .join("\n");
}

/**
 * Detects if an entire relation was added or removed based on diff structure.
 */
function detectFullRelationChange(diff: RelationDiff): "added" | "removed" | null {
  const hasOnly = (
    section: { added?: string[]; removed?: string[]; modified?: Record<string, unknown> },
    type: "added" | "removed"
  ) => {
    const hasItems = type === "added" ? (section.added?.length ?? 0) > 0 : (section.removed?.length ?? 0) > 0;
    const noOpposite = type === "added" ? (section.removed?.length ?? 0) === 0 : (section.added?.length ?? 0) === 0;
    const noModified = Object.keys(section.modified ?? {}).length === 0;
    return hasItems && noOpposite && noModified;
  };

  const allAdded = hasOnly(diff.columns, "added") && hasOnly(diff.rows, "added");
  const allRemoved = hasOnly(diff.columns, "removed") && hasOnly(diff.rows, "removed");

  if (allAdded) return "added";
  if (allRemoved) return "removed";
  return null;
}

/**
 * Converts an expressionReplacement diff into a RelationDiff
 * where all columns and rows are marked as added or removed.
 */
function convertExpressionReplacementToRelationDiff(
  diff: BoxedExpressionDiff,
  baseExpression: Normalized<BoxedRelation> | undefined,
  currentExpression: Normalized<BoxedRelation> | undefined
): RelationDiff | null {
  if (diff.kind !== "expressionReplacement") {
    return null;
  }

  const isAdded = diff.previousType === "undefined";
  const isDeleted = diff.currentType === "undefined";

  const currentAsBoxed = currentExpression as Normalized<BoxedExpression> | undefined;
  const baseAsBoxed = baseExpression as Normalized<BoxedExpression> | undefined;

  if (isAdded && currentAsBoxed?.__$$element !== "relation") {
    return null;
  }
  if (isDeleted && baseAsBoxed?.__$$element !== "relation") {
    return null;
  }

  const relation = (isAdded ? currentExpression : baseExpression) as Normalized<BoxedRelation>;

  const columnIds = (relation.column ?? []).map((col) => col["@_id"]).filter((id): id is string => !!id);
  const rowIds = (relation.row ?? []).map((row) => row["@_id"]).filter((id): id is string => !!id);

  return {
    kind: "relation",
    columns: {
      added: isAdded ? columnIds : [],
      removed: isDeleted ? columnIds : [],
      modified: {},
    },
    rows: {
      added: isAdded ? rowIds : [],
      removed: isDeleted ? rowIds : [],
      modified: {},
    },
  };
}

export function RelationDiffOverlay({
  diff,
  expressionHolderId,
  baseExpression,
  currentExpression,
}: RelationDiffOverlayProps) {
  const relationDiff = useMemo<RelationDiff | null>(() => {
    if (diff.kind === "expressionReplacement") {
      return convertExpressionReplacementToRelationDiff(diff, baseExpression, currentExpression);
    }
    if (diff.kind === "relation") {
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
    if (!relationDiff) {
      return;
    }

    if (!styleElementRef.current) {
      styleElementRef.current = document.createElement("style");
      styleElementRef.current.id = `dmn-diff-overlay-${expressionHolderId}`;
      document.head.appendChild(styleElementRef.current);
    }

    const styles: string[] = [];
    diffMapRef.current.clear();

    const getColumnDomIndex = (columnId: string): number | undefined => {
      // In Relation, the first column (index 0) is the row index column.
      // The data columns start at index 1.
      const index = currentExpression?.column?.findIndex((col) => col["@_id"] === columnId);
      return index !== undefined && index >= 0 ? index + 1 : undefined; // +1 for row index column
    };

    // Detect full relation add/remove
    const fullRelationChange = detectFullRelationChange(relationDiff);

    if (fullRelationChange) {
      const backgroundColor = fullRelationChange === "added" ? OVERLAY_ADDED_BG : OVERLAY_REMOVED_BG;
      const borderColor = fullRelationChange === "added" ? OVERLAY_ADDED_BORDER : OVERLAY_REMOVED_BORDER;
      const opacity = fullRelationChange === "added" ? 1 : OVERLAY_REMOVED_OPACITY;

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

    // Columns
    const addColumnStyles = (ids: string[], styleType: "added" | "removed") => {
      ids.forEach((columnId) => {
        const domIndex = getColumnDomIndex(columnId);
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

    addColumnStyles(relationDiff.columns?.added ?? [], "added");
    addColumnStyles(relationDiff.columns?.removed ?? [], "removed");

    // Modified Columns
    Object.entries(relationDiff.columns?.modified ?? {}).forEach(([columnId, changes]) => {
      const domIndex = getColumnDomIndex(columnId);
      if (domIndex !== undefined) {
        const sanitizedId = sanitizeForCSS(columnId);

        diffMapRef.current.set(`class-${sanitizedId}`, {
          previous: formatColumnDiffTooltip(changes, "previous"),
          current: formatColumnDiffTooltip(changes, "current"),
        });

        styles.push(`
           th.${sanitizedId} {
             background-color: ${OVERLAY_MODIFIED_BG} !important;
             border: 2px solid ${OVERLAY_MODIFIED_BORDER} !important;
             cursor: pointer !important;
           }
           th.${sanitizedId}::after {
              content: " (Modified)";
              font-size: 0.8em;
              color: ${OVERLAY_MODIFIED_TEXT};
           }
         `);
      }
    });

    // Rows
    (relationDiff.rows?.removed ?? []).forEach((ruleId) => {
      const sanitizedRuleId = sanitizeForCSS(ruleId);
      styles.push(`
          tr.${sanitizedRuleId} {
            background-color: ${OVERLAY_REMOVED_BG} !important;
            border-left: 4px solid ${OVERLAY_REMOVED_BORDER} !important;
            opacity: ${OVERLAY_REMOVED_OPACITY};
          }
          tr.${sanitizedRuleId} td {
             background-color: transparent !important;
          }
       `);
    });

    (relationDiff.rows?.added ?? []).forEach((ruleId) => {
      const sanitizedRuleId = sanitizeForCSS(ruleId);
      styles.push(`
          tr.${sanitizedRuleId} {
             background-color: ${OVERLAY_ADDED_BG} !important;
             border-left: 4px solid ${OVERLAY_ADDED_BORDER} !important;
          }
          tr.${sanitizedRuleId} td {
             background-color: transparent !important;
          }
       `);
    });

    // Modified Rows (Cells)
    Object.entries(relationDiff.rows?.modified ?? {}).forEach(([ruleId, rowDiff]) => {
      const sanitizedRuleId = sanitizeForCSS(ruleId);

      Object.entries(rowDiff.cells ?? {}).forEach(([columnIndexStr, cellDiff]) => {
        const columnIndexInCurrentModel = parseInt(columnIndexStr, 10);

        // Map cell index from current model to merged model
        const columnId = currentExpression?.column?.[columnIndexInCurrentModel]?.["@_id"];
        if (!columnId) {
          return;
        }

        const removedColumnIds = new Set(relationDiff.columns?.removed ?? []);

        // Count removed columns before this column
        let removedBeforeCount = 0;
        if (baseExpression?.column) {
          let foundTarget = false;
          for (const baseCol of baseExpression.column) {
            const baseColId = baseCol["@_id"];
            if (baseColId === columnId) {
              foundTarget = true;
              break;
            }
            if (baseColId && removedColumnIds.has(baseColId)) {
              removedBeforeCount++;
            }
          }
        }

        const domIndexInMergedModel = columnIndexInCurrentModel + removedBeforeCount + 1;

        let diffData: CellDiffData | undefined;
        if (cellDiff.kind === "literalExpression") {
          const textChange = cellDiff.text;
          if (textChange) {
            diffData = {
              previous: String(textChange.previousValue ?? ""),
              current: String(textChange.currentValue ?? ""),
            };
          }
        }

        if (diffData) {
          diffMapRef.current.set(`${ruleId}-${domIndexInMergedModel}`, diffData);

          styles.push(`
             tr.${sanitizedRuleId} td[data-ouia-component-id="expression-column-${domIndexInMergedModel}"] {
                background-color: ${OVERLAY_MODIFIED_BG} !important;
                border: 2px solid ${OVERLAY_MODIFIED_BORDER} !important;
                cursor: pointer !important;
              }
           `);
        }
      });
    });

    styleElementRef.current.textContent = styles.join("\n");

    const handleMouseMove = throttle((e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Tooltip for Headers
      const th = target.closest("th");
      if (th) {
        const classList = Array.from(th.classList);
        for (const cls of classList) {
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

      // Tooltip for Cells
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

    const tableContainer = document.querySelector(`[data-expression-holder-id="${expressionHolderId}"]`);

    if (tableContainer) {
      tableContainer.addEventListener("mousemove", handleMouseMove);
    }
    const diffMap = diffMapRef.current;

    return () => {
      setTooltip({ isVisible: false, x: 0, y: 0, previousValue: "", newValue: "" });
      diffMap.clear();

      if (styleElementRef.current) {
        styleElementRef.current.remove();
        styleElementRef.current = null;
      }
      if (tableContainer) {
        tableContainer.removeEventListener("mousemove", handleMouseMove);
      }
    };
  }, [relationDiff, expressionHolderId, currentExpression]);

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
