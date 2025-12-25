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

import * as React from "react";
import { BoxedExpressionDiff } from "../types";
import { DMN15__tDecisionTable } from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_5/ts-gen/types";
import { DecisionTableDiffOverlay } from "./DecisionTableDiffOverlay";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";

export interface BoxedExpressionDiffOverlayProps {
  diff: BoxedExpressionDiff | undefined;
  expressionHolderId: string;
  baseExpression: Normalized<BoxedExpression> | undefined;
  currentExpression: Normalized<BoxedExpression> | undefined;
}

export function BoxedExpressionDiffOverlay({
  diff,
  expressionHolderId,
  baseExpression,
  currentExpression,
}: BoxedExpressionDiffOverlayProps) {
  if (!diff) {
    return null;
  }

  // Route to Decision Table overlay for both granular diffs and expressionReplacement
  if (
    (diff.kind === "decisionTable" || diff.kind === "expressionReplacement") &&
    currentExpression?.__$$element === "decisionTable"
  ) {
    return (
      <DecisionTableDiffOverlay
        diff={diff}
        expressionHolderId={expressionHolderId}
        baseExpression={baseExpression as DMN15__tDecisionTable}
        currentExpression={currentExpression as DMN15__tDecisionTable}
      />
    );
  }

  // Future: Add other expression overlays here (e.g., Context, Relation, LiteralExpression)

  return null;
}
