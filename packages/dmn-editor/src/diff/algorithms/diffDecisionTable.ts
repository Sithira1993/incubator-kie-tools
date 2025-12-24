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
  DMN_LATEST__tInputClause,
  DMN_LATEST__tOutputClause,
  DMN_LATEST__tUnaryTests,
  DMN_LATEST__tLiteralExpression,
} from "@kie-tools/dmn-marshaller";
import { BoxedDecisionTable } from "@kie-tools/boxed-expression-component/dist/api";
import { BoxedExpressionDiff, DiffPropertyChange } from "../types";
import { diffArrayElements, indexElementsById } from "./diffUtils";

/**
 * Represents a rule annotation entry in a Decision Table.
 * Annotation entries provide additional context or notes for a rule.
 * This type matches the DMN specification's tRuleAnnotation structure.
 */
export type RuleAnnotation = {
  text?: {
    __$$text: string;
  };
};

/**
 * Represents a Decision Table rule with its entries.
 * - inputEntry: Conditions that must be met for this rule
 * - outputEntry: Results produced when this rule matches
 * - annotationEntry: Optional text annotations providing additional context or notes
 */
export interface DecisionTableRule {
  inputEntry?: Normalized<DMN_LATEST__tUnaryTests>[];
  outputEntry?: Normalized<DMN_LATEST__tLiteralExpression>[];
  annotationEntry?: RuleAnnotation[];
  "@_id"?: string;
}

/**
 * Compares two Decision Table expressions and returns a structured diff of their differences.
 *
 * Decision Tables are compared across multiple dimensions:
 * - Input columns: labels, type references, and input value constraints
 * - Output columns: labels, type references, output value constraints, and default output entries
 * - Rules: input entries, output entries, annotation entries, and rule reordering
 * - Hit policy and aggregation settings
 *
 * @param tableA - The base Decision Table to compare
 * @param tableB - The changed Decision Table to compare
 * @returns A BoxedExpressionDiff object with kind "decisionTable" containing detailed changes,
 *          or undefined if the tables are identical
 *
 * @remarks
 * - Uses ID-based matching when all elements have IDs, falls back to index-based matching otherwise
 * - Detects column additions, removals, and modifications
 * - Detects rule additions, removals, modifications, and reordering
 * - Tracks changes to individual rule entries (input, output, and annotation cells)
 */
export function diffDecisionTable(
  tableA: Normalized<BoxedDecisionTable>,
  tableB: Normalized<BoxedDecisionTable>
): BoxedExpressionDiff | undefined {
  if (tableA === tableB) {
    return undefined;
  }

  const inputDiff = diffColumns(tableA.input ?? [], tableB.input ?? [], "input");
  const outputDiff = diffColumns(tableA.output ?? [], tableB.output ?? [], "output");
  const annotationDiff = diffColumns(tableA.annotation ?? [], tableB.annotation ?? [], "annotation");
  const ruleDiff = diffRules(tableA.rule ?? [], tableB.rule ?? []);

  const hitPolicyA = tableA["@_hitPolicy"];
  const hitPolicyB = tableB["@_hitPolicy"];

  const aggregationA = tableA["@_aggregation"];
  const aggregationB = tableB["@_aggregation"];

  let hitPolicyChange: DiffPropertyChange | undefined;
  if (hitPolicyA !== hitPolicyB) {
    hitPolicyChange = { property: "hitPolicy", previousValue: hitPolicyA, currentValue: hitPolicyB };
  }

  let aggregationChange: DiffPropertyChange | undefined;
  if (aggregationA !== aggregationB) {
    aggregationChange = { property: "aggregation", previousValue: aggregationA, currentValue: aggregationB };
  }

  if (
    !inputDiff.hasChanges &&
    !outputDiff.hasChanges &&
    !ruleDiff.hasChanges &&
    !annotationDiff.hasChanges &&
    !hitPolicyChange &&
    !aggregationChange
  ) {
    return undefined;
  }

  return {
    kind: "decisionTable",
    hitPolicy: hitPolicyChange,
    aggregation: aggregationChange,
    input: inputDiff,
    output: outputDiff,
    annotation: annotationDiff,
    rules: ruleDiff,
  };
}

