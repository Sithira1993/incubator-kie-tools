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

interface DiagramViewerProps {
  readonly label: string;
  readonly model: Normalized<DmnLatestModel>;
  readonly diagramRef: React.RefObject<DiagramRef>;
  readonly sharedViewport: Viewport;
  readonly onViewportChange: (viewport: Viewport) => void;
}

const DiagramViewer: React.FC<DiagramViewerProps> = ({
  label,
  model,
  diagramRef,
  sharedViewport,
  onViewportChange,
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

  useEffect(() => {
    let previousViewport = storeRef.current.getState().diagram.viewport;

    const unsubscribe = storeRef.current.subscribe((state) => {
      const viewport = state.diagram.viewport;
      if (viewport && !isApplyingViewportRef.current) {
        const newViewport: Viewport = { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
        if (
          !previousViewport ||
          Math.abs(previousViewport.x - newViewport.x) > 0.1 ||
          Math.abs(previousViewport.y - newViewport.y) > 0.1 ||
          Math.abs(previousViewport.zoom - newViewport.zoom) > 0.001
        ) {
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

    if (
      lastEmittedViewportRef.current &&
      Math.abs(lastEmittedViewportRef.current.x - sharedViewport.x) < 0.1 &&
      Math.abs(lastEmittedViewportRef.current.y - sharedViewport.y) < 0.1 &&
      Math.abs(lastEmittedViewportRef.current.zoom - sharedViewport.zoom) < 0.001
    ) {
      return;
    }

    const rfInstance = diagramRef.current?.getReactFlowInstance();
    if (!rfInstance) {
      return;
    }

    const currentViewport = rfInstance.getViewport();
    const hasChanged =
      Math.abs(currentViewport.x - sharedViewport.x) > 0.1 ||
      Math.abs(currentViewport.y - sharedViewport.y) > 0.1 ||
      Math.abs(currentViewport.zoom - sharedViewport.zoom) > 0.001;

    if (hasChanged) {
      isApplyingViewportRef.current = true;
      rfInstance.setViewport(sharedViewport);
      setTimeout(() => {
        isApplyingViewportRef.current = false;
      }, 50);
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

  /**
   * Focus on an element in both diagrams by its ID
   * The elementId is in the format returned by buildXmlHref: "namespace#id"
   */
  const handleItemClick = useCallback((elementId: string) => {
    const focusOnElement = (diagramRef: React.RefObject<DiagramRef>) => {
      const rfInstance = diagramRef.current?.getReactFlowInstance();
      if (!rfInstance) {
        return;
      }

      // Try to find the node by ID (exact match)
      const nodes = rfInstance.getNodes();
      const node = nodes.find((n) => n.id === elementId);

      if (node) {
        // Focus on the node using fitBounds
        const nodeBounds = {
          x: node.position.x,
          y: node.position.y,
          width: node.width ?? 200,
          height: node.height ?? 100,
        };

        rfInstance.fitBounds(nodeBounds, {
          padding: 100,
          duration: 300,
        });
        return;
      }

      // If not found as a node, try to find connected edges
      const edges = rfInstance.getEdges();
      const edge = edges.find((e) => e.id === elementId);

      if (edge) {
        // For edges, focus on both source and target nodes if available
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);

        if (sourceNode && targetNode) {
          // Focus on the bounding box containing both nodes
          const minX = Math.min(sourceNode.position.x, targetNode.position.x);
          const minY = Math.min(sourceNode.position.y, targetNode.position.y);
          const maxX = Math.max(
            sourceNode.position.x + (sourceNode.width ?? 200),
            targetNode.position.x + (targetNode.width ?? 200)
          );
          const maxY = Math.max(
            sourceNode.position.y + (sourceNode.height ?? 100),
            targetNode.position.y + (targetNode.height ?? 100)
          );

          rfInstance.fitBounds(
            {
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
            },
            {
              padding: 100,
              duration: 300,
            }
          );
        } else if (sourceNode) {
          const nodeBounds = {
            x: sourceNode.position.x,
            y: sourceNode.position.y,
            width: sourceNode.width ?? 200,
            height: sourceNode.height ?? 100,
          };
          rfInstance.fitBounds(nodeBounds, {
            padding: 100,
            duration: 300,
          });
        } else if (targetNode) {
          const nodeBounds = {
            x: targetNode.position.x,
            y: targetNode.position.y,
            width: targetNode.width ?? 200,
            height: targetNode.height ?? 100,
          };
          rfInstance.fitBounds(nodeBounds, {
            padding: 100,
            duration: 300,
          });
        }
      }
    };

    // Focus on both diagrams
    focusOnElement(diagramARef);
    focusOnElement(diagramBRef);
  }, []);

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
