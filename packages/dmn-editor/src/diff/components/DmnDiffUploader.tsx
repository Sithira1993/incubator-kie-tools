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
import { useCallback, useRef, useState } from "react";
import { Button } from "@patternfly/react-core/dist/js/components/Button";
import { Label } from "@patternfly/react-core/dist/js/components/Label";
import { Spinner } from "@patternfly/react-core/dist/js/components/Spinner";
import { Alert, AlertActionCloseButton } from "@patternfly/react-core/dist/js/components/Alert";
import { UploadIcon } from "@patternfly/react-icons/dist/js/icons/upload-icon";
import { FileIcon } from "@patternfly/react-icons/dist/js/icons/file-icon";
import { TimesCircleIcon } from "@patternfly/react-icons/dist/js/icons/times-circle-icon";
import { CheckCircleIcon } from "@patternfly/react-icons/dist/js/icons/check-circle-icon";
import { useDmnDiffStore } from "../store/DmnDiffStore";
import { DmnDiffFileVersion } from "../types";
import { ALLOWED_FILE_EXTENSION } from "../constants";
import "./DmnDiffUploader.css";

export interface FileUploadAreaProps {
  readonly version: DmnDiffFileVersion;
  readonly label: string;
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({ version, label }) => {
  const { setFile, clearFile, versionA, versionB, versionAError, versionBError, isLoadingA, isLoadingB } =
    useDmnDiffStore();

  const file = version === DmnDiffFileVersion.VERSION_A ? versionA : versionB;
  const error = version === DmnDiffFileVersion.VERSION_A ? versionAError : versionBError;
  const isLoading = version === DmnDiffFileVersion.VERSION_A ? isLoadingA : isLoadingB;

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        void setFile(version, selectedFile);
      }
      // Reset input to allow selecting the same file again
      event.target.value = "";
    },
    [version, setFile]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      const droppedFile = event.dataTransfer.files[0];
      if (droppedFile) {
        void setFile(version, droppedFile);
      }
    },
    [version, setFile]
  );

  const handleClick = useCallback(() => {
    if (!file && !isLoading) {
      fileInputRef.current?.click();
    }
  }, [file, isLoading]);

  const handleClear = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      clearFile(version);
    },
    [version, clearFile]
  );

  const handleChooseAnotherFile = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.key === "Enter" || event.key === " ") && !file && !isLoading) {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [file, isLoading]
  );

  const getUploadAreaClassName = () => {
    let className = "dmn-diff-uploader__upload-area";
    if (isDragOver) {
      className += " dmn-diff-uploader__upload-area--drag-over";
    }
    if (error) {
      className += " dmn-diff-uploader__upload-area--has-error";
    }
    return className;
  };

  const isInteractive = !file && !isLoading;
  const interactiveProps = isInteractive
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": `Click or drag to upload ${label}`,
      }
    : {};

  return (
    <div className="dmn-diff-uploader__version">
      <span className="dmn-diff-uploader__version-label">{label}</span>
      {/* When the upload area is interactive, the role and tabIndex are set to allow keyboard navigation */}
      <div
        className={getUploadAreaClassName()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...interactiveProps}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_FILE_EXTENSION}
          onChange={handleFileChange}
          className="dmn-diff-uploader__input"
          aria-label={`Upload ${label}`}
        />

        {isLoading && (
          <div className="dmn-diff-uploader__loading">
            <Spinner size="lg" />
            <div style={{ marginTop: "12px" }}>Loading file...</div>
          </div>
        )}

        {!isLoading && !file && !error && (
          <>
            <UploadIcon className="dmn-diff-uploader__upload-icon" />
            <div className="dmn-diff-uploader__upload-text">
              <strong>Click to upload {label}</strong> or drag and drop
            </div>
            <div className="dmn-diff-uploader__upload-hint">DMN files only (max 5MB)</div>
          </>
        )}

        {!isLoading && file && (
          <div className="dmn-diff-uploader__file-info">
            <div className="dmn-diff-uploader__file-name">
              <FileIcon />
              <span>{file.name}</span>
              <Button variant="plain" onClick={handleClear} aria-label="Clear file">
                <TimesCircleIcon />
              </Button>
            </div>
            <Label color="green" icon={<CheckCircleIcon />}>
              File loaded successfully
            </Label>
          </div>
        )}

        {!isLoading && error && (
          <div className="dmn-diff-uploader__error">
            <Alert
              variant="danger"
              title={error.message}
              actionClose={<AlertActionCloseButton onClose={() => clearFile(version)} />}
              isInline
            />
            <div style={{ marginTop: "12px" }}>
              <Button variant="link" onClick={handleChooseAnotherFile}>
                Choose another file
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const DmnDiffUploader: React.FC = () => {
  return (
    <div className="dmn-diff-uploader">
      <div className="dmn-diff-uploader__container">
        <FileUploadArea version={DmnDiffFileVersion.VERSION_A} label="Version A" />
        <FileUploadArea version={DmnDiffFileVersion.VERSION_B} label="Version B" />
      </div>
    </div>
  );
};