/**
 * Compares two arrays of columns (input, output, or annotation) and returns a structured diff.
 *
 * @param colsA - The base model columns (original state)
 * @param colsB - The changed model columns (current state)
 * @param type - The type of columns being compared ("input", "output", or "annotation")
 * @returns Object containing details of added, removed, and modified columns, and a flag indicating if changes exists
 */
function diffColumns(
  colsA: Normalized<DMN_LATEST__tInputClause | DMN_LATEST__tOutputClause | { "@_name"?: string }>[],
  colsB: Normalized<DMN_LATEST__tInputClause | DMN_LATEST__tOutputClause | { "@_name"?: string }>[],
  type: "input" | "output" | "annotation"
) {
  const { added, removed, modified, hasChanges } = diffArrayElements(
    colsA,
    colsB,
    (col) => (col as { "@_id"?: string })["@_id"],
    (colA, colB, indexA, indexB) => {
      const changes = compareColumnProperties(colA, colB, type);
      if (changes && Object.keys(changes).length > 0) {
        return changes;
      }
      return undefined;
    }
  );

  return { added, removed, modified, hasChanges };
}

/**
 * Compares detailed properties of two columns (input, output, or annotation) and records any differences.
 *
 * @param colA - The base model column
 * @param colB - The changed model column
 * @param type - The type of column ("input", "output", or "annotation")
 * @returns DecisionTableColumnDiff object if changes are found, or undefined
 */
