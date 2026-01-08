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
import { DMN_LATEST__tContextEntry } from "@kie-tools/dmn-marshaller";
import { BoxedContext, BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, DiffPropertyChange } from "../types";
import { diffArrayElements } from "./diffUtils";
import { getDescriptionText } from "./typeGuards";

/**
 * Compares two Context expressions and returns a structured diff of their differences.
 *
 * Context expressions contain named variables (context entries) and an optional result expression.
 * This function compares:
 * - Context entries: variable names, type references, and their associated expressions
 * - Entry reordering (when IDs are available)
 * - The result expression (the final entry without a variable name)
 *
 * @param ctxA - The base Context expression to compare
 * @param ctxB - The changed Context expression to compare
 * @param diffBoxedExpression - Function to recursively diff nested boxed expressions
 * @returns A BoxedExpressionDiff object with kind "context" containing detailed changes,
 *          or undefined if the contexts are identical
 *
 * @remarks
 * - Separates regular context entries (with variables) from the result entry (without a variable)
 * - Uses ID-based matching when all variables have IDs, falls back to index-based matching otherwise
 * - Detects entry additions, removals, modifications, and reordering
 * - Recursively diffs nested expressions within each context entry
 */
export function diffContext(
  ctxA: Normalized<BoxedContext>,
  ctxB: Normalized<BoxedContext>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  if (ctxA === ctxB) {
    return undefined;
  }
  const entriesA = (ctxA.contextEntry ?? []) as Normalized<DMN_LATEST__tContextEntry>[];
  const entriesB = (ctxB.contextEntry ?? []) as Normalized<DMN_LATEST__tContextEntry>[];

  // Identify result entry (last one if no variable)
  const isResult = (e: Normalized<DMN_LATEST__tContextEntry>) => !e.variable;
  const resultA = entriesA.find(isResult);
  const resultB = entriesB.find(isResult);

  const varsA = entriesA.filter((e: Normalized<DMN_LATEST__tContextEntry>) => !!e.variable);
  const varsB = entriesB.filter((e: Normalized<DMN_LATEST__tContextEntry>) => !!e.variable);

  let hasChanges = false;

  // Check expression-level properties
  let labelChange: DiffPropertyChange | undefined;
  if (ctxA["@_label"] !== ctxB["@_label"]) {
    labelChange = { property: "label", previousValue: ctxA["@_label"], currentValue: ctxB["@_label"] };
    hasChanges = true;
  }

  let typeRefChange: DiffPropertyChange | undefined;
  if (ctxA["@_typeRef"] !== ctxB["@_typeRef"]) {
    typeRefChange = { property: "typeRef", previousValue: ctxA["@_typeRef"], currentValue: ctxB["@_typeRef"] };
    hasChanges = true;
  }

  const descA = getDescriptionText(ctxA);
  const descB = getDescriptionText(ctxB);
  let descriptionChange: DiffPropertyChange | undefined;
  if ((descA ?? "") !== (descB ?? "")) {
    descriptionChange = { property: "description", previousValue: descA, currentValue: descB };
    hasChanges = true;
  }

  const {
    added,
    removed,
    modified,
    hasChanges: contextValuesHaveChanges,
  } = diffArrayElements(
    varsA,
    varsB,
    (e) => e.variable?.["@_id"],
    (entryA, entryB, indexA, indexB) => {
      const varChanges: DiffPropertyChange[] = [];
      const varA = entryA.variable!;
      const varB = (entryB as Normalized<DMN_LATEST__tContextEntry>).variable!;

      if (varA["@_name"] !== varB["@_name"]) {
        varChanges.push({
          property: "name",
          previousValue: varA["@_name"],
          currentValue: varB["@_name"],
        });
      }
      if (varA["@_typeRef"] !== varB["@_typeRef"]) {
        varChanges.push({
          property: "typeRef",
          previousValue: varA["@_typeRef"],
          currentValue: varB["@_typeRef"],
        });
      }
      const descA = varA.description?.__$$text;
      const descB = varB.description?.__$$text;
      if (descA !== descB) {
        varChanges.push({
          property: "description",
          previousValue: descA,
          currentValue: descB,
        });
      }

      const exprDiff = diffBoxedExpression(
        (entryA.expression as Normalized<BoxedExpression>) || undefined,
        ((entryB as Normalized<DMN_LATEST__tContextEntry>).expression as Normalized<BoxedExpression>) || undefined
      );

      let indexChange: DiffPropertyChange | undefined;
      if (indexA !== undefined && indexB !== undefined && indexA !== indexB) {
        indexChange = {
          property: "index",
          previousValue: indexA,
          currentValue: indexB,
        };
      }

      if (varChanges.length > 0 || exprDiff || indexChange) {
        return {
          variable: varChanges.length ? varChanges : undefined,
          expression: exprDiff,
          index: indexChange,
        };
      }
      return undefined;
    }
  );

  if (contextValuesHaveChanges) hasChanges = true;

  const resultDiff = diffBoxedExpression(
    (resultA?.expression as Normalized<BoxedExpression>) || undefined,
    (resultB?.expression as Normalized<BoxedExpression>) || undefined
  );
  if (resultDiff) hasChanges = true;

  if (!hasChanges) return undefined;

  return {
    kind: "context",
    label: labelChange,
    description: descriptionChange,
    typeRef: typeRefChange,
    entries: { added, removed, modified },
    result: resultDiff,
  };
}
