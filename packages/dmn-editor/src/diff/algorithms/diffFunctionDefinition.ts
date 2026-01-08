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
import { DMN_LATEST__tInformationItem } from "@kie-tools/dmn-marshaller";
import { BoxedFunction, BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, DiffPropertyChange } from "../types";
import { diffArrayElements } from "./diffUtils";
import { getDescriptionText } from "./typeGuards";

/**
 * Compares two Function Definition expressions and returns a structured diff of their differences.
 *
 * Function Definitions consist of formal parameters and a body expression. This function compares:
 * - Formal parameters: names, type references, and parameter reordering
 * - The function body expression
 *
 * @param funcA - The base Function Definition to compare
 * @param funcB - The changed Function Definition to compare
 * @param diffBoxedExpression - Function to recursively diff the function body expression
 * @returns A BoxedExpressionDiff object with kind "functionDefinition" containing detailed changes,
 *          or undefined if the function definitions are identical
 *
 * @remarks
 * - Uses ID-based matching when all parameters have IDs, falls back to index-based matching otherwise
 * - Detects parameter additions, removals, modifications, and reordering
 * - Tracks changes to parameter names and type references
 * - Recursively diffs the function body expression
 */
export function diffFunctionDefinition(
  funcA: Normalized<BoxedFunction>,
  funcB: Normalized<BoxedFunction>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  if (funcA === funcB) {
    return undefined;
  }
  const paramsA = (funcA.formalParameter ?? []) as Normalized<DMN_LATEST__tInformationItem>[];
  const paramsB = (funcB.formalParameter ?? []) as Normalized<DMN_LATEST__tInformationItem>[];

  let hasChanges = false;

  // Check expression-level typeRef (functions don't have @_label)
  let labelChange: DiffPropertyChange | undefined;
  if (funcA["@_label"] !== funcB["@_label"]) {
    labelChange = { property: "label", previousValue: funcA["@_label"], currentValue: funcB["@_label"] };
    hasChanges = true;
  }

  let typeRefChange: DiffPropertyChange | undefined;
  if (funcA["@_typeRef"] !== funcB["@_typeRef"]) {
    typeRefChange = { property: "typeRef", previousValue: funcA["@_typeRef"], currentValue: funcB["@_typeRef"] };
    hasChanges = true;
  }

  const descA = getDescriptionText(funcA);
  const descB = getDescriptionText(funcB);
  let descriptionChange: DiffPropertyChange | undefined;
  if ((descA ?? "") !== (descB ?? "")) {
    descriptionChange = { property: "description", previousValue: descA, currentValue: descB };
    hasChanges = true;
  }

  const {
    added,
    removed,
    modified,
    hasChanges: paramsHaveChanges,
  } = diffArrayElements(
    paramsA,
    paramsB,
    (p) => p["@_id"],
    (paramA, paramB, indexA, indexB) => {
      const changes: DiffPropertyChange[] = [];
      if (paramA["@_name"] !== paramB["@_name"]) {
        changes.push({ property: "name", previousValue: paramA["@_name"], currentValue: paramB["@_name"] });
      }
      if (paramA["@_typeRef"] !== paramB["@_typeRef"]) {
        changes.push({ property: "typeRef", previousValue: paramA["@_typeRef"], currentValue: paramB["@_typeRef"] });
      }
      const descA = paramA.description?.__$$text;
      const descB = paramB.description?.__$$text;
      if (descA !== descB) {
        changes.push({ property: "description", previousValue: descA, currentValue: descB });
      }

      let indexChange: DiffPropertyChange | undefined;
      if (indexA !== undefined && indexB !== undefined && indexA !== indexB) {
        indexChange = { property: "index", previousValue: indexA, currentValue: indexB };
      }

      if (changes.length > 0 || indexChange) {
        return { diffs: changes, index: indexChange };
      }
      return undefined;
    }
  );

  if (paramsHaveChanges) hasChanges = true;

  let kindChange: DiffPropertyChange | undefined;
  if (funcA["@_kind"] !== funcB["@_kind"]) {
    kindChange = { property: "kind", previousValue: funcA["@_kind"], currentValue: funcB["@_kind"] };
    hasChanges = true;
  }

  const exprDiff = diffBoxedExpression(funcA.expression, funcB.expression);
  if (exprDiff) hasChanges = true;

  if (!hasChanges) return undefined;

  return {
    kind: "functionDefinition",
    label: labelChange,
    description: descriptionChange,
    typeRef: typeRefChange,
    parameters: { added, removed, modified },
    kindProperty: kindChange,
    expression: exprDiff,
  };
}
