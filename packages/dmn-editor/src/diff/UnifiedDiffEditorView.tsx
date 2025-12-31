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
import { useCallback, useState, useEffect } from "react";
import { useDmnDiffStore } from "./store/DmnDiffStore";
import { DmnDiffFileVersion } from "./types";
import { FileUploadArea } from "./components/DmnDiffUploader";
import { DmnEditor, DmnEditorRef, OnDmnModelChange } from "../DmnEditor";
import { DmnLatestModel, getMarshaller } from "@kie-tools/dmn-marshaller";
import { normalize } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import "./DmnDiffSideBySideView.css";

export const UnifiedDiffEditorView: React.FC = () => {
  const versionA = useDmnDiffStore((state) => state.versionA);
  const versionB = useDmnDiffStore((state) => state.versionB);
  const isReadyForComparison = useDmnDiffStore((state) => state.isReadyForComparison());

  const [editorRef, setEditorRef] = useState<DmnEditorRef | null>(null);

  const [model, setModel] = useState<DmnLatestModel | undefined>(undefined);

  const onModelChange = useCallback<OnDmnModelChange>((newModel) => {
    setModel(newModel);
  }, []);

  useEffect(() => {
    if (isReadyForComparison && versionA?.content && versionB?.content) {
      // Initialize with changed model (Version B)
      const marshaller = getMarshaller(versionB.content, { upgradeTo: "latest" });
      setModel(normalize(marshaller.parser.parse()));
    } else {
      setModel(undefined);
    }
  }, [isReadyForComparison, versionA, versionB]);

  useEffect(() => {
    if (model && editorRef && versionA?.content && versionB?.content) {
      editorRef.openDiff(versionA.content, versionB.content);
    }
  }, [model, editorRef, versionA, versionB]);

  return (
    <div className="dmn-diff-side-by-side-view">
      {isReadyForComparison && model ? (
        <div
          className="dmn-diff-side-by-side-view__viewer-container"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        >
          <DmnEditor
            ref={setEditorRef}
            model={model}
            originalVersion="1.5"
            onModelChange={onModelChange}
            evaluationResultsByNodeId={new Map()}
            validationMessages={{}}
            isReadOnly={true}
            locale="en"
          />
        </div>
      ) : (
        <>
          <div className="dmn-diff-side-by-side-view__upload-area dmn-diff-side-by-side-view__upload-area--left">
            <div className="dmn-diff-side-by-side-view__upload-overlay">
              <FileUploadArea version={DmnDiffFileVersion.VERSION_A} label="Version 1 (Base)" />
            </div>
          </div>

          <div className="dmn-diff-side-by-side-view__upload-area dmn-diff-side-by-side-view__upload-area--right">
            <div className="dmn-diff-side-by-side-view__upload-overlay">
              <FileUploadArea version={DmnDiffFileVersion.VERSION_B} label="Version 2 (Changed)" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
