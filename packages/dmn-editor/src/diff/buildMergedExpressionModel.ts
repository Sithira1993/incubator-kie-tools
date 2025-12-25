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
import { BoxedDecisionTable, BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, DecisionTableDiff } from "./types";
import {
  DMN15__tUnaryTests,
  DMN15__tLiteralExpression,
  DMN15__tRuleAnnotation,
} from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_5/ts-gen/types";
import { DEFAULT_REMOVED_INPUT_CELL_VALUE, DEFAULT_REMOVED_OUTPUT_CELL_VALUE } from "./constants";

/**
 * Metadata for removed elements in diff visualization.
 */
export interface RemovedItemMetadata {
  __isRemoved: true;
  __removedType: "row" | "column";
}

/**
 * Builds a merged Boxed Expression that includes removed rows/columns/entries.
 */
export function buildMergedExpression(
  baseExpression: Normalized<BoxedExpression> | undefined,
  currentExpression: Normalized<BoxedExpression> | undefined,
  diff: BoxedExpressionDiff
): Normalized<BoxedExpression> | undefined {
  if (!currentExpression) {
    return undefined;
  }

  if (diff.kind === "decisionTable" && currentExpression.__$$element === "decisionTable") {
    return buildMergedDecisionTable(baseExpression as Normalized<BoxedDecisionTable>, currentExpression, diff);
  }

  // Future: Add other expression types here (context, relation, etc.)

  return currentExpression;
}

/**
 * Builds a merged Decision Table that includes removed rows/columns.
 */
export function buildMergedDecisionTable(
  baseExpression: Normalized<BoxedDecisionTable> | undefined,
  currentExpression: Normalized<BoxedDecisionTable> | undefined,
  diff: DecisionTableDiff
): Normalized<BoxedDecisionTable> | undefined {
  if (!currentExpression) {
    return undefined;
  }

  const hasRemovedRows = diff.rules.removed.length > 0;
  const hasRemovedColumns =
    diff.input.removed.length > 0 || diff.output.removed.length > 0 || (diff.annotation?.removed.length ?? 0) > 0;

  if (!baseExpression || (!hasRemovedRows && !hasRemovedColumns)) {
    return currentExpression;
  }

  const merged: Normalized<BoxedDecisionTable> = structuredClone(currentExpression);

  if (hasRemovedColumns) {
    merged.input = mergeColumns(
      baseExpression.input ?? [],
      merged.input ?? [],
      diff.input.removed
    ) as typeof merged.input;

    merged.output = mergeColumns(
      baseExpression.output ?? [],
      merged.output ?? [],
      diff.output.removed
    ) as typeof merged.output;

    if (diff.annotation?.removed.length) {
      merged.annotation = mergeAnnotationColumns(
        baseExpression.annotation ?? [],
        merged.annotation ?? [],
        diff.annotation.removed
      ) as typeof merged.annotation;
    }
  }

  if (hasRemovedRows) {
    merged.rule = mergeRules(baseExpression.rule ?? [], merged.rule ?? [], diff.rules.removed);
  }

  // Backfill cells for removed columns in existing rules

  if (hasRemovedColumns && baseExpression?.rule && merged.rule) {
    const baseRuleMap = new Map(baseExpression.rule.map((r) => [r["@_id"], r]));

    const baseInputIndexById = new Map(baseExpression.input?.map((col, idx) => [col["@_id"], idx]) ?? []);
    const baseOutputIndexById = new Map(baseExpression.output?.map((col, idx) => [col["@_id"], idx]) ?? []);
    const baseAnnotationIndexByName = new Map(baseExpression.annotation?.map((col, idx) => [col["@_name"], idx]) ?? []);

    merged.rule.forEach((rule) => {
      if (!rule["@_id"]) {
        return;
      }

      const baseRule = baseRuleMap.get(rule["@_id"]);

      diff.input.removed.forEach((removedColId) => {
        const baseColIndex = baseInputIndexById.get(removedColId) ?? -1;
        if (baseColIndex !== -1) {
          const originalValue =
            baseRule?.inputEntry?.[baseColIndex] ??
            ({ text: { __$$text: DEFAULT_REMOVED_INPUT_CELL_VALUE } } as Normalized<DMN15__tUnaryTests>);
          if (!rule.inputEntry) rule.inputEntry = [];
          rule.inputEntry.push(structuredClone(originalValue));
        }
      });

      diff.output.removed.forEach((removedColId) => {
        const baseColIndex = baseOutputIndexById.get(removedColId) ?? -1;
        if (baseColIndex !== -1) {
          const originalValue =
            baseRule?.outputEntry?.[baseColIndex] ??
            ({ text: { __$$text: DEFAULT_REMOVED_OUTPUT_CELL_VALUE } } as Normalized<DMN15__tLiteralExpression>);
          if (!rule.outputEntry) rule.outputEntry = [];
          rule.outputEntry.push(structuredClone(originalValue));
        }
      });

      if (diff.annotation?.removed) {
        diff.annotation.removed.forEach((removedColName) => {
          const baseColIndex = baseAnnotationIndexByName.get(removedColName) ?? -1;
          if (baseColIndex !== -1) {
            const originalValue =
              baseRule?.annotationEntry?.[baseColIndex] ??
              ({ text: { __$$text: DEFAULT_REMOVED_OUTPUT_CELL_VALUE } } as Normalized<DMN15__tRuleAnnotation>);
            if (!rule.annotationEntry) rule.annotationEntry = [];
            rule.annotationEntry.push(structuredClone(originalValue));
          }
        });
      }
    });
  }

  return merged;
}

