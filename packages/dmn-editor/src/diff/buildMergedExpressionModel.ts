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

import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import {
  BoxedDecisionTable,
  BoxedExpression,
  BoxedRelation,
  generateUuid,
} from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, DecisionTableDiff, RelationDiff } from "./types";
import {
  DMN15__tUnaryTests,
  DMN15__tLiteralExpression,
  DMN15__tRuleAnnotation,
} from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_5/ts-gen/types";
import { DEFAULT_REMOVED_INPUT_CELL_VALUE, DEFAULT_REMOVED_OUTPUT_CELL_VALUE } from "./constants";

/**
 * Metadata for removed elements in diff visualization.
 */
export interface RemovedItemMetadata {
  __isRemoved: true;
  __removedType: "row" | "column";
}

/**
 * Builds a merged Boxed Expression that includes removed rows/columns/entries.
 */
export function buildMergedExpression(
  baseExpression: Normalized<BoxedExpression> | undefined,
  currentExpression: Normalized<BoxedExpression> | undefined,
  diff: BoxedExpressionDiff
): Normalized<BoxedExpression> | undefined {
  if (!currentExpression) {
    return undefined;
  }

  if (diff.kind === "decisionTable" && currentExpression.__$$element === "decisionTable") {
    return buildMergedDecisionTable(baseExpression as Normalized<BoxedDecisionTable>, currentExpression, diff);
  }

  if (diff.kind === "relation" && currentExpression.__$$element === "relation") {
    return buildMergedRelation(baseExpression as Normalized<BoxedRelation>, currentExpression, diff);
  }

  return currentExpression;
}

/**
 * Builds a merged Decision Table that includes removed rows/columns.
 *
 * Algorithm:
 * 1. Start with current model (priority to changed model)
 * 2. Add removed columns/rows as ghosts at their original positions
 * 3. Backfill cells for removed columns in all rows
 */
