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
 * software distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
 * OR CONDITIONS OF ANY KIND, either express or implied.  See the
 * License for the specific language governing permissions and
 * limitations under the License.
 */

import * as React from "react";
import { DmnDiffViewer } from "./components/DmnDiffViewer";
import { FileUploadArea } from "./components/DmnDiffUploader";
import { DmnDiffFileVersion } from "./types";
import { useDmnDiffStore } from "./store/DmnDiffStore";
import "./DmnDiffSideBySideView.css";

export const DmnDiffSideBySideView: React.FC = () => {
  const isReadyForComparison = useDmnDiffStore(
    (state) =>
      state.versionA !== null &&
      state.versionB !== null &&
      state.versionAError === null &&
      state.versionBError === null &&
      !state.isLoadingA &&
      !state.isLoadingB
  );

  return (
    <div className="dmn-diff-side-by-side-view">
      {isReadyForComparison && (
        <div className="dmn-diff-side-by-side-view__viewer-container">
          <DmnDiffViewer />
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
