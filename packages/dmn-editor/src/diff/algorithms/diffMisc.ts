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
  BoxedFilter,
  BoxedEvery,
  BoxedSome,
  BoxedFor,
  BoxedExpression,
} from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, ConditionalDiff, FilterDiff, EveryDiff, SomeDiff, ForDiff } from "../types";

/**
 * Compares two Conditional expressions and returns a structured diff of their differences.
 *
 * @param condA - The base model Conditional expression
 * @param condB - The changed model Conditional expression
 * @param diffBoxedExpression - Recursive function to diff child expressions
 * @returns A BoxedExpressionDiff object or undefined if identical
 */
export function diffConditional(
  condA: Normalized<BoxedConditional>,
  condB: Normalized<BoxedConditional>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  return diffGenericExpression<BoxedConditional, ConditionalDiff>(condA, condB, "conditional", diffBoxedExpression, {
    if: (e) => e.if?.expression,
    then: (e) => e.then?.expression,
    else: (e) => e.else?.expression,
  });
}

/**
 * Compares two Filter expressions and returns a structured diff of their differences.
 *
 * @param filterA - The base model Filter expression
 * @param filterB - The changed model Filter expression
 * @param diffBoxedExpression - Recursive function to diff child expressions
 * @returns A BoxedExpressionDiff object or undefined if identical
 */
export function diffFilter(
  filterA: Normalized<BoxedFilter>,
  filterB: Normalized<BoxedFilter>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  return diffGenericExpression<BoxedFilter, FilterDiff>(filterA, filterB, "filter", diffBoxedExpression, {
    in: (e) => e.in?.expression,
    match: (e) => e.match?.expression,
  });
}

/**
 * Compares two Every expressions and returns a structured diff of their differences.
 *
 * @param everyA - The base model Every expression
 * @param everyB - The changed model Every expression
 * @param diffBoxedExpression - Recursive function to diff child expressions
 * @returns A BoxedExpressionDiff object or undefined if identical
 */
export function diffEvery(
  everyA: Normalized<BoxedEvery>,
  everyB: Normalized<BoxedEvery>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  return diffGenericExpression<BoxedEvery, EveryDiff>(everyA, everyB, "every", diffBoxedExpression, {
    in: (e) => e.in?.expression,
    satisfies: (e) => e.satisfies?.expression,
  });
}

/**
 * Compares two Some expressions and returns a structured diff of their differences.
 *
 * @param someA - The base model Some expression
 * @param someB - The changed model Some expression
 * @param diffBoxedExpression - Recursive function to diff child expressions
 * @returns A BoxedExpressionDiff object or undefined if identical
 */
export function diffSome(
  someA: Normalized<BoxedSome>,
  someB: Normalized<BoxedSome>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  return diffGenericExpression<BoxedSome, SomeDiff>(someA, someB, "some", diffBoxedExpression, {
    in: (e) => e.in?.expression,
    satisfies: (e) => e.satisfies?.expression,
  });
}

/**
 * Compares two For expressions and returns a structured diff of their differences.
 *
 * @param forA - The base model For expression
 * @param forB - The changed model For expression
 * @param diffBoxedExpression - Recursive function to diff child expressions
 * @returns A BoxedExpressionDiff object or undefined if identical
 */
export function diffFor(
  forA: Normalized<BoxedFor>,
  forB: Normalized<BoxedFor>,
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined
): BoxedExpressionDiff | undefined {
  return diffGenericExpression<BoxedFor, ForDiff>(forA, forB, "for", diffBoxedExpression, {
    in: (e) => e.in?.expression,
    return: (e) => e.return?.expression,
  });
}

type ExpressionExtractor<T> = (expr: Normalized<T>) => Normalized<BoxedExpression> | undefined;

function diffGenericExpression<T extends BoxedExpression, D extends BoxedExpressionDiff>(
  exprA: Normalized<T>,
  exprB: Normalized<T>,
  kind: D["kind"],
  diffBoxedExpression: (
    a: Normalized<BoxedExpression> | undefined,
    b: Normalized<BoxedExpression> | undefined
  ) => BoxedExpressionDiff | undefined,
  extractors: { [key in keyof D]?: ExpressionExtractor<T> }
): BoxedExpressionDiff | undefined {
  if (exprA === exprB) {
    return undefined;
  }

  const result: Partial<D> = { kind } as Partial<D>;
  let hasChanges = false;

  for (const [key, extract] of Object.entries(extractors)) {
    const diff = diffBoxedExpression(
      (extract as ExpressionExtractor<T>)(exprA),
      (extract as ExpressionExtractor<T>)(exprB)
    );
    if (diff) {
      (result as Record<keyof D, BoxedExpressionDiff>)[key as keyof D] = diff;
      hasChanges = true;
    }
  }

  return hasChanges ? (result as D) : undefined;
}
