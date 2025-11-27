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

import * as React from "react";
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useDmnDiffStore } from "../store/DmnDiffStore";
import "./DmnDiffViewer.css";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { Computed, createDmnEditorStore } from "../../store/Store";
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
import { Viewport } from "reactflow";
import { DmnDiffChangeList } from "./DmnDiffChangeList";
import { parseXmlHref, buildXmlHref } from "@kie-tools/dmn-marshaller/dist/xml";
import { DiffResult, DiffChangeType, DmnDiffFileVersion } from "../types";

interface DiagramViewerProps {
  readonly label: string;
  readonly model: Normalized<DmnLatestModel>;
  readonly diagramRef: React.RefObject<DiagramRef>;
  readonly sharedViewport: Viewport;
  readonly onViewportChange: (viewport: Viewport) => void;
  readonly diffResult: DiffResult | null;
  readonly version: DmnDiffFileVersion;
}

const VIEWPORT_EPSILONS = { x: 0.1, y: 0.1, zoom: 0.001 };
const VIEWPORT_APPLY_DEBOUNCE_MS = 50;

const areViewportsApproximatelyEqual = (a?: Viewport | null, b?: Viewport | null) => {
  if (!a || !b) {
    return false;
  }

  return (
    Math.abs(a.x - b.x) < VIEWPORT_EPSILONS.x &&
    Math.abs(a.y - b.y) < VIEWPORT_EPSILONS.y &&
    Math.abs(a.zoom - b.zoom) < VIEWPORT_EPSILONS.zoom
  );
};

const DiagramViewer: React.FC<DiagramViewerProps> = ({
  label,
  model,
  diagramRef,
  sharedViewport,
  onViewportChange,
  diffResult,
  version,
}) => {
  const store = useMemo(
    () => createDmnEditorStore(model, new ComputedStateCache<Computed>(INITIAL_COMPUTED_CACHE)),
    [model]
  );
  const storeRef = useRef<StoreApiType>(store);
  storeRef.current = store;

  const containerRef = useRef<HTMLDivElement>(null);
  const isApplyingViewportRef = useRef(false);
  const lastEmittedViewportRef = useRef<Viewport | null>(null);

  useEffect(() => {
    storeRef.current.setState((state) => {
      state.dmn.model = model;
    });
  }, [model, store]);

  // Memoize the creation of diffsByNodeId and diffsByEdgeId Maps
  const diffsByNodeId = useMemo(() => {
    const map = new Map();
    const isVersionA = version === DmnDiffFileVersion.VERSION_A;
    const isVersionB = version === DmnDiffFileVersion.VERSION_B;

    if (diffResult) {
      for (const nodeDiff of diffResult.nodes) {
        const parsed = parseXmlHref(nodeDiff.id);
        const namespace = model.definitions["@_namespace"];
        const normalizedId =
          !parsed.namespace || parsed.namespace === namespace
            ? buildXmlHref({ id: parsed.id })
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });

        const isRemovedOrModified =
          nodeDiff.changeType === DiffChangeType.REMOVED || nodeDiff.changeType === DiffChangeType.MODIFIED;
        const isAddedOrModified =
          nodeDiff.changeType === DiffChangeType.ADDED || nodeDiff.changeType === DiffChangeType.MODIFIED;

        if ((isVersionA && isRemovedOrModified) || (isVersionB && isAddedOrModified)) {
          map.set(normalizedId, nodeDiff.changeType);
        }
      }
    }
    return map;
  }, [diffResult, version, model]);

  const diffsByEdgeId = useMemo(() => {
    const map = new Map();
    const isVersionA = version === DmnDiffFileVersion.VERSION_A;
    const isVersionB = version === DmnDiffFileVersion.VERSION_B;

    if (diffResult) {
      for (const edgeDiff of diffResult.edges) {
        const parsed = parseXmlHref(edgeDiff.id);
        const namespace = model.definitions["@_namespace"];
        const normalizedId =
          !parsed.namespace || parsed.namespace === namespace
            ? parsed.id ?? edgeDiff.id
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });

        if (!normalizedId) {
          continue;
        }

        const isRemovedOrModified =
          edgeDiff.changeType === DiffChangeType.REMOVED || edgeDiff.changeType === DiffChangeType.MODIFIED;
        const isAddedOrModified =
          edgeDiff.changeType === DiffChangeType.ADDED || edgeDiff.changeType === DiffChangeType.MODIFIED;

        if ((isVersionA && isRemovedOrModified) || (isVersionB && isAddedOrModified)) {
          map.set(normalizedId, edgeDiff.changeType);
        }
      }
    }
    return map;
  }, [diffResult, version, model]);

  useEffect(() => {
    storeRef.current.setState((state) => {
      state.diagram.overlays.enableDiffHighlights = !!diffResult;
      state.diagram.diffsByNodeId = diffsByNodeId;
      state.diagram.diffsByEdgeId = diffsByEdgeId;
    });
  }, [diffResult, diffsByNodeId, diffsByEdgeId]);

  useEffect(() => {
    let previousViewport = storeRef.current.getState().diagram.viewport;

    const unsubscribe = storeRef.current.subscribe((state) => {
      const viewport = state.diagram.viewport;
      if (viewport && !isApplyingViewportRef.current) {
        const newViewport: Viewport = { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
        if (!previousViewport || !areViewportsApproximatelyEqual(previousViewport, newViewport)) {
          previousViewport = viewport;
          lastEmittedViewportRef.current = newViewport;
          onViewportChange(newViewport);
        }
      }
    });

    return unsubscribe;
  }, [onViewportChange]);

  useEffect(() => {
    if (isApplyingViewportRef.current) {
      return;
    }

    if (areViewportsApproximatelyEqual(lastEmittedViewportRef.current, sharedViewport)) {
      return;
    }

    const rfInstance = diagramRef.current?.getReactFlowInstance();
    if (!rfInstance) {
      return;
    }

    const currentViewport = rfInstance.getViewport();
    const hasChanged = !areViewportsApproximatelyEqual(currentViewport, sharedViewport);

    if (hasChanged) {
      isApplyingViewportRef.current = true;
      rfInstance.setViewport(sharedViewport);
      setTimeout(() => {
        isApplyingViewportRef.current = false;
      }, VIEWPORT_APPLY_DEBOUNCE_MS);
    }
  }, [sharedViewport, diagramRef]);

  return (
    <div className="dmn-diff-viewer__panel">
      <div className="dmn-diff-viewer__panel-header">{label}</div>
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
  );
};

