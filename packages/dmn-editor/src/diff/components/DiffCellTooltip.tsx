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
import "./DiffCellTooltip.css";

export interface DiffCellTooltipProps {
  x: number;
  y: number;
  previousValue: string;
  newValue: string;
  isVisible: boolean;
}

export const DiffCellTooltip: React.FC<DiffCellTooltipProps> = ({ x, y, previousValue, newValue, isVisible }) => {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({
    top: y + 15,
    left: x + 15,
    visibility: "hidden", // Hide initially to measure
  });

  React.useLayoutEffect(() => {
    if (tooltipRef.current && isVisible) {
      const rect = tooltipRef.current.getBoundingClientRect();
      let newLeft = x + 15;
      let newTop = y + 15;

      // Horizontal overflow check
      if (newLeft + rect.width > window.innerWidth - 20) {
        newLeft = x - rect.width - 15;
      }

      // Vertical overflow check
      if (newTop + rect.height > window.innerHeight - 20) {
        newTop = y - rect.height - 15;
      }

      setStyle({
        top: newTop,
        left: newLeft,
        visibility: "visible",
      });
    }
  }, [x, y, isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div ref={tooltipRef} className="dmn-diff-tooltip" style={style}>
      <div className="dmn-diff-tooltip-header">Change Details</div>
      <div className="dmn-diff-tooltip-content">
        <div className="dmn-diff-tooltip-row">
          <span className="dmn-diff-tooltip-label">Previous:</span>
          <span className="dmn-diff-tooltip-value dmn-diff-tooltip-previous">
            {previousValue || <span className="dmn-diff-tooltip-empty">(empty)</span>}
          </span>
        </div>
        <div className="dmn-diff-tooltip-divider" />
        <div className="dmn-diff-tooltip-row">
          <span className="dmn-diff-tooltip-label">New:</span>
          <span className="dmn-diff-tooltip-value dmn-diff-tooltip-new">
            {newValue || <span className="dmn-diff-tooltip-empty">(empty)</span>}
          </span>
        </div>
      </div>
    </div>
  );
};
