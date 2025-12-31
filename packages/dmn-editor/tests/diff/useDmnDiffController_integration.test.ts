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
import { setupMockStore, createEmptyModel, addInputData, addDecision, applyStateUpdates } from "./utils";

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
  let storeMocks: ReturnType<typeof setupMockStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    storeMocks = setupMockStore(StoreContext);
  });

  const baseModel = createEmptyModel();
  addInputData(baseModel, { id: "input1", name: "Input 1" });
  addDecision(baseModel, {
    id: "decision1",
    name: "Decision 1",
    informationRequirements: [{ id: "edge1", requiredInputId: "input1" }],
  });

  const changedModel = createEmptyModel();
  addInputData(changedModel, { id: "input1", name: "Input 1" });
  addDecision(changedModel, {
    id: "decision2",
    name: "Decision 2",
    informationRequirements: [{ id: "edge2", requiredInputId: "input1" }],
  });

  test("should correctly handle openDiff and closeDiff lifecycle in complex scenario", async () => {
    const { openDiff, closeDiff } = useDmnDiffController();

    jest.mocked(DmnMarshaller.getMarshaller).mockImplementation((xml) => {
      if (xml === "base") return { parser: { parse: () => baseModel } } as any;
      if (xml === "changed") return { parser: { parse: () => changedModel } } as any;
      return { parser: { parse: () => ({ definitions: {} }) } } as any;
    });

    await openDiff("base", "changed");

    expect(storeMocks.setStateMock).toHaveBeenCalled();

    let capturedState: any = {
      diff: {},
      diagram: { overlays: {}, diffsByNodeId: new Map(), diffsByEdgeId: new Map() },
      dmn: { model: { definitions: {} }, reset: jest.fn() },
      dispatch: storeMocks.dispatchMock,
    };

    applyStateUpdates(storeMocks.setStateMock, capturedState);

    // Verify Diff Calculation
    const diffsByNodeId = capturedState.diagram.diffsByNodeId as Map<string, DiffChangeType>;
    const diffsByEdgeId = capturedState.diagram.diffsByEdgeId as Map<string, DiffChangeType>;

    expect(diffsByNodeId.get(`#decision1`)).toBe(DiffChangeType.REMOVED);
    expect(diffsByNodeId.get(`#decision2`)).toBe(DiffChangeType.ADDED);
    expect(diffsByEdgeId.get(`edge1`)).toBe(DiffChangeType.REMOVED);
    expect(diffsByEdgeId.get(`edge2`)).toBe(DiffChangeType.ADDED);

    expect(storeMocks.dispatchResetMock).toHaveBeenCalled();
    const mergedModel = storeMocks.dispatchResetMock.mock.calls[0][0];

    const mergedDecision1 = mergedModel.definitions.drgElement.find((el: any) => el["@_id"] === "decision1");
    expect(mergedDecision1).toBeDefined();
    expect(mergedDecision1["@_name"]).toBe("Decision 1");

    expect(mergedDecision1.informationRequirement[0]["@_id"]).toBe("edge1");

    storeMocks.setStateMock.mockClear();
    storeMocks.dispatchResetMock.mockClear();

    storeMocks.setStateMock.mockImplementation((updater: any) => {
      updater(capturedState);
    });

    capturedState.dmn.model = mergedModel;
    capturedState.diff.isDiffModeEnabled = true;

    closeDiff();

    expect(storeMocks.dispatchResetMock).toHaveBeenCalled();
    const cleanedModel = storeMocks.dispatchResetMock.mock.calls[0][0];

    // Verify Cleanup
    const cleanedDecision1 = cleanedModel.definitions.drgElement.find((el: any) => el["@_id"] === "decision1");
    expect(cleanedDecision1).toBeUndefined();

    const cleanedDecision2 = cleanedModel.definitions.drgElement.find((el: any) => el["@_id"] === "decision2");
    expect(cleanedDecision2).toBeDefined();
  });
  test("should correctly handle updateDiff lifecycle", async () => {
    const { openDiff, updateDiff } = useDmnDiffController();

    const changedModel2 = createEmptyModel();
    addInputData(changedModel2, { id: "input1", name: "Input 1" });
    addDecision(changedModel2, {
      id: "decision3",
      name: "Decision 3",
      informationRequirements: [{ id: "edge3", requiredInputId: "input1" }],
    });

    (DmnMarshaller.getMarshaller as jest.Mock).mockImplementation((xml) => {
      if (xml === "base") return { parser: { parse: () => baseModel } };
      if (xml === "changed") return { parser: { parse: () => changedModel } };
      if (xml === "changed2") return { parser: { parse: () => changedModel2 } };
      return { parser: { parse: () => ({ definitions: {} }) } };
    });

    await openDiff("base", "changed");
    expect(storeMocks.setStateMock).toHaveBeenCalled();

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
      dispatch: storeMocks.dispatchMock,
    };

    storeMocks.getStateMock.mockReturnValue(stateAfterOpen);
    storeMocks.setStateMock.mockClear();

    await updateDiff("changed2");

    expect(storeMocks.setStateMock).toHaveBeenCalled();
    expect(DmnMarshaller.getMarshaller).toHaveBeenCalledWith("changed2", { upgradeTo: "latest" });

    let capturedState: any = { ...stateAfterOpen };
    capturedState.diff = { ...capturedState.diff, deletedNodeIds: new Set() };
    capturedState.diagram = { ...capturedState.diagram, diffsByNodeId: new Map(), diffsByEdgeId: new Map() };

    applyStateUpdates(storeMocks.setStateMock, capturedState);

    const diffsByNodeId = capturedState.diagram.diffsByNodeId as Map<string, DiffChangeType>;
    const diffsByEdgeId = capturedState.diagram.diffsByEdgeId as Map<string, DiffChangeType>;

    expect(diffsByNodeId.get(`#decision1`)).toBe(DiffChangeType.REMOVED);
    expect(diffsByNodeId.has(`#decision2`)).toBe(false);
    expect(diffsByNodeId.get(`#decision3`)).toBe(DiffChangeType.ADDED);
    expect(diffsByEdgeId.get(`edge1`)).toBe(DiffChangeType.REMOVED);
    expect(diffsByEdgeId.get(`edge3`)).toBe(DiffChangeType.ADDED);
  });
});