/**
 * Merges columns by inserting removed items at their original positions.
 */
function mergeColumns<T extends { "@_id"?: string }>(
  baseColumns: Normalized<T>[],
  currentColumns: Normalized<T>[],
  removedIds: string[]
): Normalized<T>[] {
  if (removedIds.length === 0) {
    return currentColumns;
  }

  const currentIdSet = new Set(currentColumns.map((col) => col["@_id"]).filter((id): id is string => !!id));

  const result: Normalized<T>[] = [];

  for (const baseColumn of baseColumns) {
    const columnId = baseColumn["@_id"];

    if (removedIds.includes(columnId ?? "")) {
      const removedColumn = structuredClone(baseColumn) as Normalized<T> & RemovedItemMetadata;
      removedColumn.__isRemoved = true;
      removedColumn.__removedType = "column";
      result.push(removedColumn as Normalized<T>);
    } else if (currentIdSet.has(columnId ?? "")) {
      const currentColumn = currentColumns.find((col) => col["@_id"] === columnId);
      if (currentColumn) {
        result.push(currentColumn);
      }
    }
  }

  for (const currentColumn of currentColumns) {
    const columnId = currentColumn["@_id"];
    if (columnId && !baseColumns.some((col) => col["@_id"] === columnId)) {
      result.push(currentColumn);
    }
  }

  return result;
}

/**
 * Merges annotation columns by inserting removed items at their original positions.
 */
function mergeAnnotationColumns<T extends { "@_name"?: string }>(
  baseColumns: Normalized<T>[],
  currentColumns: Normalized<T>[],
  removedNames: string[]
): Normalized<T>[] {
  if (removedNames.length === 0) {
    return currentColumns;
  }

  const currentNameSet = new Set(currentColumns.map((col) => col["@_name"]).filter((name): name is string => !!name));

  const result: Normalized<T>[] = [];

  for (const baseColumn of baseColumns) {
    const columnName = baseColumn["@_name"];

    if (removedNames.includes(columnName ?? "")) {
      const removedColumn = structuredClone(baseColumn) as Normalized<T> & RemovedItemMetadata;
      removedColumn.__isRemoved = true;
      removedColumn.__removedType = "column";
      result.push(removedColumn as Normalized<T>);
    } else if (currentNameSet.has(columnName ?? "")) {
      const currentColumn = currentColumns.find((col) => col["@_name"] === columnName);
      if (currentColumn) {
        result.push(currentColumn);
      }
    }
  }

  for (const currentColumn of currentColumns) {
    const columnName = currentColumn["@_name"];
    if (columnName && !baseColumns.some((col) => col["@_name"] === columnName)) {
      result.push(currentColumn);
    }
  }

  return result;
}

/**
 * Merges rules (rows) by inserting removed items at their original positions.
 */
function mergeRules<T extends { "@_id"?: string }>(
  baseRules: Normalized<T>[],
  currentRules: Normalized<T>[],
  removedIds: string[]
): Normalized<T>[] {
  if (removedIds.length === 0) {
    return currentRules;
  }

  const currentIdSet = new Set(currentRules.map((rule) => rule["@_id"]).filter((id): id is string => !!id));

  const result: Normalized<T>[] = [];

  for (const baseRule of baseRules) {
    const ruleId = baseRule["@_id"];

    if (removedIds.includes(ruleId ?? "")) {
      const removedRule = structuredClone(baseRule) as Normalized<T> & RemovedItemMetadata;
      removedRule.__isRemoved = true;
      removedRule.__removedType = "row";
      result.push(removedRule as Normalized<T>);
    } else if (currentIdSet.has(ruleId ?? "")) {
      const currentRule = currentRules.find((rule) => rule["@_id"] === ruleId);
      if (currentRule) {
        result.push(currentRule);
      }
    }
  }

  for (const currentRule of currentRules) {
    const ruleId = currentRule["@_id"];
    if (ruleId && !baseRules.some((rule) => rule["@_id"] === ruleId)) {
      result.push(currentRule);
    }
  }

  return result;
}

/**
 * Type guard to check if an element is marked as removed.
 *
 * @param element - The element to check
 * @returns True if the element has the `__isRemoved` marker property
 */
export function isRemovedElement(element: unknown): element is { __isRemoved: true } {
  return typeof element === "object" && element !== null && "__isRemoved" in element && element.__isRemoved === true;
}