function compareColumnProperties(
  colA: Normalized<DMN_LATEST__tInputClause | DMN_LATEST__tOutputClause | { "@_name"?: string }>,
  colB: Normalized<DMN_LATEST__tInputClause | DMN_LATEST__tOutputClause | { "@_name"?: string }>,
  type: "input" | "output" | "annotation"
) {
  const changes: import("../types").DecisionTableColumnDiff = {};
  let labelA: string | undefined;
  let labelB: string | undefined;

  if (type === "input") {
    labelA = (colA as Normalized<DMN_LATEST__tInputClause>).inputExpression?.text?.__$$text;
    labelB = (colB as Normalized<DMN_LATEST__tInputClause>).inputExpression?.text?.__$$text;
  } else if (type === "output") {
    // Output columns can use either @_label (for single merged output) or @_name (for multiple outputs)
    // Check both properties with @_label as primary and @_name as fallback
    labelA =
      (colA as Normalized<DMN_LATEST__tOutputClause>)["@_label"] ??
      (colA as Normalized<DMN_LATEST__tOutputClause>)["@_name"];
    labelB =
      (colB as Normalized<DMN_LATEST__tOutputClause>)["@_label"] ??
      (colB as Normalized<DMN_LATEST__tOutputClause>)["@_name"];
  } else if (type === "annotation") {
    labelA = (colA as { "@_name"?: string })["@_name"];
    labelB = (colB as { "@_name"?: string })["@_name"];
  }

  // Note: For annotation columns, 'name' is used as the label equivalent
  if (type === "annotation") {
    if ((labelA ?? "") !== (labelB ?? "")) {
      changes.name = { property: "name", previousValue: labelA, currentValue: labelB };
    }
    // Future annotation properties (e.g., width) can be added here
    return changes;
  }

  if ((labelA ?? "") !== (labelB ?? "")) {
    changes.label = { property: "label", previousValue: labelA, currentValue: labelB };
  }

  const typeRefA =
    type === "input"
      ? (colA as Normalized<DMN_LATEST__tInputClause>).inputExpression?.["@_typeRef"]
      : (colA as Normalized<DMN_LATEST__tOutputClause>)["@_typeRef"];
  const typeRefB =
    type === "input"
      ? (colB as Normalized<DMN_LATEST__tInputClause>).inputExpression?.["@_typeRef"]
      : (colB as Normalized<DMN_LATEST__tOutputClause>)["@_typeRef"];
  if ((typeRefA ?? "") !== (typeRefB ?? "")) {
    changes.typeRef = { property: "typeRef", previousValue: typeRefA, currentValue: typeRefB };
  }

  // Column-level description (applies to all column types)
  const descriptionA = (colA as any).description?.__$$text;
  const descriptionB = (colB as any).description?.__$$text;
  if ((descriptionA ?? "") !== (descriptionB ?? "")) {
    changes.description = { property: "description", previousValue: descriptionA, currentValue: descriptionB };
  }

  // Input Column Properties
  if (type === "input") {
    const inputColA = colA as Normalized<DMN_LATEST__tInputClause>;
    const inputColB = colB as Normalized<DMN_LATEST__tInputClause>;

    // Input expression language
    const inputExprLangA = inputColA.inputExpression?.["@_expressionLanguage"];
    const inputExprLangB = inputColB.inputExpression?.["@_expressionLanguage"];
    if ((inputExprLangA ?? "") !== (inputExprLangB ?? "")) {
      changes.inputExpressionLanguage = {
        property: "inputExpressionLanguage",
        previousValue: inputExprLangA,
        currentValue: inputExprLangB,
      };
    }

    // Input expression description
    const inputExprDescA = inputColA.inputExpression?.description?.__$$text;
    const inputExprDescB = inputColB.inputExpression?.description?.__$$text;
    if ((inputExprDescA ?? "") !== (inputExprDescB ?? "")) {
      changes.inputExpressionDescription = {
        property: "inputExpressionDescription",
        previousValue: inputExprDescA,
        currentValue: inputExprDescB,
      };
    }

    // Input values constraint text
    const inputValuesA = inputColA.inputValues?.text?.__$$text;
    const inputValuesB = inputColB.inputValues?.text?.__$$text;
    if ((inputValuesA ?? "") !== (inputValuesB ?? "")) {
      changes.inputValues = { property: "inputValues", previousValue: inputValuesA, currentValue: inputValuesB };
    }

    // Input values expression language
    const inputValuesLangA = inputColA.inputValues?.["@_expressionLanguage"];
    const inputValuesLangB = inputColB.inputValues?.["@_expressionLanguage"];
    if ((inputValuesLangA ?? "") !== (inputValuesLangB ?? "")) {
      changes.inputValuesExpressionLanguage = {
        property: "inputValuesExpressionLanguage",
        previousValue: inputValuesLangA,
        currentValue: inputValuesLangB,
      };
    }

    // Input values description
    const inputValuesDescA = inputColA.inputValues?.description?.__$$text;
    const inputValuesDescB = inputColB.inputValues?.description?.__$$text;
    if ((inputValuesDescA ?? "") !== (inputValuesDescB ?? "")) {
      changes.inputValuesDescription = {
        property: "inputValuesDescription",
        previousValue: inputValuesDescA,
        currentValue: inputValuesDescB,
      };
    }
  }

  // Output Column Properties
  if (type === "output") {
    const outputColA = colA as Normalized<DMN_LATEST__tOutputClause>;
    const outputColB = colB as Normalized<DMN_LATEST__tOutputClause>;

    // Output values constraint text
    const outputValuesA = outputColA.outputValues?.text?.__$$text;
    const outputValuesB = outputColB.outputValues?.text?.__$$text;
    if ((outputValuesA ?? "") !== (outputValuesB ?? "")) {
      changes.outputValues = { property: "outputValues", previousValue: outputValuesA, currentValue: outputValuesB };
    }

    // Output values expression language
    const outputValuesLangA = outputColA.outputValues?.["@_expressionLanguage"];
    const outputValuesLangB = outputColB.outputValues?.["@_expressionLanguage"];
    if ((outputValuesLangA ?? "") !== (outputValuesLangB ?? "")) {
      changes.outputValuesExpressionLanguage = {
        property: "outputValuesExpressionLanguage",
        previousValue: outputValuesLangA,
        currentValue: outputValuesLangB,
      };
    }

    // Output values description
    const outputValuesDescA = outputColA.outputValues?.description?.__$$text;
    const outputValuesDescB = outputColB.outputValues?.description?.__$$text;
    if ((outputValuesDescA ?? "") !== (outputValuesDescB ?? "")) {
      changes.outputValuesDescription = {
        property: "outputValuesDescription",
        previousValue: outputValuesDescA,
        currentValue: outputValuesDescB,
      };
    }

    // Default output entry text
    const defaultOutputA = outputColA.defaultOutputEntry?.text?.__$$text;
    const defaultOutputB = outputColB.defaultOutputEntry?.text?.__$$text;
    if ((defaultOutputA ?? "") !== (defaultOutputB ?? "")) {
      changes.defaultOutputEntry = {
        property: "defaultOutputEntry",
        previousValue: defaultOutputA,
        currentValue: defaultOutputB,
      };
    }

    // Default output expression language
    const defaultOutputLangA = outputColA.defaultOutputEntry?.["@_expressionLanguage"];
    const defaultOutputLangB = outputColB.defaultOutputEntry?.["@_expressionLanguage"];
    if ((defaultOutputLangA ?? "") !== (defaultOutputLangB ?? "")) {
      changes.defaultOutputExpressionLanguage = {
        property: "defaultOutputExpressionLanguage",
        previousValue: defaultOutputLangA,
        currentValue: defaultOutputLangB,
      };
    }

    // Default output description
    const defaultOutputDescA = outputColA.defaultOutputEntry?.description?.__$$text;
    const defaultOutputDescB = outputColB.defaultOutputEntry?.description?.__$$text;
    if ((defaultOutputDescA ?? "") !== (defaultOutputDescB ?? "")) {
      changes.defaultOutputDescription = {
        property: "defaultOutputDescription",
        previousValue: defaultOutputDescA,
        currentValue: defaultOutputDescB,
      };
    }
  }

  return changes;
}

