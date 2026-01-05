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

import {
  DMN_LATEST__DMNShape,
  DmnLatestModel,
  DMN_LATEST__tContextEntry,
  DMN_LATEST__tInputClause,
  DMN_LATEST__tOutputClause,
  DMN_LATEST__tDecisionRule,
  DMN_LATEST__tInformationItem,
  DMN_LATEST__tBinding,
  DMN_LATEST__tList,
} from "@kie-tools/dmn-marshaller";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import {
  BoxedDecisionTable,
  BoxedFunction,
  BoxedInvocation,
  BoxedRelation,
  BoxedLiteral,
  BoxedContext,
  BoxedList,
  BoxedExpression,
  BoxedConditional,
  BoxedFilter,
  BoxedEvery,
  BoxedSome,
  BoxedFor,
} from "@kie-tools/boxed-expression-component/dist/api";

export const TEST_NAMESPACE = "https://kie.tools/test";

export const BoxedExpressionBuilders = {
  literal: (text: string, id: string = "lit"): Normalized<BoxedLiteral> => ({
    __$$element: "literalExpression" as const,
    "@_id": id,
    text: { __$$text: text },
  }),
  context: (entries: Normalized<DMN_LATEST__tContextEntry>[], id: string = "ctx"): Normalized<BoxedContext> => ({
    __$$element: "context" as const,
    "@_id": id,
    contextEntry: entries,
  }),
  contextEntry: (
    variableName: string,
    expr: Normalized<BoxedExpression>,
    varId: string = variableName
  ): Normalized<DMN_LATEST__tContextEntry> => ({
    "@_id": `${varId}_entry`,
    variable: { "@_id": varId, "@_name": variableName },
    expression: expr,
  }),
  list: (items: Normalized<BoxedExpression>[], id: string = "lst"): Normalized<BoxedList> => ({
    __$$element: "list" as const,
    "@_id": id,
    expression: items,
  }),
  decisionTable: (
    inputs: Normalized<DMN_LATEST__tInputClause>[],
    rules: Normalized<DMN_LATEST__tDecisionRule>[],
    id: string = "dt",
    output?: Normalized<DMN_LATEST__tOutputClause>[] | string
  ): Normalized<BoxedDecisionTable> => {
    const outputId = typeof output === "string" ? output : `${id}_out`;
    const finalOutput = Array.isArray(output) ? output : [{ "@_id": outputId, "@_name": "Output" }];

    return {
      __$$element: "decisionTable" as const,
      "@_id": id,
      input: inputs,
      output: finalOutput,
      rule: rules,
    };
  },
  inputClause: (text: string, id: string = "in"): Normalized<DMN_LATEST__tInputClause> => ({
    "@_id": id,
    inputExpression: { "@_id": `${id}_expr`, text: { __$$text: text }, "@_typeRef": "string" },
  }),
  rule: (
    entryTexts: string[] | string,
    id: string = "rule",
    outputEntryText?: string
  ): Normalized<DMN_LATEST__tDecisionRule> => {
    const inputs = Array.isArray(entryTexts) ? entryTexts : [entryTexts];
    return {
      "@_id": id,
      inputEntry: inputs.map((t, i) => ({ "@_id": `${id}_in_${i}`, text: { __$$text: t } })),
      outputEntry: [{ "@_id": `${id}_out`, text: { __$$text: outputEntryText ?? "result" } }],
      annotationEntry: [],
    };
  },
  functionDef: (
    params: Normalized<DMN_LATEST__tInformationItem>[],
    expr: Normalized<BoxedExpression>,
    id: string = "fn"
  ): Normalized<BoxedFunction> => ({
    __$$element: "functionDefinition",
    "@_id": id,
    formalParameter: params,
    expression: expr,
  }),
  param: (name: string, type: string, id: string): Normalized<DMN_LATEST__tInformationItem> => ({
    "@_id": id,
    "@_name": name,
    "@_typeRef": type,
  }),
  invocation: (bindings: Normalized<DMN_LATEST__tBinding>[], id: string = "inv"): Normalized<BoxedInvocation> => ({
    __$$element: "invocation",
    "@_id": id,
    binding: bindings,
    expression: {
      __$$element: "literalExpression",
      "@_id": `${id}_expr`,
      text: { __$$text: "myFunc" },
    },
  }),
  binding: (paramId: string, expr: Normalized<BoxedExpression>): Normalized<DMN_LATEST__tBinding> => ({
    parameter: { "@_id": paramId, "@_name": "p" },
    expression: expr,
  }),
  relation: (
    cols: Normalized<DMN_LATEST__tInformationItem>[],
    rows: Normalized<DMN_LATEST__tList>[],
    id: string = "rel"
  ): Normalized<BoxedRelation> => ({
    __$$element: "relation",
    "@_id": id,
    column: cols,
    row: rows,
  }),
  relRow: (cells: Normalized<BoxedExpression>[], id: string = "row"): Normalized<DMN_LATEST__tList> => ({
    "@_id": id,
    expression: cells,
  }),
  relCol: (name: string, id: string): Normalized<DMN_LATEST__tInformationItem> => ({
    "@_id": id,
    "@_name": name,
    "@_typeRef": "string",
  }),
  conditional: (
    ifExpr: Normalized<BoxedExpression> | undefined,
    thenExpr: Normalized<BoxedExpression> | undefined,
    elseExpr: Normalized<BoxedExpression> | undefined,
    id: string = "cond"
  ): Normalized<BoxedConditional> =>
    ({
      __$$element: "conditional",
      "@_id": id,
      if: ifExpr ? { "@_id": `${id}_if`, expression: ifExpr } : undefined,
      then: thenExpr ? { "@_id": `${id}_then`, expression: thenExpr } : undefined,
      else: elseExpr ? { "@_id": `${id}_else`, expression: elseExpr } : undefined,
    }) as Normalized<BoxedConditional>,
  filter: (
    inExpr: Normalized<BoxedExpression> | undefined,
    matchExpr: Normalized<BoxedExpression> | undefined,
    id: string = "filter"
  ): Normalized<BoxedFilter> =>
    ({
      __$$element: "filter",
      "@_id": id,
      in: inExpr ? { "@_id": `${id}_in`, expression: inExpr } : undefined,
      match: matchExpr ? { "@_id": `${id}_match`, expression: matchExpr } : undefined,
    }) as Normalized<BoxedFilter>,
  every: (
    inExpr: Normalized<BoxedExpression> | undefined,
    satisfiesExpr: Normalized<BoxedExpression> | undefined,
    id: string = "every"
  ): Normalized<BoxedEvery> =>
    ({
      __$$element: "every",
      "@_id": id,
      in: inExpr ? { "@_id": `${id}_in`, expression: inExpr } : undefined,
      satisfies: satisfiesExpr ? { "@_id": `${id}_satisfies`, expression: satisfiesExpr } : undefined,
    }) as Normalized<BoxedEvery>,
  some: (
    inExpr: Normalized<BoxedExpression> | undefined,
    satisfiesExpr: Normalized<BoxedExpression> | undefined,
    id: string = "some"
  ): Normalized<BoxedSome> =>
    ({
      __$$element: "some",
      "@_id": id,
      in: inExpr ? { "@_id": `${id}_in`, expression: inExpr } : undefined,
      satisfies: satisfiesExpr ? { "@_id": `${id}_satisfies`, expression: satisfiesExpr } : undefined,
    }) as Normalized<BoxedSome>,
  for: (
    inExpr: Normalized<BoxedExpression> | undefined,
    returnExpr: Normalized<BoxedExpression> | undefined,
    id: string = "for"
  ): Normalized<BoxedFor> =>
    ({
      __$$element: "for",
      "@_id": id,
      in: inExpr ? { "@_id": `${id}_in`, expression: inExpr } : undefined,
      return: returnExpr ? { "@_id": `${id}_return`, expression: returnExpr } : undefined,
    }) as Normalized<BoxedFor>,
};