const EmptyPanel: React.FC<{ readonly label: string }> = ({ label }) => (
  <div className="dmn-diff-viewer__panel dmn-diff-viewer__panel--empty">
    <div className="dmn-diff-viewer__panel-header">{label}</div>
    <div className="dmn-diff-viewer__empty-state">No diagram loaded</div>
  </div>
);

export const DmnDiffViewer: React.FC = () => {
  const { versionA, versionB, diffResult, isChangeListOpen, toggleChangeList } = useDmnDiffStore();
  const [sharedViewport, setSharedViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const diagramARef = useRef<DiagramRef>(null);
  const diagramBRef = useRef<DiagramRef>(null);

  const handleViewportChange = useCallback((viewport: Viewport) => {
    setSharedViewport(viewport);
  }, []);

  const handleItemClick = useCallback(
    (elementId: string) => {
      const focusOnElement = (diagramRef: React.RefObject<DiagramRef>, modelNamespace: string | undefined) => {
        const rfInstance = diagramRef.current?.getReactFlowInstance();
        if (!rfInstance) {
          return;
        }

        const parsed = parseXmlHref(elementId);
        if (!parsed.id) {
          return;
        }

        const normalizedNodeId =
          !parsed.namespace || parsed.namespace === modelNamespace
            ? `#${parsed.id}`
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });

        const normalizedEdgeId =
          !parsed.namespace || parsed.namespace === modelNamespace
            ? parsed.id
            : buildXmlHref({ namespace: parsed.namespace, id: parsed.id });

        const nodes = rfInstance.getNodes();
        const edges = rfInstance.getEdges();

        const node = nodes.find((n) => n.id === normalizedNodeId);

        if (node) {
          const centerX = node.position.x + (node.width ?? 200) / 2;
          const centerY = node.position.y + (node.height ?? 100) / 2;

          rfInstance.setCenter(centerX, centerY, { duration: 300 });
          return;
        }

        const edge = edges.find((e) => e.id === normalizedEdgeId || e.id === normalizedNodeId);

        if (edge) {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          const targetNode = nodes.find((n) => n.id === edge.target);

          if (sourceNode && targetNode) {
            const sourceCenterX = sourceNode.position.x + (sourceNode.width ?? 200) / 2;
            const sourceCenterY = sourceNode.position.y + (sourceNode.height ?? 100) / 2;
            const targetCenterX = targetNode.position.x + (targetNode.width ?? 200) / 2;
            const targetCenterY = targetNode.position.y + (targetNode.height ?? 100) / 2;

            const centerX = (sourceCenterX + targetCenterX) / 2;
            const centerY = (sourceCenterY + targetCenterY) / 2;

            rfInstance.setCenter(centerX, centerY, { duration: 300 });
          } else if (sourceNode) {
            const centerX = sourceNode.position.x + (sourceNode.width ?? 200) / 2;
            const centerY = sourceNode.position.y + (sourceNode.height ?? 100) / 2;

            rfInstance.setCenter(centerX, centerY, { duration: 300 });
          } else if (targetNode) {
            const centerX = targetNode.position.x + (targetNode.width ?? 200) / 2;
            const centerY = targetNode.position.y + (targetNode.height ?? 100) / 2;

            rfInstance.setCenter(centerX, centerY, { duration: 300 });
          }
        }
      };

      const namespaceA = versionA?.model?.definitions?.["@_namespace"];
      const namespaceB = versionB?.model?.definitions?.["@_namespace"];

      focusOnElement(diagramARef, namespaceA);
      focusOnElement(diagramBRef, namespaceB);

      if (isChangeListOpen) {
        toggleChangeList();
      }
    },
    [versionA, versionB, isChangeListOpen, toggleChangeList]
  );

  return (
    <div className="dmn-diff-viewer">
      <div className="dmn-diff-viewer__panels">
        {versionA?.model ? (
          <DiagramViewer
            label="Version A"
            model={versionA.model}
            diagramRef={diagramARef}
            sharedViewport={sharedViewport}
            onViewportChange={handleViewportChange}
            diffResult={diffResult}
            version={DmnDiffFileVersion.VERSION_A}
          />
        ) : (
          <EmptyPanel label="Version A" />
        )}
        {versionB?.model ? (
          <DiagramViewer
            label="Version B"
            model={versionB.model}
            diagramRef={diagramBRef}
            sharedViewport={sharedViewport}
            onViewportChange={handleViewportChange}
            diffResult={diffResult}
            version={DmnDiffFileVersion.VERSION_B}
          />
        ) : (
          <EmptyPanel label="Version B" />
        )}
      </div>
      <DmnDiffChangeList
        diffResult={diffResult}
        isOpen={isChangeListOpen}
        onToggle={toggleChangeList}
        onItemClick={handleItemClick}
      />
    </div>
  );
};