export function buildMergedDecisionTable(
  baseExpression: Normalized<BoxedDecisionTable> | undefined,
  currentExpression: Normalized<BoxedDecisionTable> | undefined,
  diff: DecisionTableDiff
): Normalized<BoxedDecisionTable> | undefined {
  if (!currentExpression || !baseExpression) {
    return currentExpression;
  }

  const hasRemovedRows = diff.rules.removed.length > 0;
  const hasRemovedColumns =
    diff.input.removed.length > 0 || diff.output.removed.length > 0 || (diff.annotation?.removed.length ?? 0) > 0;

  if (!hasRemovedRows && !hasRemovedColumns) {
    return currentExpression;
  }

  const merged: Normalized<BoxedDecisionTable> = structuredClone(currentExpression);

  // Step 1: Merge columns
  if (hasRemovedColumns) {
    merged.input = mergeOrderedList(
      baseExpression.input ?? [],
      merged.input ?? [],
      diff.input.removed,
      "@_id",
      "column"
    ) as typeof merged.input;

    merged.output = mergeOrderedList(
      baseExpression.output ?? [],
      merged.output ?? [],
      diff.output.removed,
      "@_id",
      "column"
    ) as typeof merged.output;

    if (diff.annotation?.removed.length) {
      merged.annotation = mergeOrderedList(
        baseExpression.annotation ?? [],
        merged.annotation ?? [],
        diff.annotation.removed,
        "@_name",
        "column"
      ) as typeof merged.annotation;
    }
  }

  // Step 2: Merge rows
  if (hasRemovedRows) {
    merged.rule = mergeOrderedList(baseExpression.rule ?? [], merged.rule ?? [], diff.rules.removed, "@_id", "row");
  }

  // Step 3: Backfill cells for removed columns in all rows
  if (hasRemovedColumns && merged.rule) {
    const baseRuleMap = new Map(baseExpression.rule?.map((r) => [r["@_id"], r]) ?? []);
    const baseInputIndexById = new Map(baseExpression.input?.map((col, idx) => [col["@_id"], idx]) ?? []);
    const baseOutputIndexById = new Map(baseExpression.output?.map((col, idx) => [col["@_id"], idx]) ?? []);
    const baseAnnotationIndexByName = new Map(baseExpression.annotation?.map((col, idx) => [col["@_name"], idx]) ?? []);

    merged.rule.forEach((rule) => {
      const ruleId = rule["@_id"];
      if (!ruleId) return;

      const baseRule = baseRuleMap.get(ruleId);

      // Backfill input cells at correct positions
      diff.input.removed.forEach((removedColId) => {
        const baseColIndex = baseInputIndexById.get(removedColId);
        if (baseColIndex !== undefined) {
          const originalValue =
            baseRule?.inputEntry?.[baseColIndex] ??
            ({ text: { __$$text: DEFAULT_REMOVED_INPUT_CELL_VALUE } } as Normalized<DMN15__tUnaryTests>);

          // Find position of this removed column in merged.input
          const mergedColIndex = merged.input?.findIndex((col) => col["@_id"] === removedColId) ?? -1;
          if (mergedColIndex !== -1) {
            if (!rule.inputEntry) rule.inputEntry = [];
            rule.inputEntry.splice(mergedColIndex, 0, structuredClone(originalValue));
          }
        }
      });

      // Backfill output cells at correct positions
      diff.output.removed.forEach((removedColId) => {
        const baseColIndex = baseOutputIndexById.get(removedColId);
        if (baseColIndex !== undefined) {
          const originalValue =
            baseRule?.outputEntry?.[baseColIndex] ??
            ({ text: { __$$text: DEFAULT_REMOVED_OUTPUT_CELL_VALUE } } as Normalized<DMN15__tLiteralExpression>);

          // Find position of this removed column in merged.output
          const mergedColIndex = merged.output?.findIndex((col) => col["@_id"] === removedColId) ?? -1;
          if (mergedColIndex !== -1) {
            if (!rule.outputEntry) rule.outputEntry = [];
            rule.outputEntry.splice(mergedColIndex, 0, structuredClone(originalValue));
          }
        }
      });

      // Backfill annotation cells at correct positions
      diff.annotation?.removed.forEach((removedColName) => {
        const baseColIndex = baseAnnotationIndexByName.get(removedColName);
        if (baseColIndex !== undefined) {
          const originalValue =
            baseRule?.annotationEntry?.[baseColIndex] ??
            ({ text: { __$$text: DEFAULT_REMOVED_OUTPUT_CELL_VALUE } } as Normalized<DMN15__tRuleAnnotation>);

          // Find position of this removed column in merged.annotation
          const mergedColIndex = merged.annotation?.findIndex((col) => col["@_name"] === removedColName) ?? -1;
          if (mergedColIndex !== -1) {
            if (!rule.annotationEntry) rule.annotationEntry = [];
            rule.annotationEntry.splice(mergedColIndex, 0, structuredClone(originalValue));
          }
        }
      });
    });
  }

  console.log("MERGED DECISION TABLE:", JSON.stringify(merged, null, 2));

  return merged;
}

/**
 * Builds a merged Relation that includes removed rows/columns.
 *
 * Algorithm:
 * 1. Start with current model (priority to changed model)
 * 2. Add removed columns/rows as ghosts at their original positions
 * 3. Backfill cells for all rows to match merged columns
 */