export function applyStateUpdates(setStateMock: jest.Mock, currentState: Record<string, unknown>) {
  for (const call of setStateMock.mock.calls) {
    const updater = call[0];
    if (typeof updater === "function") {
      updater(currentState);
    }
  }
}

export function setupMockStore(StoreContext: { useDmnEditorStoreApi: jest.Mock | (() => unknown) }) {
  const setStateMock = jest.fn();
  const getStateMock = jest.fn();
  const dispatchResetMock = jest.fn();
  const dispatchMock = jest.fn().mockReturnValue({
    dmn: { reset: dispatchResetMock },
  });

  const storeApiMock = {
    setState: setStateMock,
    getState: getStateMock,
    dispatch: dispatchMock,
    subscribe: jest.fn(),
    destroy: jest.fn(),
  };

  (StoreContext.useDmnEditorStoreApi as jest.Mock).mockReturnValue(storeApiMock);

  return { setStateMock, getStateMock, dispatchMock, dispatchResetMock, storeApiMock };
}

export function createEmptyModel(): Normalized<DmnLatestModel> {
  return {
    definitions: {
      "@_id": "definitions",
      "@_name": "Test",
      "@_namespace": TEST_NAMESPACE,
      drgElement: [],
      artifact: [],
      "dmndi:DMNDI": {
        "dmndi:DMNDiagram": [
          {
            "@_id": "diagram",
            "dmndi:DMNDiagramElement": [],
          },
        ],
      },
    },
  } as unknown as Normalized<DmnLatestModel>;
}

