import * as React from "react";
import { useDmnEditorStore } from "../store/StoreContext";
import { DiffChangeType } from "../diff/types";
import {
  DIFF_ADDED_COLOR,
  DIFF_MODIFIED_COLOR,
  DIFF_REMOVED_COLOR,
  OVERLAY_ADDED_BG,
  OVERLAY_REMOVED_BG,
} from "../diff/styles/diffHighlightStyles";

import "../diff/components/DiffCellTooltip.css";

import { Tooltip } from "@patternfly/react-core/dist/js/components/Tooltip";

interface DiffPropertyFieldProps {
  elementId: string | undefined;
  propertyName: string;
  children: React.ReactNode;
}

export function DiffPropertyField({ elementId, propertyName, children }: DiffPropertyFieldProps) {
  const diffResult = useDmnEditorStore((s) => s.diff.diffResult);
  const isDiffModeEnabled = useDmnEditorStore((s) => s.diff.isDiffModeEnabled);

  if (!isDiffModeEnabled || !elementId || !diffResult) {
    return <>{children}</>;
  }

  const nodeDiff = diffResult.nodes.find((n) => {
    const nId = n.id.includes("#") ? n.id.split("#").pop() : n.id;
    const eId = elementId.includes("#") ? elementId.split("#").pop() : elementId;
    return nId === eId;
  });
  const edgeDiff = diffResult.edges.find((e) => {
    const eId = e.id.includes("#") ? e.id.split("#").pop() : e.id;
    const elId = elementId.includes("#") ? elementId.split("#").pop() : elementId;
    return eId === elId;
  });
  const elementDiff = nodeDiff || edgeDiff;

  if (!elementDiff) {
    return <>{children}</>;
  }

  let style: React.CSSProperties = {};
  let tooltipContent: React.ReactNode = null;

  if (elementDiff.changeType === DiffChangeType.ADDED) {
    style = {
      border: `1px solid ${DIFF_ADDED_COLOR}`,
      backgroundColor: OVERLAY_ADDED_BG,
      borderRadius: "4px",
      padding: "6px",
    };
    tooltipContent = "Added";
  } else if (elementDiff.changeType === DiffChangeType.REMOVED) {
    style = {
      border: `1px solid ${DIFF_REMOVED_COLOR}`,
      backgroundColor: OVERLAY_REMOVED_BG,
      borderRadius: "4px",
      padding: "6px",
    };
    tooltipContent = "Removed";
  } else if (elementDiff.changeType === DiffChangeType.MODIFIED && elementDiff.changedProperties) {
    const propChange = elementDiff.changedProperties.find((p) => p.property === propertyName);
    if (propChange) {
      style = {
        border: `2px solid ${DIFF_MODIFIED_COLOR}`,
        backgroundColor: "rgba(255, 235, 59, 0.1)",
        borderRadius: "4px",
      };

      const previousValue = propChange.previousValue;
      const newValue = propChange.currentValue;

      tooltipContent = (
        <div className="dmn-diff-tooltip-content" style={{ textAlign: "left" }}>
          <div className="dmn-diff-tooltip-header">Change Details</div>
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
      );
    }
  }

  if (Object.keys(style).length === 0) {
    return <>{children}</>;
  }

  return (
    <Tooltip content={tooltipContent}>
      <div style={style}>{children}</div>
    </Tooltip>
  );
}
