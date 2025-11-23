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
import type { Meta, StoryObj } from "@storybook/react";
import "@patternfly/react-core/dist/styles/base.css";
import { FileUploadArea } from "../../../src/diff/components/DmnDiffUploader";
import { DmnDiffViewer } from "../../../src/diff/components/DmnDiffViewer";
import { DmnDiffFileVersion } from "../../../src/diff/types";

const DmnDiffStory: React.FC = () => {
  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <DmnDiffViewer />
      </div>

      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          zIndex: 1,
          pointerEvents: "none",
          maxWidth: "400px",
          width: "100%",
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(4px)",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            padding: "16px",
            pointerEvents: "auto",
          }}
        >
          <FileUploadArea version={DmnDiffFileVersion.VERSION_A} label="Version A" />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          zIndex: 1,
          pointerEvents: "none",
          maxWidth: "400px",
          width: "100%",
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(4px)",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            padding: "16px",
            pointerEvents: "auto",
          }}
        >
          <FileUploadArea version={DmnDiffFileVersion.VERSION_B} label="Version B" />
        </div>
      </div>
    </div>
  );
};

const meta: Meta = {
  title: "Misc/DMN Diff",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj;

export const Story3SideBySideView: Story = {
  name: "Side by Side View",
  render: () => <DmnDiffStory />,
};
