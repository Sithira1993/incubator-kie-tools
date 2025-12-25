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
import { useEffect, useRef, useState } from "react";
import type { BoxedExpressionDiff, LiteralExpressionDiff } from "../types";
import { DiffCellTooltip } from "./DiffCellTooltip";
import { MOUSEMOVE_THROTTLE_MS } from "../constants";
import { throttle } from "../utils/domUtils";
import {
  OVERLAY_ADDED_BG,
  OVERLAY_ADDED_BORDER,
  OVERLAY_REMOVED_BG,
  OVERLAY_REMOVED_BORDER,
  OVERLAY_REMOVED_OPACITY,
  OVERLAY_MODIFIED_BG,
  OVERLAY_MODIFIED_BORDER,
} from "../styles/diffHighlightStyles";

export interface LiteralExpressionDiffOverlayProps {
  diff: BoxedExpressionDiff;
  expressionHolderId: string;
}

interface TooltipState {
  isVisible: boolean;
  x: number;
  y: number;
  previousValue: string;
  newValue: string;
}

/**
 * Detects if an entire literal expression was added or removed.
 */
function detectFullLiteralChange(diff: LiteralExpressionDiff): "added" | "removed" | null {
  // If text was added (previousValue is undefined/empty)
  if (diff.text?.previousValue === undefined && diff.text?.currentValue !== undefined) {
    return "added";
  }
  // If text was removed (currentValue is undefined/empty)
  if (diff.text?.previousValue !== undefined && diff.text?.currentValue === undefined) {
    return "removed";
  }
  return null;
}

/**
 * CSS-based diff overlay for Literal Expressions.
 * Highlights the table cells within the literal expression.
 */
export function LiteralExpressionDiffOverlay({ diff, expressionHolderId }: LiteralExpressionDiffOverlayProps) {
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    isVisible: false,
    x: 0,
    y: 0,
    previousValue: "",
    newValue: "",
  });

  // Determine diff type and extract literal diff if applicable
  const isExpressionReplacement = diff.kind === "expressionReplacement";
  const isLiteralDiff = diff.kind === "literalExpression";
  const literalDiff = isLiteralDiff ? (diff as LiteralExpressionDiff) : null;

  useEffect(() => {
    // Early return if not a supported diff type
    if (!isExpressionReplacement && !isLiteralDiff) {
      return;
    }

    // Create style element if needed
    if (!styleElementRef.current) {
      styleElementRef.current = document.createElement("style");
      styleElementRef.current.id = `dmn-diff-overlay-${expressionHolderId}`;
      document.head.appendChild(styleElementRef.current);
    }

    // Handle expressionReplacement (entire expression was replaced)
    if (isExpressionReplacement) {
      const isAdded = diff.previousType === "undefined";
      const backgroundColor = isAdded ? OVERLAY_ADDED_BG : OVERLAY_REMOVED_BG;
      const borderColor = isAdded ? OVERLAY_ADDED_BORDER : OVERLAY_REMOVED_BORDER;
      const opacity = isAdded ? 1 : OVERLAY_REMOVED_OPACITY;

      styleElementRef.current.textContent = `
        [data-expression-holder-id="${expressionHolderId}"] .literal-expression table,
        [data-expression-holder-id="${expressionHolderId}"] .literal-expression th,
        [data-expression-holder-id="${expressionHolderId}"] .literal-expression td {
          background-color: ${backgroundColor} !important;
          border-color: ${borderColor} !important;
          opacity: ${opacity};
        }
      `;

      return () => {
        if (styleElementRef.current) {
          styleElementRef.current.remove();
          styleElementRef.current = null;
        }
      };
    }

    // Handle granular LiteralExpressionDiff
    if (literalDiff) {
      const fullChange = detectFullLiteralChange(literalDiff);

      if (fullChange) {
        const backgroundColor = fullChange === "added" ? OVERLAY_ADDED_BG : OVERLAY_REMOVED_BG;
        const borderColor = fullChange === "added" ? OVERLAY_ADDED_BORDER : OVERLAY_REMOVED_BORDER;
        const opacity = fullChange === "added" ? 1 : OVERLAY_REMOVED_OPACITY;

        styleElementRef.current.textContent = `
          [data-expression-holder-id="${expressionHolderId}"] .literal-expression table,
          [data-expression-holder-id="${expressionHolderId}"] .literal-expression th,
          [data-expression-holder-id="${expressionHolderId}"] .literal-expression td {
            background-color: ${backgroundColor} !important;
            border-color: ${borderColor} !important;
            opacity: ${opacity};
            cursor: pointer !important;
          }
        `;
      } else if (literalDiff.text || literalDiff.label || literalDiff.typeRef) {
        styleElementRef.current.textContent = `
          [data-expression-holder-id="${expressionHolderId}"] .literal-expression table,
          [data-expression-holder-id="${expressionHolderId}"] .literal-expression th,
          [data-expression-holder-id="${expressionHolderId}"] .literal-expression td {
            background-color: ${OVERLAY_MODIFIED_BG} !important;
            border-color: ${OVERLAY_MODIFIED_BORDER} !important;
            cursor: pointer !important;
          }
        `;
      }

      // Add mousemove handler for tooltip
      const handleMouseMove = throttle((e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const th = target.closest("th");
        const td = target.closest("td");

        if (th && (literalDiff.label || literalDiff.typeRef)) {
          const headerPrevious: string[] = [];
          const headerChanges: string[] = [];

          if (literalDiff.label) {
            headerPrevious.push(`Label: ${literalDiff.label.previousValue ?? "(empty)"}`);
            headerChanges.push(`Label: ${literalDiff.label.currentValue ?? "(empty)"}`);
          }
          if (literalDiff.typeRef) {
            headerPrevious.push(`Type: ${literalDiff.typeRef.previousValue ?? "(empty)"}`);
            headerChanges.push(`Type: ${literalDiff.typeRef.currentValue ?? "(empty)"}`);
          }

          setTooltip({
            isVisible: true,
            x: e.clientX,
            y: e.clientY,
            previousValue: headerPrevious.join("\n"),
            newValue: headerChanges.join("\n"),
          });
        } else if (td && literalDiff.text) {
          setTooltip({
            isVisible: true,
            x: e.clientX,
            y: e.clientY,
            previousValue: `Text: ${literalDiff.text.previousValue ?? "(empty)"}`,
            newValue: `Text: ${literalDiff.text.currentValue ?? "(empty)"}`,
          });
        } else {
          setTooltip((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
        }
      }, MOUSEMOVE_THROTTLE_MS);

      const expressionContainer = document.querySelector(`[data-expression-holder-id="${expressionHolderId}"]`);
      if (expressionContainer) {
        expressionContainer.addEventListener("mousemove", handleMouseMove);
      }

      return () => {
        setTooltip({ isVisible: false, x: 0, y: 0, previousValue: "", newValue: "" });
        if (styleElementRef.current) {
          styleElementRef.current.remove();
          styleElementRef.current = null;
        }
        if (expressionContainer) {
          expressionContainer.removeEventListener("mousemove", handleMouseMove);
        }
      };
    }
  }, [diff, expressionHolderId, isExpressionReplacement, isLiteralDiff, literalDiff]);

  // Only render tooltip for literal expression diffs (not for expression replacements)
  if (!isLiteralDiff) {
    return null;
  }

  return (
    <DiffCellTooltip
      x={tooltip.x}
      y={tooltip.y}
      previousValue={tooltip.previousValue}
      newValue={tooltip.newValue}
      isVisible={tooltip.isVisible}
    />
  );
}