function diffRules(rulesA: DecisionTableRule[], rulesB: DecisionTableRule[]) {
  const { added, removed, modified, hasChanges } = diffArrayElements(
    rulesA,
    rulesB,
    (rule) => rule["@_id"],
    (ruleA, ruleB, indexA, indexB) => {
      const { modifications, changed, indexChange } = compareRuleEntries(ruleA, ruleB, indexA, indexB);
      if (changed) {
        return { ...modifications, index: indexChange };
      }
      return undefined;
    }
  );

  return { added, removed, modified, hasChanges };
}

/**
 * Compares two decision table rules, including their input, output, and annotation entries.
 * Also detects if the rule has moved (index change).
 *
 * @param ruleA - The base model rule
 * @param ruleB - The changed model rule
 * @param indexA - The index of ruleA in the original table (optional)
 * @param indexB - The index of ruleB in the new table (optional)
 * @returns Object containing detailed modifications (input/output/annotation changes) and index change info
 */
function compareRuleEntries(ruleA: DecisionTableRule, ruleB: DecisionTableRule, indexA?: number, indexB?: number) {
  const inputEntriesChange = diffDecisionTableEntries(ruleA.inputEntry, ruleB.inputEntry);
  const outputEntriesChange = diffDecisionTableEntries(ruleA.outputEntry, ruleB.outputEntry);
  const annotationEntriesChange = diffDecisionTableEntries(ruleA.annotationEntry, ruleB.annotationEntry);

  let indexChange: DiffPropertyChange | undefined;
  if (indexA !== undefined && indexB !== undefined && indexA !== indexB) {
    indexChange = { property: "index", previousValue: indexA, currentValue: indexB };
  }

  const changed =
    Object.keys(inputEntriesChange).length > 0 ||
    Object.keys(outputEntriesChange).length > 0 ||
    Object.keys(annotationEntriesChange).length > 0 ||
    !!indexChange;

  return {
    modifications: {
      inputEntries: inputEntriesChange,
      outputEntries: outputEntriesChange,
      annotationEntries: annotationEntriesChange,
    },
    indexChange,
    changed,
  };
}

/**
 * Compares two arrays of Decision Table entries (input, output, or annotation entries).
 * Entries are compared by index and their text content is checked for differences.
 *
 * @param entriesA - First array of entries (from base model)
 * @param entriesB - Second array of entries (from changed model)
 * @returns Record mapping entry index to the detected change
 */
function diffDecisionTableEntries(
  entriesA: Normalized<DMN_LATEST__tUnaryTests | DMN_LATEST__tLiteralExpression>[] | RuleAnnotation[] | undefined,
  entriesB: Normalized<DMN_LATEST__tUnaryTests | DMN_LATEST__tLiteralExpression>[] | RuleAnnotation[] | undefined
) {
  const changes: Record<number, DiffPropertyChange> = {};
  const arrA = entriesA ?? [];
  const arrB = entriesB ?? [];
  const maxLen = Math.max(arrA.length, arrB.length);

  for (let i = 0; i < maxLen; i++) {
    const textA = arrA[i]?.text?.__$$text ?? "";
    const textB = arrB[i]?.text?.__$$text ?? "";
    if (textA !== textB) {
      changes[i] = { property: "text", previousValue: textA, currentValue: textB };
    }
  }
  return changes;
}
