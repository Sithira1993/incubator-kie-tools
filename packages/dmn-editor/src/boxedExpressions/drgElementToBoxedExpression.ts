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
import { BoxedExpression, generateUuid } from "@kie-tools/boxed-expression-component/dist/api";
import {
  DMN15__tBusinessKnowledgeModel,
  DMN15__tDecision,
} from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_5/ts-gen/types";

export function drgElementToBoxedExpression(
  expressionHolder:
    | (Normalized<DMN15__tDecision> & { __$$element: "decision" })
    | (Normalized<DMN15__tBusinessKnowledgeModel> & { __$$element: "businessKnowledgeModel" })
): Normalized<BoxedExpression> | undefined {
  if (expressionHolder.__$$element === "businessKnowledgeModel") {
    return expressionHolder.encapsulatedLogic
      ? {
          __$$element: "functionDefinition",
          "@_label": expressionHolder.encapsulatedLogic["@_label"] ?? expressionHolder["@_name"],
          "@_typeRef": expressionHolder.encapsulatedLogic["@_typeRef"] ?? expressionHolder.variable?.["@_typeRef"],
          ...expressionHolder.encapsulatedLogic,
        }
      : {
          __$$element: "functionDefinition",
          "@_id": generateUuid(),
          "@_kind": "FEEL",
          expression: undefined!, // SPEC DISCREPANCY: Starting without an expression gives users the ability to select the expression type.
          formalParameter: [],
          "@_label": expressionHolder["@_name"],
          "@_typeRef": expressionHolder.variable?.["@_typeRef"],
        };
  } else if (expressionHolder.__$$element === "decision") {
    return expressionHolder.expression
      ? {
          ...expressionHolder.expression,
          "@_label":
            expressionHolder?.variable?.["@_name"] ??
            expressionHolder.expression["@_label"] ??
            expressionHolder?.["@_name"],
          "@_typeRef": expressionHolder?.variable
            ? expressionHolder?.variable["@_typeRef"]
            : expressionHolder.expression["@_typeRef"],
        }
      : undefined;
  } else {
    throw new Error(
      `Unknown __$$element of expressionHolder that has an expression '${(expressionHolder as unknown as { __$$element: string }).__$$element}'.`
    );
  }
}
