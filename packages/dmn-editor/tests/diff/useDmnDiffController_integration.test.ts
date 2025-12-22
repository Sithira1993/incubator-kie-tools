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

import { useDmnDiffController } from "../../src/diff/hooks/useDmnDiffController";
import * as StoreContext from "../../src/store/StoreContext";
import * as DmnMarshaller from "@kie-tools/dmn-marshaller";
import { DiffChangeType } from "../../src/diff/types";

// Polyfill structuredClone
if (typeof global.structuredClone !== "function") {
  global.structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
}

// Mocks
jest.mock("react", () => ({
  useCallback: (fn: any) => fn,
  createContext: jest.fn(),
  useContext: jest.fn(),
}));

jest.mock("../../src/store/StoreContext", () => ({
  useDmnEditorStoreApi: jest.fn(),
  useDmnEditorStore: jest.fn(),
}));

jest.mock("@kie-tools/dmn-marshaller", () => ({
  getMarshaller: jest.fn(),
}));

jest.mock("@kie-tools/dmn-marshaller/dist/normalization/normalize", () => ({
  normalize: (model: any) => model,
}));

jest.mock("@kie-tools/dmn-marshaller/dist/xml", () => ({
  parseXmlHref: (href: string) => {
    if (href && href.startsWith("#")) return { id: href.substring(1) };
    if (href) return { id: href };
    return { id: "" };
  },
  buildXmlHref: (args: { id: string }) => `#${args.id}`,
}));

