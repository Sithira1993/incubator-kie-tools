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
import { BoxedExpression, BoxedDecisionTable } from "@kie-tools/boxed-expression-component/dist/api";
import {
  DMN15__tDecision,
  DMN15__tBusinessKnowledgeModel,
} from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_5/ts-gen/types";
import { DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { drgElementToBoxedExpression } from "../../boxedExpressions/drgElementToBoxedExpression";
import type { DiffResult } from "../types";
import { DEFAULT_ROW_NUMBER_WIDTH, DEFAULT_COLUMN_WIDTH } from "../constants";

export interface UseDecisionTableDiffWidthsParams {
  baseWidths: Map<string, number[]>;
  isDiffMode: boolean;
  baseModel: Normalized<DmnLatestModel> | undefined;
  activeDrgElementId: string | undefined;
  displayExpression: Normalized<BoxedExpression> | undefined;
  currentExpression: Normalized<BoxedExpression> | undefined;
  diffResult: DiffResult | undefined;
}

/**
 * Computes column widths for Decision Tables in diff mode.
 */
export function useDecisionTableDiffWidths(params: UseDecisionTableDiffWidthsParams): Map<string, number[]> {
  const { baseWidths, isDiffMode, baseModel, activeDrgElementId, displayExpression, currentExpression, diffResult } =
    params;

  return useMemo(() => {
    if (
      !isDiffMode ||
      !baseModel ||
      !activeDrgElementId ||
      !displayExpression ||
      displayExpression.__$$element !== "decisionTable" ||
      !currentExpression ||
      currentExpression.__$$element !== "decisionTable" ||
      !diffResult
    ) {
      return baseWidths;
    }

    const mergedTable = displayExpression as Normalized<BoxedDecisionTable>;
    const currentTable = currentExpression as Normalized<BoxedDecisionTable>;

    const nodeDiff = diffResult.nodes.find(
      (n: { id: string }) => n.id === activeDrgElementId || n.id.endsWith("#" + activeDrgElementId)
    );
    const boxedExpressionDiff = nodeDiff?.boxedExpressionDiff;

    // Return original widths if no Decision Table diff
    if (boxedExpressionDiff?.kind !== "decisionTable") {
      return baseWidths;
    }

    const currentExpressionId = currentTable["@_id"];

    const baseNode = baseModel.definitions.drgElement?.find(
      (e: { "@_id"?: string }) => e["@_id"] === activeDrgElementId
    );
    const baseTable =
      baseNode && (baseNode.__$$element === "decision" || baseNode.__$$element === "businessKnowledgeModel")
        ? (drgElementToBoxedExpression(baseNode) as Normalized<BoxedDecisionTable>)
        : undefined;

    const baseExpressionId = baseTable?.["@_id"];

    const baseWidthsArray = (
      baseModel.definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0]["di:extension"]?.[
        "kie:ComponentsWidthsExtension"
      ]?.["kie:ComponentWidths"] ?? []
    ).reduce((acc: number[], c) => {
      const rawRef = c["@_dmnElementRef"];
      if (!rawRef) return acc;

      const parts = rawRef.split("#");
      const normalizedRef = parts.length > 1 ? parts[parts.length - 1] : rawRef;

      if (normalizedRef === baseExpressionId) {
        return (c["kie:width"] ?? []).map((vv) => (typeof vv.__$$text === "number" ? vv.__$$text : 0));
      }
      return acc;
    }, [] as number[]);

    // Extract current widths array
    const currentWidthsArray = currentExpressionId ? baseWidths.get(currentExpressionId) ?? [] : [];

    // Create ID-to-width lookup map
    const widthLookup = new Map<string, number>();

    /**
     * Builds a lookup map from column ID/name to width value.
     */
    const zipTableWidths = (table: Normalized<BoxedDecisionTable> | undefined, widths: number[]) => {
      if (!table || !widths.length) return;

      let idx = 1; // Skip index 0 (row number column)

      table.input?.forEach((col) => {
        if (idx < widths.length && col["@_id"]) widthLookup.set(col["@_id"], widths[idx]);
        idx++;
      });

      table.output?.forEach((col) => {
        if (idx < widths.length && col["@_id"]) widthLookup.set(col["@_id"], widths[idx]);
        idx++;
      });

      table.annotation?.forEach((col) => {
        if (idx < widths.length && col["@_name"]) widthLookup.set(col["@_name"], widths[idx]);
        idx++;
      });
    };

    zipTableWidths(baseTable, baseWidthsArray);
    zipTableWidths(currentTable, currentWidthsArray);

    // Build new widths array for merged table
    const newWidthsArray: number[] = [];

    // Row number column width
    newWidthsArray.push(currentWidthsArray[0] ?? DEFAULT_ROW_NUMBER_WIDTH);

    /**
     * Resolves the width for a column by checking the lookup map.
     */
    const resolveWidth = (id: string | undefined, name: string | undefined) => {
      if (id && widthLookup.has(id)) return widthLookup.get(id)!;
      if (name && widthLookup.has(name)) return widthLookup.get(name)!;
      return DEFAULT_COLUMN_WIDTH;
    };

    // Add widths for all columns in merged table
    mergedTable.input?.forEach((col) => newWidthsArray.push(resolveWidth(col["@_id"], undefined)));
    mergedTable.output?.forEach((col) => newWidthsArray.push(resolveWidth(col["@_id"], undefined)));
    mergedTable.annotation?.forEach((col) => newWidthsArray.push(resolveWidth(undefined, col["@_name"])));

    // Update the widths map with new array
    const updatedWidths = new Map(baseWidths);
    if (currentExpressionId) {
      updatedWidths.set(currentExpressionId, newWidthsArray);
    }

    return updatedWidths;
  }, [isDiffMode, baseModel, activeDrgElementId, displayExpression, currentExpression, diffResult, baseWidths]);
}
