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
import { TimesIcon } from "@patternfly/react-icons/dist/js/icons/times-icon";
import { ListIcon } from "@patternfly/react-icons/dist/js/icons/list-icon";
import { DiffResult, ElementDiff } from "../types";
import { DmnDiffChangeListItem } from "./DmnDiffChangeListItem";
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

function useVirtualizedList<T>(items: T[], containerRef: React.RefObject<HTMLDivElement>, itemHeight: number = 60) {
  const [visibleRange, setVisibleRange] = React.useState({ start: 0, end: Math.min(20, items.length) });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) {
      setVisibleRange({ start: 0, end: Math.min(20, items.length) });
      return;
    }

    const updateVisibleRange = () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
      const end = Math.min(items.length, start + Math.ceil(containerHeight / itemHeight) + 4);

      setVisibleRange({ start, end });
    };

    updateVisibleRange();
    container.addEventListener("scroll", updateVisibleRange);
    const resizeObserver = new ResizeObserver(updateVisibleRange);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", updateVisibleRange);
      resizeObserver.disconnect();
    };
  }, [containerRef, itemHeight, items.length]);

  return visibleRange;
}

export const DmnDiffChangeList: React.FC<DmnDiffChangeListProps> = ({ diffResult, isOpen, onToggle, onItemClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allChanges = useMemo(() => {
    if (!diffResult || !diffResult.hasChanges) {
      return [];
    }
    return combineDiffs(diffResult);
  }, [diffResult]);

  const visibleRange = useVirtualizedList(allChanges, containerRef, 60);

  const handleItemClick = useCallback(
    (elementId: string) => {
      onItemClick(elementId);
    },
    [onItemClick]
  );

  const visibleItems = useMemo(() => {
    return allChanges.slice(visibleRange.start, visibleRange.end);
  }, [allChanges, visibleRange]);

  const itemHeight = 60;
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
          <>
            <div style={{ height: offsetY }} />
            <div ref={listRef}>
              {visibleItems.map((change, index) => {
                const actualIndex = visibleRange.start + index;
                return (
                  <DmnDiffChangeListItem
                    key={change.id}
                    index={actualIndex}
                    change={change}
                    onClick={() => handleItemClick(change.id)}
                  />
                );
              })}
            </div>
            <div style={{ height: Math.max(0, totalHeight - offsetY - visibleItems.length * itemHeight) }} />
          </>
        )}
      </div>
      {allChanges.length > 0 && (
        <div className="dmn-diff-change-list__footer">
          {allChanges.length} change{allChanges.length !== 1 ? "s" : ""} found
        </div>
      )}
    </div>
  );
};
