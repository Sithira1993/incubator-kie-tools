import * as React from "react";
import { useMemo, useState, useEffect, useRef } from "react";
import { DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { mergeModels } from "../algorithms/mergeModels";
import { DiffChangeType, DiffResult } from "../types";
import { parseXmlHref, buildXmlHref } from "@kie-tools/dmn-marshaller/dist/xml";
import { createDmnEditorStore, Computed } from "../../store/Store";
import { ComputedStateCache } from "../../store/ComputedStateCache";
import { INITIAL_COMPUTED_CACHE } from "../../store/computed/initial";
import { DmnEditorStoreApiContext, StoreApiType } from "../../store/StoreContext";
import { DmnEditorExternalModelsContextProvider } from "../../includedModels/DmnEditorDependenciesContext";
import { DmnEditorSettingsContextProvider } from "../../settings/DmnEditorSettingsContext";
import { DmnEditorContextProvider } from "../../DmnEditorContext";
import { Diagram, DiagramRef } from "../../diagram/Diagram";
import { I18nDictionariesProvider } from "@kie-tools-core/i18n/dist/react-components";
import { dmnEditorDictionaries, DmnEditorI18nContext, dmnEditorI18nDefaults } from "../../i18n";
import { CommandsContextProvider } from "../../commands/CommandsContextProvider";
import { DIFF_ADDED_COLOR, DIFF_MODIFIED_COLOR, DIFF_REMOVED_COLOR } from "../styles/diffHighlightStyles";
import "./DmnDiffViewer.css";

export interface DmnUnifiedDiffViewerProps {
  modelA: Normalized<DmnLatestModel>;
  modelB: Normalized<DmnLatestModel>;
  diffResult: DiffResult;
}

const VIEWPORT_EPSILONS = { x: 0.1, y: 0.1, zoom: 0.001 };
/* ... helper functions ... */

export const DmnUnifiedDiffViewer = ({ modelA, modelB, diffResult }: DmnUnifiedDiffViewerProps) => {
  const [mergedModel, setMergedModel] = useState<Normalized<DmnLatestModel> | undefined>();

  useEffect(() => {
    if (modelA && modelB && diffResult) {
      try {
        const merged = mergeModels(modelA, modelB, diffResult);
        setMergedModel(merged);
      } catch (e) {
        console.error("Failed to compute merged model for diff", e);
      }
    } else {
      setMergedModel(undefined);
    }
  }, [modelA, modelB, diffResult]);

  if (!mergedModel) {
    return <div>Initializing unified view...</div>;
  }

  return <UnifiedDiagramViewer model={mergedModel} diffResult={diffResult} />;
};

interface UnifiedDiagramViewerProps {
  model: Normalized<DmnLatestModel>;
  diffResult: DiffResult;
}

const UnifiedDiagramViewer: React.FC<UnifiedDiagramViewerProps> = ({ model, diffResult }) => {
  const store = useMemo(
    () => createDmnEditorStore(model, new ComputedStateCache<Computed>(INITIAL_COMPUTED_CACHE)),
    [model]
  );
  const storeRef = useRef<StoreApiType>(store);
  storeRef.current = store;

  const containerRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<DiagramRef>(null);

  useEffect(() => {
    storeRef.current.setState((state) => {
      state.dmn.model = model;
    });
  }, [model, store]);

  // Compute diff maps for highlighting
  const { diffsByNodeId, diffsByEdgeId } = useMemo(() => {
    const nodes = new Map<string, DiffChangeType>();
    const edges = new Map<string, DiffChangeType>();

    if (diffResult) {
      // For unified view, we show ALL changes directly on the merged model.
      // The merged model IDs should match the changed model IDs or base model IDs (ghost nodes).

      for (const nodeDiff of diffResult.nodes) {
        const parsed = parseXmlHref(nodeDiff.id);
        const namespace = model.definitions["@_namespace"];
        const normalizedId =
          !parsed.namespace || parsed.namespace === namespace
            ? buildXmlHref({ id: parsed.id })
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });

        nodes.set(normalizedId, nodeDiff.changeType);
      }

      for (const edgeDiff of diffResult.edges) {
        const parsed = parseXmlHref(edgeDiff.id);
        const namespace = model.definitions["@_namespace"];
        const normalizedId =
          !parsed.namespace || parsed.namespace === namespace
            ? parsed.id ?? edgeDiff.id
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });

        if (normalizedId) {
          edges.set(normalizedId, edgeDiff.changeType);
        }
      }
    }
    return { diffsByNodeId: nodes, diffsByEdgeId: edges };
  }, [diffResult, model]);

  useEffect(() => {
    storeRef.current.setState((state) => {
      state.diagram.overlays.enableDiffHighlights = true;
      state.diagram.diffsByNodeId = diffsByNodeId;
      state.diagram.diffsByEdgeId = diffsByEdgeId;
      // Ensure we can see everything
      state.diagram.overlays.enableCustomNodeStyles = true;
    });
  }, [diffsByNodeId, diffsByEdgeId]);

  return (
    <div className="dmn-diff-viewer">
      <div className="dmn-diff-viewer__panels">
        <div className="dmn-diff-viewer__panel">
          <div className="dmn-diff-viewer__panel-header">Unified View</div>
          <div className="dmn-diff-viewer__diagram-container" ref={containerRef}>
            <I18nDictionariesProvider
              defaults={dmnEditorI18nDefaults}
              dictionaries={dmnEditorDictionaries}
              initialLocale={undefined}
              ctx={DmnEditorI18nContext}
            >
              <DmnEditorContextProvider
                model={model}
                externalContextName={undefined}
                externalContextDescription={undefined}
                issueTrackerHref={undefined}
                onRequestToJumpToPath={undefined}
                onRequestToResolvePath={undefined}
                evaluationResultsByNodeId={new Map()}
              >
                <DmnEditorSettingsContextProvider isReadOnly={true}>
                  <DmnEditorExternalModelsContextProvider
                    externalModelsByNamespace={{}}
                    onRequestExternalModelByPath={async () => null}
                    onRequestExternalModelsAvailableToInclude={async () => []}
                  >
                    <DmnEditorStoreApiContext.Provider value={storeRef.current}>
                      <CommandsContextProvider>
                        <Diagram container={containerRef} ref={diagramRef} />
                      </CommandsContextProvider>
                    </DmnEditorStoreApiContext.Provider>
                  </DmnEditorExternalModelsContextProvider>
                </DmnEditorSettingsContextProvider>
              </DmnEditorContextProvider>
            </I18nDictionariesProvider>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="dmn-diff-viewer__legend">
        <div>
          <span style={{ color: DIFF_ADDED_COLOR, fontWeight: "bold" }}>Green</span>: Added
        </div>
        <div>
          <span style={{ color: DIFF_REMOVED_COLOR, fontWeight: "bold" }}>Red</span>: Removed
        </div>
        <div>
          <span style={{ color: DIFF_MODIFIED_COLOR, fontWeight: "bold" }}>Yellow</span>: Modified
        </div>
      </div>
    </div>
  );
};