export function buildMergedRelation(
  baseExpression: Normalized<BoxedRelation> | undefined,
  currentExpression: Normalized<BoxedRelation> | undefined,
  diff: RelationDiff
): Normalized<BoxedRelation> | undefined {
  if (!currentExpression || !baseExpression) {
    return currentExpression;
  }

  const hasRemovedRows = diff.rows.removed.length > 0;
  const hasRemovedColumns = diff.columns.removed.length > 0;

  if (!hasRemovedRows && !hasRemovedColumns) {
    return currentExpression;
  }

  const merged: Normalized<BoxedRelation> = structuredClone(currentExpression);

  // Step 1: Merge columns
  if (hasRemovedColumns) {
    merged.column = mergeOrderedList(
      baseExpression.column ?? [],
      merged.column ?? [],
      diff.columns.removed,
      "@_id",
      "column"
    ) as typeof merged.column;
  }

  // Step 2: Merge rows
  if (hasRemovedRows) {
    merged.row = mergeOrderedList(
      baseExpression.row ?? [],
      merged.row ?? [],
      diff.rows.removed,
      "@_id",
      "row"
    ) as typeof merged.row;
  }

  // Backfill cells for all rows to match merged columns
  if (merged.row && merged.column) {
    const baseRowMap = new Map(baseExpression.row?.map((r) => [r["@_id"], r]) ?? []);
    const currentRowMap = new Map(currentExpression.row?.map((r) => [r["@_id"], r]) ?? []);
    const baseColIndexById = new Map(baseExpression.column?.map((c, i) => [c["@_id"], i]) ?? []);
    const currentColIndexById = new Map(currentExpression.column?.map((c, i) => [c["@_id"], i]) ?? []);

    const addedColumnIds = new Set(diff.columns.added);
    const removedColumnIds = new Set(diff.columns.removed);
    const addedRowIds = new Set(diff.rows.added);
    const removedRowIds = new Set(diff.rows.removed);

    merged.row = merged.row.map((row) => {
      const rowId = row["@_id"];
      if (!rowId) return row;

      const isRemovedRow = removedRowIds.has(rowId);
      const isAddedRow = addedRowIds.has(rowId);

      const newExpressionList: Normalized<BoxedExpression>[] = [];

      // Determine correct cell value for each column
      merged.column?.forEach((col) => {
        const colId = col["@_id"];
        if (!colId) return;

        const isRemovedColumn = removedColumnIds.has(colId);
        const isAddedColumn = addedColumnIds.has(colId);

        // Decision tree based on diff information
        if (isRemovedColumn) {
          // Get from base model
          const baseRow = baseRowMap.get(rowId);
          const baseColIndex = baseColIndexById.get(colId);
          if (baseRow && baseColIndex !== undefined && baseRow.expression?.[baseColIndex]) {
            newExpressionList.push(structuredClone(baseRow.expression[baseColIndex]) as Normalized<BoxedExpression>);
          } else {
            // Removed column + added row = empty cell
            newExpressionList.push({
              __$$element: "literalExpression",
              "@_id": generateUuid(),
              text: { __$$text: "" },
            } as unknown as Normalized<BoxedExpression>);
          }
        } else if (isAddedColumn) {
          // Added column: create NEW cell with NEW ID (don't reuse cell from current model)
          const currentRow = currentRowMap.get(rowId);
          const currentColIndex = currentColIndexById.get(colId);

          if (currentRow && currentColIndex !== undefined && currentRow.expression?.[currentColIndex]) {
            const currentCell = currentRow.expression[currentColIndex];

            // Clone the cell but with a NEW ID to prevent false "modified" detection
            if (currentCell.__$$element === "literalExpression") {
              newExpressionList.push({
                __$$element: "literalExpression",
                "@_id": generateUuid(),
                text: { __$$text: currentCell.text?.__$$text ?? "" },
              } as unknown as Normalized<BoxedExpression>);
            } else {
              // For non-literal expressions, clone the entire structure with new ID
              const clonedCell = structuredClone(currentCell) as Normalized<BoxedExpression>;
              clonedCell["@_id"] = generateUuid();
              newExpressionList.push(clonedCell);
            }
          } else {
            // Added column + removed row = empty
            newExpressionList.push({
              __$$element: "literalExpression",
              "@_id": generateUuid(),
              text: { __$$text: "" },
            } as unknown as Normalized<BoxedExpression>);
          }
        } else if (isRemovedRow) {
          // Removed row: always get from base model
          const baseRow = baseRowMap.get(rowId);
          const baseColIndex = baseColIndexById.get(colId);
          if (baseRow && baseColIndex !== undefined && baseRow.expression?.[baseColIndex]) {
            newExpressionList.push(structuredClone(baseRow.expression[baseColIndex]) as Normalized<BoxedExpression>);
          } else {
            // Should not happen, but handle gracefully
            newExpressionList.push({
              __$$element: "literalExpression",
              "@_id": generateUuid(),
              text: { __$$text: "" },
            } as unknown as Normalized<BoxedExpression>);
          }
        } else if (isAddedRow) {
          // Added row: create NEW cells with NEW IDs (same as added columns)
          const currentRow = currentRowMap.get(rowId);
          const currentColIndex = currentColIndexById.get(colId);

          if (currentRow && currentColIndex !== undefined && currentRow.expression?.[currentColIndex]) {
            const currentCell = currentRow.expression[currentColIndex];

            // Clone the cell but with a NEW ID to prevent false "modified" detection
            if (currentCell.__$$element === "literalExpression") {
              newExpressionList.push({
                __$$element: "literalExpression",
                "@_id": generateUuid(),
                text: { __$$text: currentCell.text?.__$$text ?? "" },
              } as unknown as Normalized<BoxedExpression>);
            } else {
              // For non-literal expressions, clone the entire structure with new ID
              const clonedCell = structuredClone(currentCell) as Normalized<BoxedExpression>;
              clonedCell["@_id"] = generateUuid();
              newExpressionList.push(clonedCell);
            }
          } else {
            // Should not happen, but handle gracefully
            newExpressionList.push({
              __$$element: "literalExpression",
              "@_id": generateUuid(),
              text: { __$$text: "" },
            } as unknown as Normalized<BoxedExpression>);
          }
        } else {
          // Both row and column exist in base and current: get from current (may be modified or unchanged)
          const currentRow = currentRowMap.get(rowId);
          const currentColIndex = currentColIndexById.get(colId);
          if (currentRow && currentColIndex !== undefined && currentRow.expression?.[currentColIndex]) {
            newExpressionList.push(currentRow.expression[currentColIndex] as Normalized<BoxedExpression>);
          } else {
            // Fallback to base if not in current (shouldn't happen for existing row+column)
            const baseRow = baseRowMap.get(rowId);
            const baseColIndex = baseColIndexById.get(colId);
            if (baseRow && baseColIndex !== undefined && baseRow.expression?.[baseColIndex]) {
              newExpressionList.push(structuredClone(baseRow.expression[baseColIndex]) as Normalized<BoxedExpression>);
            } else {
              newExpressionList.push({
                __$$element: "literalExpression",
                "@_id": generateUuid(),
                text: { __$$text: "" },
              } as unknown as Normalized<BoxedExpression>);
            }
          }
        }
      });

      row.expression = newExpressionList;
      return row;
    });
  }

  console.log("MERGED RELATION:", JSON.stringify(merged, null, 2));

  return merged;
}

