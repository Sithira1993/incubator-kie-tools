import { useCallback } from "react";
import { DmnLatestModel, getMarshaller } from "@kie-tools/dmn-marshaller";
import { normalize, Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { useDmnEditorStoreApi } from "../../store/StoreContext";
import { computeDmnDiff } from "../algorithms/dmnDiffAlgorithm";
import { mergeModels } from "../algorithms/mergeModels";
import { DiffChangeType } from "../types";
import { parseXmlHref, buildXmlHref } from "@kie-tools/dmn-marshaller/dist/xml";

export function useDmnDiffController() {
  const dmnEditorStoreApi = useDmnEditorStoreApi();

  const updateStateWithDiff = useCallback(
    (baseModel: Normalized<DmnLatestModel>, changedModel: Normalized<DmnLatestModel>) => {
      const diffResult = computeDmnDiff(baseModel, changedModel);
      const mergedModel = mergeModels(baseModel, changedModel, diffResult);

      // Compute diff maps for highlighting
      const diffsByNodeId = new Map<string, DiffChangeType>();
      const diffsByEdgeId = new Map<string, DiffChangeType>();
      const deletedNodeIds = new Set<string>();

      for (const nodeDiff of diffResult.nodes) {
        const parsed = parseXmlHref(nodeDiff.id);
        const normalizedId =
          !parsed.namespace || parsed.namespace === baseModel.definitions["@_namespace"]
            ? buildXmlHref({ id: parsed.id })
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });
        if (normalizedId) {
          diffsByNodeId.set(normalizedId, nodeDiff.changeType);
          if (nodeDiff.changeType === DiffChangeType.REMOVED) {
            deletedNodeIds.add(normalizedId);
          }
        }
      }

      for (const edgeDiff of diffResult.edges) {
        const parsed = parseXmlHref(edgeDiff.id);
        const normalizedId =
          !parsed.namespace || parsed.namespace === baseModel.definitions["@_namespace"]
            ? parsed.id ?? edgeDiff.id
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });
        if (normalizedId) {
          diffsByEdgeId.set(normalizedId, edgeDiff.changeType);
        }
      }

      dmnEditorStoreApi.setState((state) => {
        state.diff.deletedNodeIds = deletedNodeIds;
        state.diagram.diffsByNodeId = diffsByNodeId;
        state.diagram.diffsByEdgeId = diffsByEdgeId;

        // Ensure styles are active
        state.diagram.overlays.enableDiffHighlights = true;
        state.diagram.overlays.enableCustomNodeStyles = true;

        // Update the merged model
        state.dispatch(state).dmn.reset(mergedModel);
      });
    },
    [dmnEditorStoreApi]
  );

  const openDiff = useCallback(
    async (baseModelXml: string, changedModelXml: string) => {
      const baseMarshaller = getMarshaller(baseModelXml, { upgradeTo: "latest" });
      const changedMarshaller = getMarshaller(changedModelXml, { upgradeTo: "latest" });

      const baseModel = normalize(baseMarshaller.parser.parse());
      const changedModel = normalize(changedMarshaller.parser.parse());

      dmnEditorStoreApi.setState((state) => {
        state.diff.isDiffModeEnabled = true;
        state.diff.baseModel = baseModel;
      });

      updateStateWithDiff(baseModel, changedModel);
    },
    [dmnEditorStoreApi, updateStateWithDiff]
  );

  const updateDiff = useCallback(
    async (changedModelXml: string) => {
      const state = dmnEditorStoreApi.getState();
      const baseModel = state.diff.baseModel;

      if (!baseModel) {
        console.error("DMN Editor: Cannot update diff. Base model is undefined.");
        return;
      }

      const changedMarshaller = getMarshaller(changedModelXml, { upgradeTo: "latest" });
      const changedModel = normalize(changedMarshaller.parser.parse());

      updateStateWithDiff(baseModel, changedModel);
    },
    [dmnEditorStoreApi, updateStateWithDiff]
  );

  const closeDiff = useCallback(() => {
    dmnEditorStoreApi.setState((state) => {
      const deletedNodeIds = state.diff.deletedNodeIds;
      const diffsByEdgeId = state.diagram.diffsByEdgeId;
      const currentModel = state.dmn.model;

      state.diff.isDiffModeEnabled = false;
      state.diff.baseModel = undefined;
      state.diff.deletedNodeIds = new Set();
      state.diagram.diffsByNodeId = new Map();
      state.diagram.diffsByEdgeId = new Map();
      state.diagram.overlays.enableDiffHighlights = false;

      // Filter out deleted node IDs to restore the original model state.
      // This effectively removes the visual highlights and the injected "deleted" nodes.
      const cleanModel = structuredClone(currentModel);

      const deletedEdgeIds = new Set<string>();
      if (diffsByEdgeId) {
        for (const [id, type] of diffsByEdgeId) {
          if (type === DiffChangeType.REMOVED) {
            deletedEdgeIds.add(id);
          }
        }
      }

      const isDeleted = (id: string, deletedSet: Set<string>) =>
        deletedSet.has(id) || deletedSet.has(`#${id}`) || deletedSet.has(id.replace(/^#/, ""));

      if (cleanModel.definitions.drgElement) {
        cleanModel.definitions.drgElement = cleanModel.definitions.drgElement.filter(
          (el: any) => !isDeleted(el["@_id"], deletedNodeIds)
        );

        for (const element of cleanModel.definitions.drgElement) {
          const el = element as any;
          if (el.informationRequirement) {
            el.informationRequirement = el.informationRequirement.filter(
              (req: any) => !isDeleted(req["@_id"], deletedEdgeIds)
            );
          }
          if (el.knowledgeRequirement) {
            el.knowledgeRequirement = el.knowledgeRequirement.filter(
              (req: any) => !isDeleted(req["@_id"], deletedEdgeIds)
            );
          }
          if (el.authorityRequirement) {
            el.authorityRequirement = el.authorityRequirement.filter(
              (req: any) => !isDeleted(req["@_id"], deletedEdgeIds)
            );
          }
        }
      }

      if (cleanModel.definitions.artifact) {
        cleanModel.definitions.artifact = cleanModel.definitions.artifact.filter(
          (el: any) => !isDeleted(el["@_id"], deletedNodeIds) && !isDeleted(el["@_id"], deletedEdgeIds)
        );
      }

      if (cleanModel.definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0]?.["dmndi:DMNDiagramElement"]) {
        cleanModel.definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"][0]["dmndi:DMNDiagramElement"] =
          cleanModel.definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"][0]["dmndi:DMNDiagramElement"].filter(
            (el: any) =>
              !isDeleted(el["@_dmnElementRef"], deletedNodeIds) && !isDeleted(el["@_dmnElementRef"], deletedEdgeIds)
          );
      }

      // We do not exhaustively clean up edges here as the removal of nodes
      // implicitly handles most edge cases in the visualizer.
      state.dispatch(state).dmn.reset(cleanModel);
    });
  }, [dmnEditorStoreApi]);

  return { openDiff, updateDiff, closeDiff };
}
