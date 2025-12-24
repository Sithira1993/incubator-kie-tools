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
import { BoxedList, BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, DiffPropertyChange } from "../types";
import { indexElementsById } from "./diffUtils";

/**
 * Compares two List expressions and returns a structured diff of their differences.
 *
 * List expressions contain an ordered collection of boxed expressions. This function compares:
 * - Individual list items (nested boxed expressions)
 * - Item reordering (when IDs are available)
 * - Item additions and removals
 *
 * @param listA - The base List to compare
 * @param listB - The changed List to compare
 * @param diffBoxedExpression - Function to recursively diff nested boxed expressions
 * @returns A BoxedExpressionDiff object with kind "list" containing detailed changes,
 *          or undefined if the lists are identical
 *
 * @remarks
 * - Uses ID-based matching when all items have IDs, falls back to index-based matching otherwise
 * - Detects item additions, removals, modifications, and reordering
 * - Recursively diffs each list item expression to detect nested changes
 * - Index-based fallback is useful for legacy models or test data without IDs
 */
export function diffList(
  listA: Normalized<BoxedList>,
  listB: Normalized<BoxedList>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  if (listA === listB) {
    return undefined;
  }
  const itemsA = listA.expression ?? [];
  const itemsB = listB.expression ?? [];

  const added: number[] = [];
  const removed: number[] = [];
  const modified: Record<number, { diff?: BoxedExpressionDiff; index?: DiffPropertyChange }> = {};
  let hasChanges = false;

  // Optimization: Try to match by ID first if available
  const { map: mapA, allHaveIds: allHaveIdsA } = indexElementsById(
    itemsA as Normalized<BoxedExpression>[],
    (item) => item["@_id"]
  );
  const { map: mapB, allHaveIds: allHaveIdsB } = indexElementsById(
    itemsB as Normalized<BoxedExpression>[],
    (item) => item["@_id"]
  );

  // Fallback to index-based diff if IDs are missing (e.g. some legacy models)
  if (!allHaveIdsA || !allHaveIdsB) {
    const maxLen = Math.max(itemsA.length, itemsB.length);
    for (let i = 0; i < maxLen; i++) {
      const itemA = itemsA[i] as Normalized<BoxedExpression>;
      const itemB = itemsB[i] as Normalized<BoxedExpression>;

      if (itemA && !itemB) {
        removed.push(i);
        hasChanges = true;
      } else if (!itemA && itemB) {
        added.push(i);
        hasChanges = true;
      } else if (itemA && itemB) {
        const diff = diffBoxedExpression(itemA, itemB);
        if (diff) {
          modified[i] = { diff };
          hasChanges = true;
        }
      }
    }
  } else {
    // ID-based Diff
    // Items in A but not B are removed
    for (const [id, { index }] of mapA) {
      if (!mapB.has(id)) {
        removed.push(index);
        hasChanges = true;
      }
    }

    // Items in B but not A are added
    for (const [id, { index }] of mapB) {
      if (!mapA.has(id)) {
        added.push(index);
        hasChanges = true;
      } else {
        // Exists in both, check for changes
        const { element: itemA, index: indexA } = mapA.get(id)!;
        const { element: itemB, index: indexB } = mapB.get(id)!;

        const diff = diffBoxedExpression(itemA, itemB);
        let indexChange: DiffPropertyChange | undefined;

        if (indexA !== indexB) {
          indexChange = { property: "index", previousValue: indexA, currentValue: indexB };
        }

        if (diff || indexChange) {
          modified[indexB] = { diff, index: indexChange };
          hasChanges = true;
        }
      }
    }
  }

  if (!hasChanges) return undefined;

  return {
    kind: "list",
    items: { added, removed, modified },
  };
}
