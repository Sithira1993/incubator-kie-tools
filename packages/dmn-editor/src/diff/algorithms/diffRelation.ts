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
import { DMN_LATEST__tInformationItem, DMN_LATEST__tList } from "@kie-tools/dmn-marshaller";
import { BoxedRelation, BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, DiffPropertyChange } from "../types";
import { diffArrayElements } from "./diffUtils";

/**
 * Compares two Relation expressions and returns a structured diff of their differences.
 *
 * Relation expressions represent tabular data with named columns and rows of cells.
 * This function compares:
 * - Columns: names, type references, and column additions/removals
 * - Rows: cell expressions, row additions/removals, and row reordering
 * - Individual cell expressions within each row
 *
 * @param relA - The base Relation to compare
 * @param relB - The changed Relation to compare
 * @param diffBoxedExpression - Function to recursively diff cell expressions
 * @returns A BoxedExpressionDiff object with kind "relation" containing detailed changes,
 *          or undefined if the relations are identical
 *
 * @remarks
 * - Uses ID-based matching when all elements have IDs, falls back to index-based matching otherwise
 * - Detects column additions, removals, and modifications (name and type reference changes)
 * - Detects row additions, removals, modifications, and reordering
 * - Recursively diffs each cell expression to detect nested changes
 * - Cells are compared by column index within each row
 */
export function diffRelation(
  relA: Normalized<BoxedRelation>,
  relB: Normalized<BoxedRelation>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  if (relA === relB) {
    return undefined;
  }
  const colsA = relA.column ?? [];
  const colsB = relB.column ?? [];
  const rowsA = relA.row ?? [];
  const rowsB = relB.row ?? [];

  let hasChanges = false;

  // Check expression-level properties
  let labelChange: DiffPropertyChange | undefined;
  if (relA["@_label"] !== relB["@_label"]) {
    labelChange = { property: "label", previousValue: relA["@_label"], currentValue: relB["@_label"] };
    hasChanges = true;
  }

  let typeRefChange: DiffPropertyChange | undefined;
  if (relA["@_typeRef"] !== relB["@_typeRef"]) {
    typeRefChange = { property: "typeRef", previousValue: relA["@_typeRef"], currentValue: relB["@_typeRef"] };
    hasChanges = true;
  }

  const descA = (relA as any).description?.__$$text;
  const descB = (relB as any).description?.__$$text;
  let descriptionChange: DiffPropertyChange | undefined;
  if ((descA ?? "") !== (descB ?? "")) {
    descriptionChange = { property: "description", previousValue: descA, currentValue: descB };
    hasChanges = true;
  }

  // Columns
  const {
    added: addedCols,
    removed: removedCols,
    modified: modifiedCols,
    hasChanges: columnsHaveChanges,
  } = diffArrayElements(
    colsA as Normalized<DMN_LATEST__tInformationItem>[],
    colsB as Normalized<DMN_LATEST__tInformationItem>[],
    (c) => c["@_id"],
    (colA, colB, indexA, indexB) => {
      const changes: DiffPropertyChange[] = [];
      if (colA["@_name"] !== colB["@_name"]) {
        changes.push({ property: "name", previousValue: colA["@_name"], currentValue: colB["@_name"] });
      }
      if (colA["@_typeRef"] !== colB["@_typeRef"]) {
        changes.push({ property: "typeRef", previousValue: colA["@_typeRef"], currentValue: colB["@_typeRef"] });
      }
      const descA = colA.description?.__$$text;
      const descB = colB.description?.__$$text;
      if (descA !== descB) {
        changes.push({ property: "description", previousValue: descA, currentValue: descB });
      }
      if (changes.length > 0) {
        return changes;
      }
      return undefined;
    }
  );

  if (columnsHaveChanges) hasChanges = true;

  // Create column ID to index mappings
  const colIdToIndexA = new Map<string, number>(colsA.map((col, i) => [col["@_id"] ?? `__col_${i}`, i]));
  const colIdToIndexB = new Map<string, number>(colsB.map((col, i) => [col["@_id"] ?? `__col_${i}`, i]));

  // Extract common column IDs (columns that exist in both models)
  const commonColIds: string[] = [];
  for (const id of colIdToIndexA.keys()) {
    if (colIdToIndexB.has(id)) {
      commonColIds.push(id);
    }
  }

  // Rows
  const {
    added: addedRows,
    removed: removedRows,
    modified: modifiedRows,
    hasChanges: rowsHaveChanges,
  } = diffArrayElements(
    rowsA as Normalized<DMN_LATEST__tList>[],
    rowsB as Normalized<DMN_LATEST__tList>[],
    (r) => r["@_id"],
    (rowA, rowB, indexA, indexB) => {
      const cellDiffs = diffRelationRow(rowA, rowB, commonColIds, colIdToIndexA, colIdToIndexB, diffBoxedExpression);

      let indexChange: DiffPropertyChange | undefined;
      if (indexA !== undefined && indexB !== undefined && indexA !== indexB) {
        indexChange = { property: "index", previousValue: indexA, currentValue: indexB };
      }

      if (Object.keys(cellDiffs).length > 0 || indexChange) {
        return { index: indexChange, cells: cellDiffs };
      }
      return undefined;
    }
  );

  if (rowsHaveChanges) hasChanges = true;

  if (!hasChanges) return undefined;

  return {
    kind: "relation",
    label: labelChange,
    description: descriptionChange,
    typeRef: typeRefChange,
    columns: { added: addedCols, removed: removedCols, modified: modifiedCols },
    rows: { added: addedRows, removed: removedRows, modified: modifiedRows },
  };
}

