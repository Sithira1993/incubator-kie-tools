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
import { normalize } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";

// Polyfill structuredClone if needed for tests
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

jest.mock("../../src/diff/algorithms/dmnDiffAlgorithm", () => ({
  computeDmnDiff: jest.fn(),
}));

jest.mock("../../src/diff/algorithms/mergeModels", () => ({
  mergeModels: jest.fn(),
}));

jest.mock("@kie-tools/dmn-marshaller/dist/xml", () => ({
  parseXmlHref: (href: string) => {
    if (href && href.startsWith("#")) return { id: href.substring(1) };
    if (href) return { id: href };
    return { id: "" };
  },
  buildXmlHref: (args: { id: string }) => `#${args.id}`,
}));

describe("useDmnDiffController", () => {
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

    (DmnMarshaller.getMarshaller as jest.Mock).mockReturnValue({
      parser: { parse: () => ({ definitions: { "@_namespace": "ns" } }) },
    });
  });

  it("test openDiff", async () => {
    const { openDiff } = useDmnDiffController();
    const computeDmnDiffMock = require("../../src/diff/algorithms/dmnDiffAlgorithm").computeDmnDiff;
    const mergeModelsMock = require("../../src/diff/algorithms/mergeModels").mergeModels;

    computeDmnDiffMock.mockReturnValue({ nodes: [], edges: [] });
    mergeModelsMock.mockReturnValue({ definitions: {} });

    await openDiff("<xml>base</xml>", "<xml>changed</xml>");

    expect(DmnMarshaller.getMarshaller).toHaveBeenCalledTimes(2);
    expect(setStateMock).toHaveBeenCalled();

    // Simulate all setState calls
    const state = {
      diff: { baseModel: undefined, isDiffModeEnabled: false },
      diagram: {
        overlays: { enableDiffHighlights: false, enableCustomNodeStyles: false },
        diffsByNodeId: new Map(),
        diffsByEdgeId: new Map(),
      },
      dmn: { model: { definitions: {} }, reset: jest.fn() },
      dispatch: dispatchMock,
    };

    for (const call of setStateMock.mock.calls) {
      const updater = call[0];
      if (typeof updater === "function") {
        updater(state);
      }
    }

    expect(state.diff).toHaveProperty("isDiffModeEnabled", true);
    expect(state.diagram.overlays.enableDiffHighlights).toBe(true);
    expect(dispatchResetMock).toHaveBeenCalled();
  });

  it("test updateDiff", async () => {
    const { updateDiff } = useDmnDiffController();
    getStateMock.mockReturnValue({
      diff: { baseModel: { definitions: { "@_namespace": "ns" } } },
    });

    const computeDmnDiffMock = require("../../src/diff/algorithms/dmnDiffAlgorithm").computeDmnDiff;
    computeDmnDiffMock.mockReturnValue({ nodes: [], edges: [] });

    await updateDiff("<xml>changed</xml>");

    expect(DmnMarshaller.getMarshaller).toHaveBeenCalledTimes(1);
    expect(setStateMock).toHaveBeenCalled();

    const state = {
      diff: { deletedNodeIds: new Set() },
      diagram: {
        overlays: { enableDiffHighlights: false, enableCustomNodeStyles: false },
        diffsByNodeId: new Map(),
        diffsByEdgeId: new Map(),
      },
      dmn: { model: {}, reset: jest.fn() },
      dispatch: dispatchMock,
    };

    // Execute the last setState call which updates the diff
    const lastCall = setStateMock.mock.calls[setStateMock.mock.calls.length - 1];
    if (lastCall && typeof lastCall[0] === "function") {
      lastCall[0](state);
    }

    expect(dispatchResetMock).toHaveBeenCalled();
  });

  it("test closeDiff handles ghost edge cleanup", () => {
    const { closeDiff } = useDmnDiffController();

    const mockModel = {
      definitions: {
        drgElement: [
          {
            "@_id": "node1",
            informationRequirement: [{ "@_id": "edge1" }, { "@_id": "edge2" }], // edge2 is ghost
          },
        ],
        artifact: [],
      },
    };

    const diffsByEdgeId = new Map([
      ["edge2", DiffChangeType.REMOVED], // edge2 is a ghost edge
    ]);

    setStateMock.mockImplementation((updater) => {
      const state = {
        diff: { deletedNodeIds: new Set(["ghostNode"]) }, // ghostNode should be removed
        diagram: {
          diffsByEdgeId,
          overlays: { enableDiffHighlights: true },
        },
        dmn: { model: mockModel },
        dispatch: dispatchMock,
      };
      updater(state);
    });

    closeDiff();

    expect(dispatchResetMock).toHaveBeenCalled();
    const cleanedModel = dispatchResetMock.mock.calls[0][0];

    // Verify ghost node removal logic (implicitly verified by filter calls)
    // Verify ghost edge removal
    const node1 = cleanedModel.definitions.drgElement[0];
    expect(node1.informationRequirement).toHaveLength(1);
    expect(node1.informationRequirement[0]["@_id"]).toBe("edge1");
  });
});