export function createModelWithExpression(element: unknown) {
  const model = createEmptyModel();
  model.definitions.drgElement = [element as any];
  return model;
}

export function addInputData(
  model: Normalized<DmnLatestModel>,
  {
    id,
    name,
    x = 10,
    y = 20,
    width = 160,
    height = 80,
  }: { id: string; name: string; x?: number; y?: number; width?: number; height?: number }
) {
  model.definitions.drgElement?.push({
    __$$element: "inputData",
    "@_id": id,
    "@_name": name,
  } as any);

  diagramElements(model).push(createShape(id, { x, y, width, height }));
}

export function addDecision(
  model: Normalized<DmnLatestModel>,
  {
    id,
    name,
    informationRequirements = [],
  }: {
    id: string;
    name: string;
    informationRequirements?: Array<{ id: string; requiredInputId: string }>;
  }
) {
  model.definitions.drgElement?.push({
    __$$element: "decision",
    "@_id": id,
    "@_name": name,
    informationRequirement: informationRequirements.map((req) => ({
      __$$element: "informationRequirement",
      "@_id": req.id,
      requiredInput: { "@_href": `#${req.requiredInputId}` },
    })),
  } as any);

  diagramElements(model).push(createShape(id, { x: 300, y: 200 }));
}

export function addBusinessKnowledgeModel(
  model: Normalized<DmnLatestModel>,
  {
    id,
    name,
    encapsulatedLogic,
    x = 100,
    y = 100,
  }: {
    id: string;
    name: string;
    encapsulatedLogic?: Normalized<BoxedFunction>;
    x?: number;
    y?: number;
  }
) {
  model.definitions.drgElement?.push({
    __$$element: "businessKnowledgeModel",
    "@_id": id,
    id: id,
    "@_name": name,
    name: name,
    encapsulatedLogic: encapsulatedLogic,
  } as any);

  diagramElements(model).push(createShape(id, { x, y }));
}

export function diagramElements(model: Normalized<DmnLatestModel>) {
  if (!model.definitions["dmndi:DMNDI"]) {
    model.definitions["dmndi:DMNDI"] = {
      "dmndi:DMNDiagram": [
        {
          "@_id": "diagram",
          "dmndi:DMNDiagramElement": [],
        },
      ],
    };
  }

  const dmndi = model.definitions["dmndi:DMNDI"]!;
  dmndi["dmndi:DMNDiagram"] = dmndi["dmndi:DMNDiagram"] ?? [
    {
      "@_id": "diagram",
      "dmndi:DMNDiagramElement": [],
    },
  ];

  const diagram = dmndi["dmndi:DMNDiagram"][0]!;
  diagram["dmndi:DMNDiagramElement"] = diagram["dmndi:DMNDiagramElement"] ?? [];

  return diagram["dmndi:DMNDiagramElement"]!;
}

export function createShape(
  elementId: string,
  { x = 0, y = 0, width = 160, height = 80 }: { x?: number; y?: number; width?: number; height?: number }
): Normalized<DMN_LATEST__DMNShape> & { __$$element: "dmndi:DMNShape" } {
  return {
    __$$element: "dmndi:DMNShape",
    "@_id": `${elementId}_shape`,
    "@_dmnElementRef": elementId,
    "dc:Bounds": {
      "@_x": x,
      "@_y": y,
      "@_width": width,
      "@_height": height,
    },
  } as unknown as Normalized<DMN_LATEST__DMNShape> & { __$$element: "dmndi:DMNShape" };
}