/**
 * Compares cells in two relation rows by aligning them using column IDs.
 * Only compares cells for columns that exist in both models (common columns).
 * This prevents cascading diffs when columns are added or removed.
 *
 * Falls back to index-based comparison when no columns are defined (edge case).
 *
 * @param rowA - Row from base model
 * @param rowB - Row from changed model
 * @param commonColIds - IDs of columns that exist in both models
 * @param colIdToIndexA - Mapping from column ID to index in base model
 * @param colIdToIndexB - Mapping from column ID to index in changed model
 * @param diffBoxedExpression - Function to diff cell expressions
 * @returns Record mapping cell index (in current model) to diff
 */
function diffRelationRow(
  rowA: Normalized<DMN_LATEST__tList>,
  rowB: Normalized<DMN_LATEST__tList>,
  commonColIds: string[],
  colIdToIndexA: Map<string, number>,
  colIdToIndexB: Map<string, number>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
) {
  const cellDiffs: Record<number, BoxedExpressionDiff> = {};
  const exprsA = (rowA.expression ?? []) as Normalized<BoxedExpression>[];
  const exprsB = (rowB.expression ?? []) as Normalized<BoxedExpression>[];

  // Edge case: If no columns are defined, fall back to index-based comparison
  if (commonColIds.length === 0) {
    const len = Math.max(exprsA.length, exprsB.length);
    for (let i = 0; i < len; i++) {
      const diff = diffBoxedExpression(exprsA[i], exprsB[i]);
      if (diff) {
        cellDiffs[i] = diff;
      }
    }
    return cellDiffs;
  }

  // Only compare cells for columns that exist in both models
  for (const colId of commonColIds) {
    const indexA = colIdToIndexA.get(colId);
    const indexB = colIdToIndexB.get(colId);

    // Skip if mapping doesn't exist (shouldn't happen for common IDs, but safety check)
    if (indexA === undefined || indexB === undefined) {
      continue;
    }

    const diff = diffBoxedExpression(exprsA[indexA], exprsB[indexB]);
    if (diff) {
      // Report change using indexB (current model index) for overlay rendering
      cellDiffs[indexB] = diff;
    }
  }

  return cellDiffs;
}
