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

/**
 * Result of indexing elements by their IDs.
 */
export interface IndexedElements<T> {
  /** Map of ID to element and its original index */
  map: Map<string, { element: T; index: number }>;
  /** Whether all elements in the array have IDs */
  allHaveIds: boolean;
}

/**
 * Indexes an array of elements by their IDs for efficient lookup during diffing.
 * This utility is used across diff algorithms to support ID-based matching with
 * index-based fallback when IDs are missing.
 *
 * @param elements - Array of elements to index
 * @param getId - Function to extract the ID from an element
 * @returns Object containing the ID-to-element map and a flag indicating if all elements have IDs
 *
 * @example
 * ```typescript
 * const { map, allHaveIds } = indexElementsById(
 *   contextEntries,
 *   (e) => e.variable?.["@_id"]
 * );
 * ```
 */
export function indexElementsById<T>(elements: T[], getId: (element: T) => string | undefined): IndexedElements<T> {
  const map = new Map<string, { element: T; index: number }>();
  let allHaveIds = true;

  for (let i = 0; i < elements.length; i++) {
    const id = getId(elements[i]);
    if (id) {
      map.set(id, { element: elements[i], index: i });
    } else {
      allHaveIds = false;
    }
  }

  return { map, allHaveIds };
}

/**
 * Generic helper to compare two arrays of elements.
 * It automatically handles the logic for ID-based matching vs Index-based fallback.
 *
 * @param arrA - The base array
 * @param arrB - The changed array
 * @param getId - Function to extract ID from an element
 * @param compareElements - Callback to compare two matched elements. Should return a diff object if they differ, or undefined.
 * @returns Object describing added, removed, and modified elements.
 */
export function diffArrayElements<T, R>(
  arrA: T[],
  arrB: T[],
  getId: (el: T) => string | undefined,
  compareElements: (a: T, b: T, indexA?: number, indexB?: number) => R | undefined
) {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: Record<string, R> = {};
  let hasChanges = false;

  const { map: mapA, allHaveIds: allHaveIdsA } = indexElementsById(arrA, getId);
  const { map: mapB, allHaveIds: allHaveIdsB } = indexElementsById(arrB, getId);

  if (!allHaveIdsA || !allHaveIdsB) {
    // Index-based fallback
    const maxLen = Math.max(arrA.length, arrB.length);
    for (let i = 0; i < maxLen; i++) {
      const elA = arrA[i];
      const elB = arrB[i];

      if (elA && !elB) {
        removed.push(i.toString());
        hasChanges = true;
      } else if (!elA && elB) {
        added.push(i.toString());
        hasChanges = true;
      } else if (elA && elB) {
        const diff = compareElements(elA, elB, i, i);
        if (diff) {
          modified[i.toString()] = diff;
          hasChanges = true;
        }
      }
    }
  } else {
    // ID-based matching
    for (const [id] of mapA) {
      if (!mapB.has(id)) {
        removed.push(id);
        hasChanges = true;
      }
    }

    for (const [id, { element: elB, index: indexB }] of mapB) {
      if (!mapA.has(id)) {
        added.push(id);
        hasChanges = true;
      } else {
        const { element: elA, index: indexA } = mapA.get(id)!;
        const diff = compareElements(elA, elB, indexA, indexB);
        if (diff) {
          modified[id] = diff;
          hasChanges = true;
        }
      }
    }
  }

  return { added, removed, modified, hasChanges };
}