/**
 * Merges an ordered list by inserting removed items at their original positions.
 *
 * Simple algorithm:
 * 1. Start with current items
 * 2. For each removed item from base:
 *    - Find its position in base
 *    - Find the nearest predecessor that exists in merged
 *    - Insert after the predecessor (or at original position if no predecessor)
 */
function mergeOrderedList<T extends Record<string, unknown>>(
  baseItems: Normalized<T>[],
  currentItems: Normalized<T>[],
  removedIds: string[],
  idKey: "@_id" | "@_name",
  removedType: "row" | "column"
): Normalized<T>[] {
  const merged = [...currentItems];

  baseItems.forEach((baseItem, baseIndex) => {
    const itemId = baseItem[idKey] as string | undefined;
    if (!itemId || !removedIds.includes(itemId)) {
      return;
    }

    // Find where to insert: after the nearest predecessor that exists in merged
    let insertAfterIndex = -1;
    for (let i = baseIndex - 1; i >= 0; i--) {
      const predecessorId = baseItems[i][idKey] as string | undefined;
      if (predecessorId) {
        const foundIndex = merged.findIndex((item) => item[idKey] === predecessorId);
        if (foundIndex !== -1) {
          insertAfterIndex = foundIndex;
          break;
        }
      }
    }

    // Create ghost item
    const ghost: Normalized<T> & RemovedItemMetadata = structuredClone(baseItem) as Normalized<T> & RemovedItemMetadata;
    ghost.__isRemoved = true;
    ghost.__removedType = removedType;

    // Insert at the right position
    if (insertAfterIndex !== -1) {
      merged.splice(insertAfterIndex + 1, 0, ghost);
    } else {
      // No predecessor found, insert at original position or start
      const insertIndex = Math.min(baseIndex, merged.length);
      merged.splice(insertIndex, 0, ghost);
    }
  });

  return merged;
}

/**
 * Type guard to check if an element is marked as removed.
 */
export function isRemovedElement(element: unknown): element is { __isRemoved: true } {
  return typeof element === "object" && element !== null && "__isRemoved" in element && element.__isRemoved === true;
}
