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
import { DmnUnifiedDiffViewer } from "./components/DmnUnifiedDiffViewer";
import { FileUploadArea } from "./components/DmnDiffUploader";
import { DmnDiffFileVersion } from "./types";
import { useDmnDiffStore } from "./store/DmnDiffStore";
import "./DmnDiffSideBySideView.css";

export const DmnUnifiedDiffView: React.FC = () => {
  const { isReadyForComparison, versionA, versionB, diffResult } = useDmnDiffStore((state) => ({
    isReadyForComparison:
      state.versionA !== null &&
      state.versionB !== null &&
      state.versionAError === null &&
      state.versionBError === null &&
      !state.isLoadingA &&
      !state.isLoadingB,
    versionA: state.versionA,
    versionB: state.versionB,
    diffResult: state.diffResult,
  }));

  return (
    <div className="dmn-diff-side-by-side-view">
      {isReadyForComparison && versionA?.model && versionB?.model && diffResult && (
        <div className="dmn-diff-side-by-side-view__viewer-container">
          <DmnUnifiedDiffViewer modelA={versionA.model} modelB={versionB.model} diffResult={diffResult} />
        </div>
      )}

      <div className="dmn-diff-side-by-side-view__upload-area dmn-diff-side-by-side-view__upload-area--left">
        <div className="dmn-diff-side-by-side-view__upload-overlay">
          <FileUploadArea version={DmnDiffFileVersion.VERSION_A} label="Version A" />
        </div>
      </div>

      <div className="dmn-diff-side-by-side-view__upload-area dmn-diff-side-by-side-view__upload-area--right">
        <div className="dmn-diff-side-by-side-view__upload-overlay">
          <FileUploadArea version={DmnDiffFileVersion.VERSION_B} label="Version B" />
        </div>
      </div>
    </div>
  );
};
