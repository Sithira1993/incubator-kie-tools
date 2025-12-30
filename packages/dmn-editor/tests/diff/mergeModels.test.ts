import { mergeModels } from "../../src/diff/algorithms/mergeModels";
import { DiffChangeType, DiffResult } from "../../src/diff/types";
import { createEmptyModel, addDecision, TEST_NAMESPACE } from "./utils";

describe("mergeModels", () => {
  let baseModel = createEmptyModel();
  let changedModel = createEmptyModel();

  beforeEach(() => {
    baseModel = createEmptyModel();
    addDecision(baseModel, { id: "node_a", name: "Node A" });
    addDecision(baseModel, {
      id: "node_b",
      name: "Node B",
      informationRequirements: [{ id: "edge_b", requiredInputId: "node_a" }],
    });

    changedModel = createEmptyModel();
    addDecision(changedModel, { id: "node_a", name: "Node A Modified" });
  });

  const NS = TEST_NAMESPACE;

  it("should restore deleted nodes from base model into merged model", () => {
    const diffResult: DiffResult = {
      nodes: [
        { id: `${NS}#node_b`, changeType: DiffChangeType.REMOVED, kind: "node", elementType: "decision" },
        { id: `${NS}#node_a`, changeType: DiffChangeType.MODIFIED, kind: "node", elementType: "decision" },
      ],
      edges: [
        { id: `${NS}#edge_b`, changeType: DiffChangeType.REMOVED, kind: "edge", elementType: "informationRequirement" },
      ],
      hasChanges: true,
    };

    const merged = mergeModels(baseModel, changedModel, diffResult);

    expect(merged.definitions.drgElement?.length).toBe(2);

    const nodeA = merged.definitions.drgElement?.find((n) => n["@_id"] === "node_a");
    expect(nodeA).toBeDefined();
    expect(nodeA!["@_name"]).toBe("Node A Modified");

    const nodeB = merged.definitions.drgElement?.find((n) => n["@_id"] === "node_b");
    expect(nodeB).toBeDefined();
    expect(nodeB!["@_name"]).toBe("Node B");
    expect((nodeB as any).informationRequirement).toHaveLength(1);
    expect((nodeB as any).informationRequirement[0]["@_id"]).toBe("edge_b");
  });

  it("should restore deleted shapes from base model DMNDI into merged model", () => {
    const diffResult: DiffResult = {
      nodes: [{ id: `${NS}#node_b`, changeType: DiffChangeType.REMOVED, kind: "node", elementType: "decision" }],
      edges: [],
      hasChanges: true,
    };

    const merged = mergeModels(baseModel, changedModel, diffResult);

    const diagramElements = merged.definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0]?.["dmndi:DMNDiagramElement"];
    expect(diagramElements?.length).toBe(2);
    expect(diagramElements?.find((el) => el["@_dmnElementRef"] === "node_b")).toBeDefined();
  });
});
