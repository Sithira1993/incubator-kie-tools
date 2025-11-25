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
import { useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@patternfly/react-core/dist/js/components/Button";
import { Title } from "@patternfly/react-core/dist/js/components/Title";
import { Label } from "@patternfly/react-core/dist/js/components/Label";
import { TimesIcon } from "@patternfly/react-icons/dist/js/icons/times-icon";
import { ListIcon } from "@patternfly/react-icons/dist/js/icons/list-icon";
import { DiffResult, ElementDiff, EdgeDiff, DiffChangeType } from "../types";
import "./DmnDiffChangeList.css";

export interface DmnDiffChangeListProps {
  readonly diffResult: DiffResult | null;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onItemClick: (elementId: string) => void;
}

function combineDiffs(diffResult: DiffResult): ElementDiff[] {
  const allChanges: ElementDiff[] = [...diffResult.nodes, ...diffResult.edges];
  return allChanges.sort((a, b) => {
    const typeOrder: Record<string, number> = {
      REMOVED: 0,
      MODIFIED: 1,
      ADDED: 2,
    };
    const typeDiff = (typeOrder[a.changeType] ?? 3) - (typeOrder[b.changeType] ?? 3);
    if (typeDiff !== 0) {
      return typeDiff;
    }
    const nameA = a.elementName || a.id;
    const nameB = b.elementName || b.id;
    return nameA.localeCompare(nameB);
  });
}

function useVirtualizedList<T>(items: T[], containerRef: React.RefObject<HTMLDivElement>, itemHeight: number = 48) {
  const [visibleRange, setVisibleRange] = React.useState({ start: 0, end: items.length });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) {
      setVisibleRange({ start: 0, end: items.length });
      return;
    }

    const updateVisibleRange = () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;

      const itemsPerView = Math.ceil(containerHeight / itemHeight);

      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 3);

      const end = Math.min(items.length, start + itemsPerView + 6);

      setVisibleRange({ start, end });
    };

    updateVisibleRange();

    container.addEventListener("scroll", updateVisibleRange, { passive: true });

    const resizeObserver = new ResizeObserver(updateVisibleRange);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", updateVisibleRange);
      resizeObserver.disconnect();
    };
  }, [containerRef, itemHeight, items.length]);

  return visibleRange;
}

function isEdgeDiff(change: ElementDiff): change is EdgeDiff {
  return (change as EdgeDiff).kind === "edge";
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

export const DmnDiffChangeList: React.FC<DmnDiffChangeListProps> = ({ diffResult, isOpen, onToggle, onItemClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const allChanges = useMemo(() => {
    if (!diffResult?.hasChanges) {
      return [];
    }
    return combineDiffs(diffResult);
  }, [diffResult]);

  const visibleRange = useVirtualizedList(allChanges, containerRef, 48);

  const handleRowClick = useCallback(
    (elementId: string) => {
      onItemClick(elementId);
    },
    [onItemClick]
  );

  const visibleItems = useMemo(() => {
    return allChanges.slice(visibleRange.start, visibleRange.end);
  }, [allChanges, visibleRange]);

  const itemHeight = 48;
  const totalHeight = allChanges.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  if (!isOpen) {
    return (
      <Button
        variant="primary"
        onClick={onToggle}
        className="dmn-diff-change-list__toggle-button"
        aria-label="Open change list"
        icon={<ListIcon />}
      >
        List of Changes
        {allChanges.length > 0 && ` (${allChanges.length})`}
      </Button>
    );
  }

  return (
    <div className="dmn-diff-change-list">
      <div className="dmn-diff-change-list__header">
        <Title headingLevel="h3" size="md">
          List of Changes
        </Title>
        <Button variant="plain" onClick={onToggle} aria-label="Close change list" icon={<TimesIcon />} />
      </div>
      <div className="dmn-diff-change-list__content" ref={containerRef}>
        {allChanges.length === 0 ? (
          <div className="dmn-diff-change-list__empty">No changes detected</div>
        ) : (
          <div className="dmn-diff-change-list__table-wrapper" style={{ height: totalHeight }}>
            <table className="dmn-diff-change-list__table" ref={tableRef}>
              <thead>
                <tr>
                  <th className="dmn-diff-change-list__table-header dmn-diff-change-list__table-header--index">#</th>
                  <th className="dmn-diff-change-list__table-header dmn-diff-change-list__table-header--name">Name</th>
                  <th className="dmn-diff-change-list__table-header dmn-diff-change-list__table-header--type">Type</th>
                  <th className="dmn-diff-change-list__table-header dmn-diff-change-list__table-header--change">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {offsetY > 0 && (
                  <tr style={{ height: offsetY }}>
                    <td colSpan={4} style={{ padding: 0, border: "none", height: offsetY }} />
                  </tr>
                )}
                {visibleItems.map((change, index) => {
                  const actualIndex = visibleRange.start + index;
                  const isEdge = isEdgeDiff(change);
                  const displayName = isEdge ? "Edge" : change.elementName || change.id;
                  const truncatedName = displayName.length > 40 ? `${displayName.substring(0, 40)}...` : displayName;

                  return (
                    <tr
                      key={change.id}
                      className="dmn-diff-change-list__table-row"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRowClick(change.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRowClick(change.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      style={{ height: itemHeight }}
                    >
                      <td className="dmn-diff-change-list__table-cell dmn-diff-change-list__table-cell--index">
                        {actualIndex}
                      </td>
                      <td
                        className="dmn-diff-change-list__table-cell dmn-diff-change-list__table-cell--name"
                        title={displayName}
                      >
                        {truncatedName}
                      </td>
                      <td className="dmn-diff-change-list__table-cell dmn-diff-change-list__table-cell--type">
                        {change.elementType}
                      </td>
                      <td className="dmn-diff-change-list__table-cell dmn-diff-change-list__table-cell--change">
                        <Label color={getChangeTypeColor(change.changeType)}>
                          {getChangeTypeLabel(change.changeType)}
                        </Label>
                      </td>
                    </tr>
                  );
                })}
                {totalHeight - offsetY - visibleItems.length * itemHeight > 0 && (
                  <tr style={{ height: totalHeight - offsetY - visibleItems.length * itemHeight }}>
                    <td colSpan={4} style={{ padding: 0, border: "none" }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {allChanges.length > 0 && (
        <div className="dmn-diff-change-list__footer">
          {allChanges.length} change{allChanges.length === 1 ? "" : "s"} found
        </div>
      )}
    </div>
  );
};
