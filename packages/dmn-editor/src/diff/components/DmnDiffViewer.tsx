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
import { useMemo, useRef, useEffect } from "react";
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
import { Diagram } from "../../diagram/Diagram";
import { I18nDictionariesProvider } from "@kie-tools-core/i18n/dist/react-components";
import { dmnEditorDictionaries, DmnEditorI18nContext, dmnEditorI18nDefaults } from "../../i18n";
import { CommandsContextProvider } from "../../commands/CommandsContextProvider";

interface DiagramViewerProps {
  label: string;
  model: Normalized<DmnLatestModel>;
}

const DiagramViewer: React.FC<DiagramViewerProps> = ({ label, model }) => {
  // Create a store for this diagram viewer
  const store = useMemo(
    () => createDmnEditorStore(model, new ComputedStateCache<Computed>(INITIAL_COMPUTED_CACHE)),
    [model]
  );
  const storeRef = useRef<StoreApiType>(store);
  storeRef.current = store;

  const containerRef = useRef<HTMLDivElement>(null);

  // Update store when model changes
  useEffect(() => {
    storeRef.current.setState((state) => {
      state.dmn.model = model;
    });
  }, [model, store]);

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
                    <Diagram container={containerRef} />
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

export const DmnDiffViewer: React.FC = () => {
  const { versionA, versionB } = useDmnDiffStore();

  // If no models are loaded, show empty state
  if (!versionA?.model && !versionB?.model) {
    return (
      <div className="dmn-diff-viewer">
        <div className="dmn-diff-viewer__panels">
          <div className="dmn-diff-viewer__panel dmn-diff-viewer__panel--empty">
            <div className="dmn-diff-viewer__panel-header">Version A</div>
            <div className="dmn-diff-viewer__empty-state">No diagram loaded</div>
          </div>
          <div className="dmn-diff-viewer__panel dmn-diff-viewer__panel--empty">
            <div className="dmn-diff-viewer__panel-header">Version B</div>
            <div className="dmn-diff-viewer__empty-state">No diagram loaded</div>
          </div>
        </div>
      </div>
    );
  }

  // Show loaded diagrams (can show one or both)
  return (
    <div className="dmn-diff-viewer">
      <div className="dmn-diff-viewer__panels">
        {versionA?.model ? (
          <DiagramViewer label="Version A" model={versionA.model} />
        ) : (
          <div className="dmn-diff-viewer__panel dmn-diff-viewer__panel--empty">
            <div className="dmn-diff-viewer__panel-header">Version A</div>
            <div className="dmn-diff-viewer__empty-state">No diagram loaded</div>
          </div>
        )}
        {versionB?.model ? (
          <DiagramViewer label="Version B" model={versionB.model} />
        ) : (
          <div className="dmn-diff-viewer__panel dmn-diff-viewer__panel--empty">
            <div className="dmn-diff-viewer__panel-header">Version B</div>
            <div className="dmn-diff-viewer__empty-state">No diagram loaded</div>
          </div>
        )}
      </div>
    </div>
  );
};