describe("useDmnDiffController Integration", () => {
  const setStateMock = jest.fn();
  const getStateMock = jest.fn();
  const dispatchResetMock = jest.fn();
  const dispatchMock = jest.fn().mockReturnValue({
    dmn: { reset: dispatchResetMock },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (StoreContext.useDmnEditorStoreApi as jest.Mock).mockReturnValue({
      setState: setStateMock,
      getState: getStateMock,
      dispatch: dispatchMock,
      subscribe: jest.fn(),
      destroy: jest.fn(),
    });
  });

  const baseModel = {
    definitions: {
      "@_namespace": "https://kie.org/dmn/_base",
      "@_name": "BaseModel",
      "@_id": "_base",
      drgElement: [
        {
          __$$element: "inputData",
          "@_id": "input1",
          "@_name": "Input 1",
        },
        {
          __$$element: "decision",
          "@_id": "decision1",
          "@_name": "Decision 1",
          informationRequirement: [{ "@_id": "edge1", requiredInput: { "@_href": "#input1" } }], // input1 -> decision1
        },
      ],
      "dmndi:DMNDI": {
        "dmndi:DMNDiagram": [
          {
            "dmndi:DMNDiagramElement": [
              { "@_dmnElementRef": "input1" }, // Shape
              { "@_dmnElementRef": "decision1" }, // Shape
              { "@_dmnElementRef": "edge1" }, // Edge
            ],
          },
        ],
      },
    } as any,
  };

  const changedModel = {
    definitions: {
      "@_namespace": "https://kie.org/dmn/_base",
      "@_name": "BaseModel",
      "@_id": "_base",
      drgElement: [
        {
          __$$element: "inputData",
          "@_id": "input1",
          "@_name": "Input 1",
        },
        // decision1 REMOVED
        {
          __$$element: "decision",
          "@_id": "decision2", // ADDED
          "@_name": "Decision 2",
          informationRequirement: [{ "@_id": "edge2", requiredInput: { "@_href": "#input1" } }], // input1 -> decision2 (ADDED)
        },
      ],
      "dmndi:DMNDI": {
        "dmndi:DMNDiagram": [
          {
            "dmndi:DMNDiagramElement": [
              { "@_dmnElementRef": "input1" },
              { "@_dmnElementRef": "decision2" }, // Shape 2
              { "@_dmnElementRef": "edge2" }, // Edge 2
            ],
          },
        ],
      },
    } as any,
  };

  test("openDiff -> closeDiff complex scenario", async () => {
    const { openDiff, closeDiff } = useDmnDiffController();

    (DmnMarshaller.getMarshaller as jest.Mock).mockImplementation((xml) => {
      if (xml === "base") return { parser: { parse: () => baseModel } };
      if (xml === "changed") return { parser: { parse: () => changedModel } };
      return { parser: { parse: () => ({ definitions: {} }) } };
    });

    // 1. Open Diff
    await openDiff("base", "changed");

    expect(setStateMock).toHaveBeenCalled();

    // Capture the state update from openDiff
    let capturedState: any = {
      diff: {},
      diagram: { overlays: {}, diffsByNodeId: new Map(), diffsByEdgeId: new Map() },
      dmn: { model: { definitions: {} }, reset: jest.fn() },
      dispatch: dispatchMock,
    };

    // Apply updates
    for (const call of setStateMock.mock.calls) {
      if (typeof call[0] === "function") {
        call[0](capturedState);
      }
    }

    // Verify Diff Calculation (Integration with dmnDiffAlgorithm)
    const diffsByNodeId = capturedState.diagram.diffsByNodeId as Map<string, DiffChangeType>;
    const diffsByEdgeId = capturedState.diagram.diffsByEdgeId as Map<string, DiffChangeType>;

    console.log("Nodes:", Array.from(diffsByNodeId.keys()));
    console.log("Edges:", Array.from(diffsByEdgeId.keys()));

    expect(diffsByNodeId.get("#decision1")).toBe(DiffChangeType.REMOVED);
    expect(diffsByNodeId.get("#decision2")).toBe(DiffChangeType.ADDED);
    expect(diffsByEdgeId.get("edge1")).toBe(DiffChangeType.REMOVED);
    expect(diffsByEdgeId.get("edge2")).toBe(DiffChangeType.ADDED); // edge2 might be normalized

    // Verify Merged Model (Integration with mergeModels)
    // The merged model is passed to dmn.reset
    expect(dispatchResetMock).toHaveBeenCalled();
    const mergedModel = dispatchResetMock.mock.calls[0][0];

    // Ghost Node Injection: decision1 should be present in merged model
    const mergedDecision1 = mergedModel.definitions.drgElement.find((el: any) => el["@_id"] === "decision1");
    expect(mergedDecision1).toBeDefined();
    expect(mergedDecision1["@_name"]).toBe("Decision 1");

    // In here, we expect edge1 to be present in decision1's requirements
    expect(mergedDecision1.informationRequirement[0]["@_id"]).toBe("edge1");

    // 2. Close Diff
    // Setup state for closeDiff based on what we captured
    setStateMock.mockClear();
    dispatchResetMock.mockClear();

    setStateMock.mockImplementation((updater) => {
      updater(capturedState); // pass the full state with diffs
    });

    // We assume the state currently holds the merged model (from openDiff result)
    capturedState.dmn.model = mergedModel;
    capturedState.diff.isDiffModeEnabled = true;

    closeDiff();

    expect(dispatchResetMock).toHaveBeenCalled();
    const cleanedModel = dispatchResetMock.mock.calls[0][0];

    // Verify Cleanup
    const cleanedDecision1 = cleanedModel.definitions.drgElement.find((el: any) => el["@_id"] === "decision1");
    // decision1 was REMOVED, so it should be gone now
    expect(cleanedDecision1).toBeUndefined();

    // Verify decision2 exists (it was ADDED in changed model)
    const cleanedDecision2 = cleanedModel.definitions.drgElement.find((el: any) => el["@_id"] === "decision2");
    expect(cleanedDecision2).toBeDefined();
  });
  test("updateDiff scenario", async () => {
    const { openDiff, updateDiff } = useDmnDiffController();

    const changedModel2 = {
      definitions: {
        "@_namespace": "https://kie.org/dmn/_base",
        "@_name": "BaseModel",
        "@_id": "_base",
        drgElement: [
          {
            __$$element: "inputData",
            "@_id": "input1",
            "@_name": "Input 1",
          },
          // decision1 REMOVED
          // decision2 NOT ADDED (different from changedModel1)
          {
            __$$element: "decision",
            "@_id": "decision3", // ADDED in changedModel2
            "@_name": "Decision 3",
            informationRequirement: [{ "@_id": "edge3", requiredInput: { "@_href": "#input1" } }],
          },
        ],
        "dmndi:DMNDI": {
          "dmndi:DMNDiagram": [
            {
              "dmndi:DMNDiagramElement": [
                { "@_dmnElementRef": "input1" },
                { "@_dmnElementRef": "decision3" },
                { "@_dmnElementRef": "edge3" },
              ],
            },
          ],
        },
      } as any,
    };

    (DmnMarshaller.getMarshaller as jest.Mock).mockImplementation((xml) => {
      if (xml === "base") return { parser: { parse: () => baseModel } };
      if (xml === "changed") return { parser: { parse: () => changedModel } };
      if (xml === "changed2") return { parser: { parse: () => changedModel2 } };
      return { parser: { parse: () => ({ definitions: {} }) } };
    });

    // 1. Initial Open Diff
    await openDiff("base", "changed");
    expect(setStateMock).toHaveBeenCalled();

    // Setup state for updateDiff (simulate what openDiff would have set)
    const stateAfterOpen = {
      diff: {
        baseModel: baseModel,
        isDiffModeEnabled: true,
        deletedNodeIds: new Set(["#decision1"]),
      },
      diagram: {
        overlays: { enableDiffHighlights: true },
        diffsByNodeId: new Map([
          ["#decision1", DiffChangeType.REMOVED],
          ["#decision2", DiffChangeType.ADDED],
        ]),
        diffsByEdgeId: new Map([
          ["edge1", DiffChangeType.REMOVED],
          ["edge2", DiffChangeType.ADDED],
        ]),
      },
      dmn: { model: { definitions: {} }, reset: jest.fn() },
      dispatch: dispatchMock,
    };

    getStateMock.mockReturnValue(stateAfterOpen);
    setStateMock.mockClear();

    // 2. Update Diff with new model
    await updateDiff("changed2");

    expect(setStateMock).toHaveBeenCalled();
    expect(DmnMarshaller.getMarshaller).toHaveBeenCalledWith("changed2", { upgradeTo: "latest" });

    // Capture state update from updateDiff
    let capturedState: any = { ...stateAfterOpen };
    // We need to reset the specific diff portions to see if they get overwritten
    capturedState.diff = { ...capturedState.diff, deletedNodeIds: new Set() };
    capturedState.diagram = { ...capturedState.diagram, diffsByNodeId: new Map(), diffsByEdgeId: new Map() };

    for (const call of setStateMock.mock.calls) {
      if (typeof call[0] === "function") {
        call[0](capturedState);
      }
    }

    const diffsByNodeId = capturedState.diagram.diffsByNodeId as Map<string, DiffChangeType>;
    const diffsByEdgeId = capturedState.diagram.diffsByEdgeId as Map<string, DiffChangeType>;

    // decision1 was in base, removed in changed2 -> REMOVED
    expect(diffsByNodeId.get("#decision1")).toBe(DiffChangeType.REMOVED);
    // decision2 was in changed1, but NOT in changed2.
    // updateDiff compares BASE vs CHANGED2.
    // decision2 is NOT in BASE, and NOT in CHANGED2. -> Should NOT be in diffs.
    expect(diffsByNodeId.has("#decision2")).toBe(false);

    // decision3 is in changed2, not in base -> ADDED
    expect(diffsByNodeId.get("#decision3")).toBe(DiffChangeType.ADDED);

    expect(diffsByEdgeId.get("edge1")).toBe(DiffChangeType.REMOVED);
    expect(diffsByEdgeId.get("edge3")).toBe(DiffChangeType.ADDED);
  });
});
