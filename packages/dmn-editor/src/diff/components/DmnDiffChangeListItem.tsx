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
import { Label } from "@patternfly/react-core/dist/js/components/Label";
import { DiffChangeType, ElementDiff } from "../types";
import "./DmnDiffChangeListItem.css";

export interface DmnDiffChangeListItemProps {
  readonly index: number;
  readonly change: ElementDiff;
  readonly onClick: () => void;
}

const getChangeTypeColor = (changeType: DiffChangeType): "green" | "red" | "orange" => {
  switch (changeType) {
    case DiffChangeType.ADDED:
      return "green";
    case DiffChangeType.REMOVED:
      return "red";
    case DiffChangeType.MODIFIED:
      return "orange";
  }
};

const getChangeTypeLabel = (changeType: DiffChangeType): string => {
  switch (changeType) {
    case DiffChangeType.ADDED:
      return "Added";
    case DiffChangeType.REMOVED:
      return "Removed";
    case DiffChangeType.MODIFIED:
      return "Changed";
  }
};

export const DmnDiffChangeListItem: React.FC<DmnDiffChangeListItemProps> = ({ index, change, onClick }) => {
  const displayName = change.elementName || change.id;
  const truncatedName = displayName.length > 40 ? `${displayName.substring(0, 40)}...` : displayName;

  return (
    <div
      className="dmn-diff-change-list-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="dmn-diff-change-list-item__index">{index}</div>
      <div className="dmn-diff-change-list-item__content">
        <div className="dmn-diff-change-list-item__name" title={displayName}>
          {truncatedName}
        </div>
        <div className="dmn-diff-change-list-item__type">{change.elementType}</div>
      </div>
      <div className="dmn-diff-change-list-item__change">
        <Label color={getChangeTypeColor(change.changeType)}>{getChangeTypeLabel(change.changeType)}</Label>
      </div>
    </div>
  );
};
