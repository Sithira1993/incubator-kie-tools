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
import { DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";

export enum DmnDiffFileVersion {
  VERSION_A = "VERSION_A",
  VERSION_B = "VERSION_B",
}

export interface DmnDiffFile {
  name: string;
  content: string;
  model: Normalized<DmnLatestModel>;
}

export interface DmnDiffValidationError {
  type: "INVALID_EXTENSION" | "FILE_TOO_LARGE" | "MALFORMED_XML" | "INVALID_DMN" | "PARSING_ERROR";
  message: string;
}

export interface DmnDiffState {
  versionA: DmnDiffFile | null;
  versionB: DmnDiffFile | null;
  versionAError: DmnDiffValidationError | null;
  versionBError: DmnDiffValidationError | null;
  isLoadingA: boolean;
  isLoadingB: boolean;
}

export enum DiffChangeType {
  ADDED = "ADDED",
  REMOVED = "REMOVED",
  MODIFIED = "MODIFIED",
}

export interface DiffPropertyChange<T = unknown> {
  property: string;
  previousValue: T | undefined;
  currentValue: T | undefined;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface ElementDiff {
  id: string;
  elementType: string;
  elementName?: string;
  changeType: DiffChangeType;
  changedProperties?: DiffPropertyChange[];
}

export interface NodeDiff extends ElementDiff {
  kind: "node";
  position?: NodePosition;
  size?: NodeSize;
  boxedExpressionDiff?: BoxedExpressionDiff;
  status?: "pending" | "accepted" | "reverted";
}

export interface EdgeDiff extends ElementDiff {
  kind: "edge";
  source?: string;
  target?: string;
  referenceKind?: string;
  status?: "pending" | "accepted" | "reverted";
}

export interface DiffResult {
  nodes: NodeDiff[];
  edges: EdgeDiff[];
  hasChanges: boolean;
}

export type BoxedExpressionDiff =
  | LiteralExpressionDiff
  | DecisionTableDiff
  | ContextDiff
  | FunctionDefinitionDiff
  | ListDiff
  | InvocationDiff
  | RelationDiff
  | ConditionalDiff
  | FilterDiff
  | EveryDiff
  | SomeDiff
  | ForDiff
  | ExpressionReplacementDiff;

/**
 * Represents a diff where the entire expression has been replaced by another of a different type
 * (e.g., Literal Expression replaced by Context).
 *
 * NOTE: Instead of a granular diff, this provides the full `previousExpression` and `currentExpression`
 * objects. This allows consumers to fully visualize or process the "before" and "after" states,
 * preserving all nested details that might be lost in a shallow type check.
 */
export interface ExpressionReplacementDiff {
  kind: "expressionReplacement";
  previousType: string;
  currentType: string;
  previousExpression?: Normalized<BoxedExpression>; // Full expression from the base model for visualization
  currentExpression?: Normalized<BoxedExpression>; // Full expression from the changed model for visualization
}

export interface LiteralExpressionDiff {
  kind: "literalExpression";
  label?: DiffPropertyChange; // Added for name changes
  text?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  description?: DiffPropertyChange;
  expressionLanguage?: DiffPropertyChange;
  importedValues?: DiffPropertyChange;
}

/**
 * Tracks detailed changes to a Decision Table column.
 * Includes all DMN-defined properties to ensure accurate diffs, auditability, and future compatibility with minimal performance impact.
 */
export interface DecisionTableColumnDiff {
  // Label/Name
  label?: DiffPropertyChange;
  name?: DiffPropertyChange; // For annotation columns
  index?: DiffPropertyChange; // For column reordering

  // Type
  typeRef?: DiffPropertyChange;

  // Constraints
  inputValues?: DiffPropertyChange;
  outputValues?: DiffPropertyChange;
  defaultOutputEntry?: DiffPropertyChange;

  // Column-level metadata
  description?: DiffPropertyChange;

  // Input expression metadata (for input columns)
  inputExpressionLanguage?: DiffPropertyChange;
  inputExpressionDescription?: DiffPropertyChange;

  // Input values metadata (for input columns)
  inputValuesExpressionLanguage?: DiffPropertyChange;
  inputValuesDescription?: DiffPropertyChange;

  // Output values metadata (for output columns)
  outputValuesExpressionLanguage?: DiffPropertyChange;
  outputValuesDescription?: DiffPropertyChange;

  // Default output metadata (for output columns)
  defaultOutputExpressionLanguage?: DiffPropertyChange;
  defaultOutputDescription?: DiffPropertyChange;
}

export interface DecisionTableDiff {
  kind: "decisionTable";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  outputLabel?: DiffPropertyChange;
  hitPolicy?: DiffPropertyChange;
  aggregation?: DiffPropertyChange;
  input: {
    added: string[]; // IDs of added columns. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed columns. Retrieve full details from the base model.
    modified: Record<string, DecisionTableColumnDiff>; // ID -> changes
  };
  output: {
    added: string[]; // IDs of added columns. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed columns. Retrieve full details from the base model.
    modified: Record<string, DecisionTableColumnDiff>;
  };
  annotation?: {
    added: string[]; // IDs of added columns. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed columns. Retrieve full details from the base model.
    modified: Record<string, DecisionTableColumnDiff>;
  };
  rules: {
    added: string[]; // IDs of added rules. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed rules. Retrieve full details from the base model.
    modified: Record<
      string,
      {
        index?: DiffPropertyChange; // Index -> change
        inputEntries: Record<number, DiffPropertyChange[]>; // Index -> changes
        outputEntries: Record<number, DiffPropertyChange[]>; // Index -> changes
        annotationEntries: Record<number, DiffPropertyChange[]>; // Index -> changes
      }
    >;
  };
}

export interface ContextDiff {
  kind: "context";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  entries: {
    added: string[]; // IDs of added entries. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed entries. Retrieve full details from the base model.
    modified: Record<
      string,
      {
        variable?: DiffPropertyChange[];
        expression?: BoxedExpressionDiff;
        index?: DiffPropertyChange;
      }
    >;
  };
  result?: BoxedExpressionDiff;
}

export interface FunctionDefinitionDiff {
  kind: "functionDefinition";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  parameters: {
    added: string[]; // IDs of added parameters. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed parameters. Retrieve full details from the base model.
    modified: Record<string, { diffs: DiffPropertyChange[]; index?: DiffPropertyChange }>; // ID -> changes (including index)
  };
  kindProperty?: DiffPropertyChange; // For function kind (FEEL, Java, PMML)
  expression?: BoxedExpressionDiff;
}

export interface ListDiff {
  kind: "list";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  items: {
    added: number[]; // Indexes of added items. Retrieve full details from the changed model.
    removed: number[]; // Indexes of removed items. Retrieve full details from the base model.
    modified: Record<number, { diff?: BoxedExpressionDiff; index?: DiffPropertyChange }>;
  };
}

export interface InvocationDiff {
  kind: "invocation";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  bindings: {
    added: string[]; // IDs of added bindings. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed bindings. Retrieve full details from the base model.
    modified: Record<
      string,
      {
        parameter?: DiffPropertyChange[]; // Changes to the binding parameter itself (name, typeRef)
        expression?: BoxedExpressionDiff;
        index?: DiffPropertyChange;
      }
    >;
  };
  expression?: BoxedExpressionDiff;
}

export interface RelationDiff {
  kind: "relation";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  columns: {
    added: string[]; // IDs of added columns. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed columns. Retrieve full details from the base model.
    modified: Record<string, DiffPropertyChange[]>;
  };
  rows: {
    added: string[]; // IDs of added rows. Retrieve full details from the changed model.
    removed: string[]; // IDs of removed rows. Retrieve full details from the base model.
    modified: Record<string, { index?: DiffPropertyChange; cells: Record<number, BoxedExpressionDiff> }>; // Row ID -> Diff
  };
}

export interface ConditionalDiff {
  kind: "conditional";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  if?: BoxedExpressionDiff;
  then?: BoxedExpressionDiff;
  else?: BoxedExpressionDiff;
}

export interface FilterDiff {
  kind: "filter";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  in?: BoxedExpressionDiff;
  match?: BoxedExpressionDiff;
}

export interface EveryDiff {
  kind: "every";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  in?: BoxedExpressionDiff;
  satisfies?: BoxedExpressionDiff;
  iteratorVariable?: DiffPropertyChange;
}

export interface SomeDiff {
  kind: "some";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  in?: BoxedExpressionDiff;
  satisfies?: BoxedExpressionDiff;
  iteratorVariable?: DiffPropertyChange;
}

export interface ForDiff {
  kind: "for";
  label?: DiffPropertyChange;
  description?: DiffPropertyChange;
  typeRef?: DiffPropertyChange;
  in?: BoxedExpressionDiff;
  return?: BoxedExpressionDiff;
  iteratorVariable?: DiffPropertyChange;
}
