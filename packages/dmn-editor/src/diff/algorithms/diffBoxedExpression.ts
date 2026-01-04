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
  BoxedConditional,
  BoxedContext,
  BoxedDecisionTable,
  BoxedEvery,
  BoxedExpression,
  BoxedFilter,
  BoxedFor,
  BoxedFunction,
  BoxedInvocation,
  BoxedList,
  BoxedLiteral,
  BoxedRelation,
  BoxedSome,
} from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff } from "../types";
import { diffLiteralExpression } from "./diffLiteralExpression";
import { diffDecisionTable } from "./diffDecisionTable";
import { diffContext } from "./diffContext";
import { diffFunctionDefinition } from "./diffFunctionDefinition";
import { diffList } from "./diffList";
import { diffInvocation } from "./diffInvocation";
import { diffRelation } from "./diffRelation";
import { diffConditional, diffFilter, diffEvery, diffSome, diffFor } from "./diffMisc";

const MAX_RECURSION_DEPTH = 50;

/**
 * Compares two boxed expressions and returns a structured diff representing their differences.
 *
 * This is the main entry point for diffing boxed expressions. It handles type changes
 * (expression replacements) and delegates to specialized diff functions for each expression type.
 *
 * @param exprA - The base model expression to compare
 * @param exprB - The changed model expression to compare
 * @param opts - Options for the diff algorithm
 * @returns A BoxedExpressionDiff object describing the differences, or undefined if expressions are identical
 *
 * @remarks
 * - Returns undefined if both expressions are undefined (no change)
 * - Returns an "expressionReplacement" diff if the expression types differ
 * - Delegates to type-specific diff functions (diffDecisionTable, diffContext, etc.) for same-type comparisons
 * - Supports all DMN boxed expression types: literal, decision table, context, function definition,
 *   list, invocation, relation, conditional, filter, every, some, and for expressions
 */
export function diffBoxedExpression(
  exprA: Normalized<BoxedExpression> | undefined,
  exprB: Normalized<BoxedExpression> | undefined,
  opts?: { currentDepth?: number }
): BoxedExpressionDiff | undefined {
  if (!exprA && !exprB) return undefined;

  const currentDepth = opts?.currentDepth ?? 0;
  if (currentDepth > MAX_RECURSION_DEPTH) {
    return undefined; // Stop recursion
  }

  const typeA = exprA?.__$$element;
  const typeB = exprB?.__$$element;

  if (typeA !== typeB) {
    // When expression types differ, return a full expression replacement so the UI can show complete before/after states.
    return {
      kind: "expressionReplacement",
      previousType: typeA ?? "undefined",
      currentType: typeB ?? "undefined",
      previousExpression: exprA,
      currentExpression: exprB,
    };
  }

  const recursiveDiff = (a: Normalized<BoxedExpression> | undefined, b: Normalized<BoxedExpression> | undefined) =>
    diffBoxedExpression(a, b, { currentDepth: currentDepth + 1 });

  switch (typeA) {
    case "literalExpression":
      return diffLiteralExpression(exprA as Normalized<BoxedLiteral>, exprB as Normalized<BoxedLiteral>);
    case "decisionTable":
      return diffDecisionTable(exprA as Normalized<BoxedDecisionTable>, exprB as Normalized<BoxedDecisionTable>);
    case "context":
      return diffContext(exprA as Normalized<BoxedContext>, exprB as Normalized<BoxedContext>, recursiveDiff);
    case "functionDefinition":
      return diffFunctionDefinition(
        exprA as Normalized<BoxedFunction>,
        exprB as Normalized<BoxedFunction>,
        recursiveDiff
      );
    case "list":
      return diffList(exprA as Normalized<BoxedList>, exprB as Normalized<BoxedList>, recursiveDiff);
    case "invocation":
      return diffInvocation(exprA as Normalized<BoxedInvocation>, exprB as Normalized<BoxedInvocation>, recursiveDiff);
    case "relation":
      return diffRelation(exprA as Normalized<BoxedRelation>, exprB as Normalized<BoxedRelation>, recursiveDiff);
    case "conditional":
      return diffConditional(
        exprA as Normalized<BoxedConditional>,
        exprB as Normalized<BoxedConditional>,
        recursiveDiff
      );
    case "filter":
      return diffFilter(exprA as Normalized<BoxedFilter>, exprB as Normalized<BoxedFilter>, recursiveDiff);
    case "every":
      return diffEvery(exprA as Normalized<BoxedEvery>, exprB as Normalized<BoxedEvery>, recursiveDiff);
    case "some":
      return diffSome(exprA as Normalized<BoxedSome>, exprB as Normalized<BoxedSome>, recursiveDiff);
    case "for":
      return diffFor(exprA as Normalized<BoxedFor>, exprB as Normalized<BoxedFor>, recursiveDiff);
    default:
      return undefined;
  }
}
