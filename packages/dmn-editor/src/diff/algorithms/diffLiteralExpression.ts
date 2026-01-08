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
import { BoxedLiteral } from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff } from "../types";

/**
 * Compares two Literal Expressions and returns a structured diff of their differences.
 *
 * @param exprA - The base Literal Expression to compare
 * @param exprB - The changed Literal Expression to compare
 * @returns A BoxedExpressionDiff object or undefined if identical
 */
export function diffLiteralExpression(
  exprA: Normalized<BoxedLiteral>,
  exprB: Normalized<BoxedLiteral>
): BoxedExpressionDiff | undefined {
  if (exprA === exprB) {
    return undefined;
  }
  const textA = exprA.text?.__$$text;
  const textB = exprB.text?.__$$text;

  if (textA !== textB) {
    return {
      kind: "literalExpression",
      text: {
        property: "text",
        previousValue: textA,
        currentValue: textB,
      },
    };
  }
  return undefined;
}
