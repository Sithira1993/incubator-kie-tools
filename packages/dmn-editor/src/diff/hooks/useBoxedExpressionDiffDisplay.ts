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

import { useMemo } from "react";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
import { DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { buildMergedExpression } from "../buildMergedExpressionModel";
import { drgElementToBoxedExpression } from "../../boxedExpressions/drgElementToBoxedExpression";
import type { DiffResult } from "../types";

export interface UseBoxedExpressionDiffDisplayParams {
  expression: Normalized<BoxedExpression> | undefined;
  isDiffMode: boolean;
  baseModel: Normalized<DmnLatestModel> | undefined;
  activeDrgElementId: string | undefined;
  diffResult: DiffResult | null;
}

/**
 * Computes the merged expression for Boxed Expressions in diff mode.
 * Logic is delegated to specific builders based on expression type.
 */
export function useBoxedExpressionDiffDisplay(
  params: UseBoxedExpressionDiffDisplayParams
): Normalized<BoxedExpression> | undefined {
  const { expression, isDiffMode, baseModel, activeDrgElementId, diffResult } = params;

  return useMemo(() => {
    if (!isDiffMode || !expression || !baseModel || !activeDrgElementId || !diffResult) {
      return expression;
    }

    const nodeDiff = diffResult.nodes.find(
      (n: { id: string }) => n.id === activeDrgElementId || n.id.endsWith("#" + activeDrgElementId)
    );
    const boxedExpressionDiff = nodeDiff?.boxedExpressionDiff;

    if (!boxedExpressionDiff) {
      return expression;
    }

    const baseDrgElement = baseModel.definitions.drgElement?.find(
      (e: { "@_id"?: string }) => e["@_id"] === activeDrgElementId
    );

    if (
      !baseDrgElement ||
      (baseDrgElement.__$$element !== "decision" && baseDrgElement.__$$element !== "businessKnowledgeModel")
    ) {
      return expression;
    }

    const baseExpression = drgElementToBoxedExpression(baseDrgElement);
    if (!baseExpression) {
      return expression;
    }

    return buildMergedExpression(baseExpression, expression, boxedExpressionDiff);
  }, [isDiffMode, expression, baseModel, activeDrgElementId, diffResult]);
}
