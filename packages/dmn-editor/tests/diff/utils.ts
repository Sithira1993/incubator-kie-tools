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

import { DMN_LATEST__DMNShape, DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";

export const TEST_NAMESPACE = "https://kie.tools/test";

// Simulates setState updates when using mock stores, executing functional updaters immediately.
export function applyStateUpdates(setStateMock: jest.Mock, currentState: any) {
  for (const call of setStateMock.mock.calls) {
    const updater = call[0];
    if (typeof updater === "function") {
      updater(currentState);
    }
  }
}

export function setupMockStore(StoreContext: any) {
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
