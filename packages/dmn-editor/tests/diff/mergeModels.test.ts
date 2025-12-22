import { mergeModels } from "../../src/diff/algorithms/mergeModels";
import { DiffChangeType, DiffResult } from "../../src/diff/types";
import { DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";

describe("mergeModels", () => {
  const baseModel: Normalized<DmnLatestModel> = {
    definitions: {
      "@_namespace": "https://kie.org/dmn/_base",
      "@_name": "BaseModel",
      "@_id": "_base",
      drgElement: [
        {
          __$$element: "decision",
          "@_id": "node_a",
          "@_name": "Node A",
        } as any,
        {
          __$$element: "decision",
          "@_id": "node_b", // This one will be deleted
          "@_name": "Node B",
          informationRequirement: [{ "@_id": "edge_b", requiredInput: { "@_href": "#node_a" } }],
        } as any,
      ],
      "dmndi:DMNDI": {
        "dmndi:DMNDiagram": [
          {
            "dmndi:DMNDiagramElement": [{ "@_dmnElementRef": "node_a" }, { "@_dmnElementRef": "node_b" }],
          },
        ],
      },
    },
  } as any;

  const changedModel: Normalized<DmnLatestModel> = {
    definitions: {
      "@_namespace": "https://kie.org/dmn/_base", // Same namespace
      "@_name": "BaseModel",
      "@_id": "_base",
      drgElement: [
        {
          __$$element: "decision",
          "@_id": "node_a",
          "@_name": "Node A Modified",
        } as any,
        // Node B is missing
      ],
      "dmndi:DMNDI": {
        "dmndi:DMNDiagram": [
          {
            "dmndi:DMNDiagramElement": [{ "@_dmnElementRef": "node_a" }],
          },
        ],
      },
    },
  } as any;

  it("should inject deleted nodes back into the merged model", () => {
    const diffResult: DiffResult = {
      nodes: [
        { id: "node_b", changeType: DiffChangeType.REMOVED, kind: "node", elementType: "decision" },
        { id: "node_a", changeType: DiffChangeType.MODIFIED, kind: "node", elementType: "decision" },
      ],
      edges: [
        { id: "edge_b", changeType: DiffChangeType.REMOVED, kind: "edge", elementType: "informationRequirement" },
      ],
      hasChanges: true,
    };

    const merged = mergeModels(baseModel, changedModel, diffResult);

    expect(merged.definitions.drgElement?.length).toBe(2);

    const nodeA = merged.definitions.drgElement?.find((n) => n["@_id"] === "node_a");
    expect(nodeA).toBeDefined();
    expect(nodeA!["@_name"]).toBe("Node A Modified"); // Should keep changed version

    const nodeB = merged.definitions.drgElement?.find((n) => n["@_id"] === "node_b");
    expect(nodeB).toBeDefined();
    expect(nodeB!["@_name"]).toBe("Node B"); // Should be restored from base matches
    expect((nodeB as any).informationRequirement).toHaveLength(1);
  });

  it("should inject deleted shapes back into the merged model", () => {
    const diffResult: DiffResult = {
      nodes: [{ id: "node_b", changeType: DiffChangeType.REMOVED, kind: "node", elementType: "decision" }],
      edges: [],
      hasChanges: true,
    };

    const merged = mergeModels(baseModel, changedModel, diffResult);

    // Check DMNDI
    const diagramElements = merged.definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0]?.["dmndi:DMNDiagramElement"];
    expect(diagramElements?.length).toBe(2);
    expect(diagramElements?.find((el) => el["@_dmnElementRef"] === "node_b")).toBeDefined();
  });
});
