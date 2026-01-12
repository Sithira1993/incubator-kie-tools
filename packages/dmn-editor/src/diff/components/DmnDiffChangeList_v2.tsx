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
import { useState, useMemo, useCallback } from "react";
import { Button } from "@patternfly/react-core/dist/js/components/Button";
import { Title } from "@patternfly/react-core/dist/js/components/Title";
import { Label } from "@patternfly/react-core/dist/js/components/Label";
import { TimesIcon } from "@patternfly/react-icons/dist/js/icons/times-icon";
import { ListIcon } from "@patternfly/react-icons/dist/js/icons/list-icon";
import { AngleRightIcon } from "@patternfly/react-icons/dist/js/icons/angle-right-icon";
import {
  DiffResult,
  NodeDiff,
  BoxedExpressionDiff,
  DiffPropertyChange,
  DecisionTableDiff,
  ContextDiff,
  FunctionDefinitionDiff,
  ListDiff,
  InvocationDiff,
  RelationDiff,
  ConditionalDiff,
  FilterDiff,
  EveryDiff,
  SomeDiff,
  ForDiff,
  LiteralExpressionDiff,
  ExpressionReplacementDiff,
  DiffChangeType,
} from "../types";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { DmnLatestModel, DMN_LATEST__tInformationItem } from "@kie-tools/dmn-marshaller";
import "./DmnDiffChangeList_v2.css";

export interface DmnDiffChangeList_v2Props {
  readonly diffResult: DiffResult | null;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly versionA?: Normalized<DmnLatestModel>;
  readonly versionB?: Normalized<DmnLatestModel>;
}

/** Displays property changes with previous and current values */
const PropertyChangeDisplay: React.FC<{ change: DiffPropertyChange; propertyName: string }> = ({
  change,
  propertyName,
}) => {
  // Format property name to be more user-friendly
  const formatPropertyName = (name: string): string => {
    const nameMap: Record<string, string> = {
      label: "Label",
      typeRef: "Type",
      inputValues: "Input Values",
      outputValues: "Output Values",
      defaultOutputEntry: "Default Output",
      name: "Name",
    };
    return nameMap[name] || name;
  };

  return (
    <tr className="dmn-diff-change-list-v2__details-row">
      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
        {formatPropertyName(propertyName)}
      </td>
      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
        <div className="dmn-diff-change-list-v2__value-change">
          {change.previousValue !== undefined && (
            <div className="dmn-diff-change-list-v2__value-change-item">
              <span className="dmn-diff-change-list-v2__value-change-label">Previous:</span>
              <code className="dmn-diff-change-list-v2__value-change-value">
                {JSON.stringify(change.previousValue)}
              </code>
            </div>
          )}
          {change.currentValue !== undefined && (
            <div className="dmn-diff-change-list-v2__value-change-item">
              <span className="dmn-diff-change-list-v2__value-change-label">Current:</span>
              <code className="dmn-diff-change-list-v2__value-change-value">{JSON.stringify(change.currentValue)}</code>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

/** Finds a parameter by ID in BKM encapsulated logic */
const findParameterInModel = (
  model: Normalized<DmnLatestModel> | undefined,
  parameterId: string
): Normalized<DMN_LATEST__tInformationItem> | undefined => {
  if (!model?.definitions?.drgElement) {
    return undefined;
  }

  for (const element of model.definitions.drgElement) {
    if (element.__$$element === "businessKnowledgeModel" && element.encapsulatedLogic) {
      const logic = element.encapsulatedLogic as { formalParameter?: Normalized<DMN_LATEST__tInformationItem>[] };
      const params = logic.formalParameter;
      if (Array.isArray(params)) {
        const param = params.find((p) => p["@_id"] === parameterId);
        if (param) {
          return param;
        }
      }
    }
  }
  return undefined;
};

/**
 * Renders details for a literal expression diff
 */
const LiteralExpressionDetails: React.FC<{ diff: LiteralExpressionDiff }> = ({ diff }) => {
  if (!diff.text) {
    return <div>No changes in literal expression</div>;
  }

  return (
    <table className="dmn-diff-change-list-v2__details-table">
      <tbody>
        <PropertyChangeDisplay change={diff.text} propertyName="Text" />
      </tbody>
    </table>
  );
};

/**
 * Renders details for a decision table diff
 */
const DecisionTableDetails: React.FC<{ diff: DecisionTableDiff }> = ({ diff }) => {
  return (
    <div>
      <table className="dmn-diff-change-list-v2__details-table">
        <tbody>
          {diff.hitPolicy && <PropertyChangeDisplay change={diff.hitPolicy} propertyName="Hit Policy" />}
          {diff.aggregation && <PropertyChangeDisplay change={diff.aggregation} propertyName="Aggregation" />}
        </tbody>
      </table>

      {/* Input Columns */}
      {(diff.input.added.length > 0 ||
        diff.input.removed.length > 0 ||
        Object.keys(diff.input.modified).length > 0) && (
        <div className="dmn-diff-change-list-v2__nested-section">
          <div className="dmn-diff-change-list-v2__nested-title">Input Columns</div>
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {diff.input.added.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Added
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="green">{diff.input.added.length} column(s)</Label>
                  </td>
                </tr>
              )}
              {diff.input.removed.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Removed
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="red">{diff.input.removed.length} column(s)</Label>
                  </td>
                </tr>
              )}
              {Object.entries(diff.input.modified).map(([id, columnDiff]) => (
                <React.Fragment key={id}>
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td
                      colSpan={2}
                      className="dmn-diff-change-list-v2__details-cell"
                      style={{ fontWeight: 600, paddingTop: "12px" }}
                    >
                      <Label color="orange">Modified Column: {id}</Label>
                    </td>
                  </tr>
                  {Object.entries(columnDiff)
                    .filter(([_, value]) => value !== undefined)
                    .map(([prop, change]) => (
                      <PropertyChangeDisplay key={prop} change={change as DiffPropertyChange} propertyName={prop} />
                    ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Output Columns */}
      {(diff.output.added.length > 0 ||
        diff.output.removed.length > 0 ||
        Object.keys(diff.output.modified).length > 0) && (
        <div className="dmn-diff-change-list-v2__nested-section">
          <div className="dmn-diff-change-list-v2__nested-title">Output Columns</div>
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {diff.output.added.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Added
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="green">{diff.output.added.length} column(s)</Label>
                  </td>
                </tr>
              )}
              {diff.output.removed.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Removed
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="red">{diff.output.removed.length} column(s)</Label>
                  </td>
                </tr>
              )}
              {Object.entries(diff.output.modified).map(([id, columnDiff]) => (
                <React.Fragment key={id}>
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td
                      colSpan={2}
                      className="dmn-diff-change-list-v2__details-cell"
                      style={{ fontWeight: 600, paddingTop: "12px" }}
                    >
                      <Label color="orange">Modified Column: {id}</Label>
                    </td>
                  </tr>
                  {Object.entries(columnDiff)
                    .filter(([_, value]) => value !== undefined)
                    .map(([prop, change]) => (
                      <PropertyChangeDisplay key={prop} change={change as DiffPropertyChange} propertyName={prop} />
                    ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rules */}
      {(diff.rules.added.length > 0 ||
        diff.rules.removed.length > 0 ||
        Object.keys(diff.rules.modified).length > 0) && (
        <div className="dmn-diff-change-list-v2__nested-section">
          <div className="dmn-diff-change-list-v2__nested-title">Rules</div>
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {diff.rules.added.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Added
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="green">{diff.rules.added.length} rule(s)</Label>
                  </td>
                </tr>
              )}
              {diff.rules.removed.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Removed
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="red">{diff.rules.removed.length} rule(s)</Label>
                  </td>
                </tr>
              )}
              {Object.entries(diff.rules.modified).map(([id, ruleDiff]) => (
                <React.Fragment key={id}>
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td
                      colSpan={2}
                      className="dmn-diff-change-list-v2__details-cell"
                      style={{ fontWeight: 600, paddingTop: "12px" }}
                    >
                      <Label color="orange">Modified Rule: {id}</Label>
                    </td>
                  </tr>
                  {ruleDiff.index && <PropertyChangeDisplay change={ruleDiff.index} propertyName="Index" />}
                  {Object.keys(ruleDiff.inputEntries).length > 0 && (
                    <tr className="dmn-diff-change-list-v2__details-row">
                      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                        Input Entries
                      </td>
                      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                        {Object.entries(ruleDiff.inputEntries).map(([index, changes]) => (
                          <div key={index} style={{ marginBottom: "8px" }}>
                            <strong>Index {index}:</strong>
                            {changes.map((change, idx) => (
                              <div key={idx} className="dmn-diff-change-list-v2__value-change">
                                {change.previousValue !== undefined && (
                                  <div className="dmn-diff-change-list-v2__value-change-item">
                                    <span className="dmn-diff-change-list-v2__value-change-label">
                                      {change.property} (Prev):
                                    </span>
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {JSON.stringify(change.previousValue)}
                                    </code>
                                  </div>
                                )}
                                {change.currentValue !== undefined && (
                                  <div className="dmn-diff-change-list-v2__value-change-item">
                                    <span className="dmn-diff-change-list-v2__value-change-label">
                                      {change.property} (Curr):
                                    </span>
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {JSON.stringify(change.currentValue)}
                                    </code>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                  {Object.keys(ruleDiff.outputEntries).length > 0 && (
                    <tr className="dmn-diff-change-list-v2__details-row">
                      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                        Output Entries
                      </td>
                      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                        {Object.entries(ruleDiff.outputEntries).map(([index, changes]) => (
                          <div key={index} style={{ marginBottom: "8px" }}>
                            <strong>Index {index}:</strong>
                            {changes.map((change, idx) => (
                              <div key={idx} className="dmn-diff-change-list-v2__value-change">
                                {change.previousValue !== undefined && (
                                  <div className="dmn-diff-change-list-v2__value-change-item">
                                    <span className="dmn-diff-change-list-v2__value-change-label">
                                      {change.property} (Prev):
                                    </span>
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {JSON.stringify(change.previousValue)}
                                    </code>
                                  </div>
                                )}
                                {change.currentValue !== undefined && (
                                  <div className="dmn-diff-change-list-v2__value-change-item">
                                    <span className="dmn-diff-change-list-v2__value-change-label">
                                      {change.property} (Curr):
                                    </span>
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {JSON.stringify(change.currentValue)}
                                    </code>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                  {Object.keys(ruleDiff.annotationEntries).length > 0 && (
                    <tr className="dmn-diff-change-list-v2__details-row">
                      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                        Annotation Entries
                      </td>
                      <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                        {Object.entries(ruleDiff.annotationEntries).map(([index, changes]) => (
                          <div key={index} style={{ marginBottom: "8px" }}>
                            <strong>Index {index}:</strong>
                            {changes.map((change, idx) => (
                              <div key={idx} className="dmn-diff-change-list-v2__value-change">
                                {change.previousValue !== undefined && (
                                  <div className="dmn-diff-change-list-v2__value-change-item">
                                    <span className="dmn-diff-change-list-v2__value-change-label">
                                      {change.property} (Prev):
                                    </span>
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {JSON.stringify(change.previousValue)}
                                    </code>
                                  </div>
                                )}
                                {change.currentValue !== undefined && (
                                  <div className="dmn-diff-change-list-v2__value-change-item">
                                    <span className="dmn-diff-change-list-v2__value-change-label">
                                      {change.property} (Curr):
                                    </span>
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {JSON.stringify(change.currentValue)}
                                    </code>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/**
 * Renders details for a context diff
 */
const ContextDetails: React.FC<{ diff: ContextDiff }> = ({ diff }) => {
  return (
    <div>
      {(diff.entries.added.length > 0 ||
        diff.entries.removed.length > 0 ||
        Object.keys(diff.entries.modified).length > 0) && (
        <div className="dmn-diff-change-list-v2__nested-section">
          <div className="dmn-diff-change-list-v2__nested-title">Context Entries</div>
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {diff.entries.added.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Added
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="green">{diff.entries.added.length} entry(ies)</Label>
                  </td>
                </tr>
              )}
              {diff.entries.removed.length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Removed
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="red">{diff.entries.removed.length} entry(ies)</Label>
                  </td>
                </tr>
              )}
              {Object.keys(diff.entries.modified).length > 0 && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Modified
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="orange">{Object.keys(diff.entries.modified).length} entry(ies)</Label>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {diff.result && (
        <div className="dmn-diff-change-list-v2__nested-section">
          <div className="dmn-diff-change-list-v2__nested-title">Result Expression Changed</div>
        </div>
      )}
    </div>
  );
};

/**
 * Renders details for other expression types
 */
const GenericExpressionDetails: React.FC<{
  diff: BoxedExpressionDiff;
  versionA?: Normalized<DmnLatestModel>;
  versionB?: Normalized<DmnLatestModel>;
}> = ({ diff, versionA, versionB }) => {
  const renderGenericDiff = () => {
    switch (diff.kind) {
      case "functionDefinition": {
        const funcDiff = diff as FunctionDefinitionDiff;
        return (
          <div>
            {(funcDiff.parameters.added.length > 0 ||
              funcDiff.parameters.removed.length > 0 ||
              Object.keys(funcDiff.parameters.modified).length > 0) && (
              <div className="dmn-diff-change-list-v2__nested-section">
                <div className="dmn-diff-change-list-v2__nested-title">Parameters</div>
                <table className="dmn-diff-change-list-v2__details-table">
                  <tbody>
                    {funcDiff.parameters.added.length > 0 && (
                      <tr className="dmn-diff-change-list-v2__details-row">
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                          Added
                        </td>
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                          <Label color="green">{funcDiff.parameters.added.length} parameter(s)</Label>
                          <div style={{ marginTop: "8px" }}>
                            {funcDiff.parameters.added.map((id) => {
                              const param = findParameterInModel(versionB, id);
                              return (
                                <div key={id} style={{ marginBottom: "8px", paddingLeft: "12px" }}>
                                  <div>
                                    <strong>Name:</strong>{" "}
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {param?.["@_name"] || id}
                                    </code>
                                  </div>
                                  {param?.["@_typeRef"] && (
                                    <div>
                                      <strong>Type:</strong>{" "}
                                      <code className="dmn-diff-change-list-v2__value-change-value">
                                        {param["@_typeRef"]}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    {funcDiff.parameters.removed.length > 0 && (
                      <tr className="dmn-diff-change-list-v2__details-row">
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                          Removed
                        </td>
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                          <Label color="red">{funcDiff.parameters.removed.length} parameter(s)</Label>
                          <div style={{ marginTop: "8px" }}>
                            {funcDiff.parameters.removed.map((id) => {
                              const param = findParameterInModel(versionA, id);
                              return (
                                <div key={id} style={{ marginBottom: "8px", paddingLeft: "12px" }}>
                                  <div>
                                    <strong>Name:</strong>{" "}
                                    <code className="dmn-diff-change-list-v2__value-change-value">
                                      {param?.["@_name"] || id}
                                    </code>
                                  </div>
                                  {param?.["@_typeRef"] && (
                                    <div>
                                      <strong>Type:</strong>{" "}
                                      <code className="dmn-diff-change-list-v2__value-change-value">
                                        {param["@_typeRef"]}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    {Object.entries(funcDiff.parameters.modified).map(([id, paramDiff]) => (
                      <React.Fragment key={id}>
                        <tr className="dmn-diff-change-list-v2__details-row">
                          <td
                            colSpan={2}
                            className="dmn-diff-change-list-v2__details-cell"
                            style={{ fontWeight: 600, paddingTop: "12px" }}
                          >
                            <Label color="orange">Modified Parameter: {id}</Label>
                          </td>
                        </tr>
                        {paramDiff.index && <PropertyChangeDisplay change={paramDiff.index} propertyName="Index" />}
                        {paramDiff.diffs.map((diff, idx) => (
                          <PropertyChangeDisplay key={idx} change={diff} propertyName={diff.property} />
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {funcDiff.expression && (
              <div className="dmn-diff-change-list-v2__nested-section">
                <div className="dmn-diff-change-list-v2__nested-title">Body Expression: {funcDiff.expression.kind}</div>
                <div style={{ paddingLeft: "12px", marginTop: "8px" }}>
                  <BoxedExpressionDiffDetails diff={funcDiff.expression} versionA={versionA} versionB={versionB} />
                </div>
              </div>
            )}
          </div>
        );
      }
      case "list": {
        const listDiff = diff as ListDiff;
        return (
          <div className="dmn-diff-change-list-v2__nested-section">
            <div className="dmn-diff-change-list-v2__nested-title">List Items</div>
            <table className="dmn-diff-change-list-v2__details-table">
              <tbody>
                {listDiff.items.added.length > 0 && (
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                      Added
                    </td>
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                      <Label color="green">{listDiff.items.added.length} item(s)</Label>
                    </td>
                  </tr>
                )}
                {listDiff.items.removed.length > 0 && (
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                      Removed
                    </td>
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                      <Label color="red">{listDiff.items.removed.length} item(s)</Label>
                    </td>
                  </tr>
                )}
                {Object.keys(listDiff.items.modified).length > 0 && (
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                      Modified
                    </td>
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                      <Label color="orange">{Object.keys(listDiff.items.modified).length} item(s)</Label>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }
      case "invocation": {
        const invDiff = diff as InvocationDiff;
        return (
          <div className="dmn-diff-change-list-v2__nested-section">
            <div className="dmn-diff-change-list-v2__nested-title">Bindings</div>
            <table className="dmn-diff-change-list-v2__details-table">
              <tbody>
                {invDiff.bindings.added.length > 0 && (
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                      Added
                    </td>
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                      <Label color="green">{invDiff.bindings.added.length} binding(s)</Label>
                    </td>
                  </tr>
                )}
                {invDiff.bindings.removed.length > 0 && (
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                      Removed
                    </td>
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                      <Label color="red">{invDiff.bindings.removed.length} binding(s)</Label>
                    </td>
                  </tr>
                )}
                {Object.keys(invDiff.bindings.modified).length > 0 && (
                  <tr className="dmn-diff-change-list-v2__details-row">
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                      Modified
                    </td>
                    <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                      <Label color="orange">{Object.keys(invDiff.bindings.modified).length} binding(s)</Label>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }
      case "relation": {
        const relDiff = diff as RelationDiff;
        return (
          <div>
            {(relDiff.columns.added.length > 0 ||
              relDiff.columns.removed.length > 0 ||
              Object.keys(relDiff.columns.modified).length > 0) && (
              <div className="dmn-diff-change-list-v2__nested-section">
                <div className="dmn-diff-change-list-v2__nested-title">Columns</div>
                <table className="dmn-diff-change-list-v2__details-table">
                  <tbody>
                    {relDiff.columns.added.length > 0 && (
                      <tr className="dmn-diff-change-list-v2__details-row">
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                          Added
                        </td>
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                          <Label color="green">{relDiff.columns.added.length} column(s)</Label>
                        </td>
                      </tr>
                    )}
                    {relDiff.columns.removed.length > 0 && (
                      <tr className="dmn-diff-change-list-v2__details-row">
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                          Removed
                        </td>
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                          <Label color="red">{relDiff.columns.removed.length} column(s)</Label>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {(relDiff.rows.added.length > 0 ||
              relDiff.rows.removed.length > 0 ||
              Object.keys(relDiff.rows.modified).length > 0) && (
              <div className="dmn-diff-change-list-v2__nested-section">
                <div className="dmn-diff-change-list-v2__nested-title">Rows</div>
                <table className="dmn-diff-change-list-v2__details-table">
                  <tbody>
                    {relDiff.rows.added.length > 0 && (
                      <tr className="dmn-diff-change-list-v2__details-row">
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                          Added
                        </td>
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                          <Label color="green">{relDiff.rows.added.length} row(s)</Label>
                        </td>
                      </tr>
                    )}
                    {relDiff.rows.removed.length > 0 && (
                      <tr className="dmn-diff-change-list-v2__details-row">
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                          Removed
                        </td>
                        <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                          <Label color="red">{relDiff.rows.removed.length} row(s)</Label>
                        </td>
                      </tr>
                    )}
                    {Object.keys(relDiff.rows.modified).length > 0 && (
                      <React.Fragment>
                        {Object.entries(relDiff.rows.modified).map(([id, rowDiff]) => (
                          <React.Fragment key={id}>
                            <tr className="dmn-diff-change-list-v2__details-row">
                              <td
                                colSpan={2}
                                className="dmn-diff-change-list-v2__details-cell"
                                style={{ fontWeight: 600, paddingTop: "12px" }}
                              >
                                <Label color="orange">Modified Row: {id}</Label>
                              </td>
                            </tr>
                            {rowDiff.index && <PropertyChangeDisplay change={rowDiff.index} propertyName="Index" />}
                            {Object.entries(rowDiff.cells).map(([index, cellDiff]) => (
                              <tr key={index} className="dmn-diff-change-list-v2__details-row">
                                <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                                  Column {parseInt(index) + 1}
                                </td>
                                <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                                  <BoxedExpressionDiffDetails diff={cellDiff} versionA={versionA} versionB={versionB} />
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      }
      case "conditional": {
        const condDiff = diff as ConditionalDiff;
        return (
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {condDiff.if && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    If Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
              {condDiff.then && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Then Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
              {condDiff.else && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Else Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );
      }
      case "filter": {
        const filterDiff = diff as FilterDiff;
        return (
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {filterDiff.in && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    In Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
              {filterDiff.match && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Match Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );
      }
      case "every": {
        const everyDiff = diff as EveryDiff;
        return (
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {everyDiff.in && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    In Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
              {everyDiff.satisfies && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Satisfies Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );
      }
      case "some": {
        const someDiff = diff as SomeDiff;
        return (
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {someDiff.in && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    In Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
              {someDiff.satisfies && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Satisfies Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );
      }
      case "for": {
        const forDiff = diff as ForDiff;
        return (
          <table className="dmn-diff-change-list-v2__details-table">
            <tbody>
              {forDiff.in && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    In Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
              {forDiff.return && (
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Return Expression
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    Changed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );
      }
      case "expressionReplacement": {
        const replacementDiff = diff as ExpressionReplacementDiff;
        return (
          <div>
            <table className="dmn-diff-change-list-v2__details-table">
              <tbody>
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Previous Type
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="red">{replacementDiff.previousType}</Label>
                  </td>
                </tr>
                <tr className="dmn-diff-change-list-v2__details-row">
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--label">
                    Current Type
                  </td>
                  <td className="dmn-diff-change-list-v2__details-cell dmn-diff-change-list-v2__details-cell--value">
                    <Label color="green">{replacementDiff.currentType}</Label>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Show previous expression details */}
            {replacementDiff.previousExpression && (
              <div className="dmn-diff-change-list-v2__nested-section">
                <div className="dmn-diff-change-list-v2__nested-title">
                  Previous Expression Details ({replacementDiff.previousType})
                </div>
                <pre style={{ fontSize: "12px", overflow: "auto", maxHeight: "300px" }}>
                  {JSON.stringify(replacementDiff.previousExpression, null, 2)}
                </pre>
              </div>
            )}

            {/* Show current expression details */}
            {replacementDiff.currentExpression && (
              <div className="dmn-diff-change-list-v2__nested-section">
                <div className="dmn-diff-change-list-v2__nested-title">
                  Current Expression Details ({replacementDiff.currentType})
                </div>
                <pre style={{ fontSize: "12px", overflow: "auto", maxHeight: "300px" }}>
                  {JSON.stringify(replacementDiff.currentExpression, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      }
      default:
        return <div>Unknown expression type</div>;
    }
  };

  return <div>{renderGenericDiff()}</div>;
};

/**
 * Renders boxed expression diff details based on the expression type
 */
const BoxedExpressionDiffDetails: React.FC<{
  diff: BoxedExpressionDiff;
  versionA?: Normalized<DmnLatestModel>;
  versionB?: Normalized<DmnLatestModel>;
}> = ({ diff, versionA, versionB }) => {
  switch (diff.kind) {
    case "literalExpression":
      return <LiteralExpressionDetails diff={diff} />;
    case "decisionTable":
      return <DecisionTableDetails diff={diff} />;
    case "context":
      return <ContextDetails diff={diff} />;
    default:
      return <GenericExpressionDetails diff={diff} versionA={versionA} versionB={versionB} />;
  }
};

/**
 * Individual row component for a node with boxed expression diff
 */
const NodeDiffRow: React.FC<{
  node: NodeDiff;
  index: number;
  versionA?: Normalized<DmnLatestModel>;
  versionB?: Normalized<DmnLatestModel>;
}> = ({ node, index, versionA, versionB }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasBoxedExpressionDiff = node.boxedExpressionDiff !== undefined;

  const handleToggle = useCallback(() => {
    if (hasBoxedExpressionDiff) {
      setIsExpanded((prev) => !prev);
    }
  }, [hasBoxedExpressionDiff]);

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

  return (
    <>
      <tr
        className={`dmn-diff-change-list-v2__table-row ${
          hasBoxedExpressionDiff ? "dmn-diff-change-list-v2__table-row--expandable" : ""
        } ${isExpanded ? "dmn-diff-change-list-v2__table-row--expanded" : ""}`}
        onClick={handleToggle}
      >
        <td className="dmn-diff-change-list-v2__table-cell dmn-diff-change-list-v2__table-cell--element">
          {hasBoxedExpressionDiff && (
            <span
              className={`dmn-diff-change-list-v2__expand-icon ${
                isExpanded ? "dmn-diff-change-list-v2__expand-icon--expanded" : ""
              }`}
            >
              <AngleRightIcon />
            </span>
          )}
          {node.elementName || node.id}
        </td>
        <td className="dmn-diff-change-list-v2__table-cell dmn-diff-change-list-v2__table-cell--type">
          {node.elementType}
        </td>
        <td className="dmn-diff-change-list-v2__table-cell dmn-diff-change-list-v2__table-cell--change">
          <Label color={getChangeTypeColor(node.changeType)}>{getChangeTypeLabel(node.changeType)}</Label>
        </td>
        <td className="dmn-diff-change-list-v2__table-cell">
          {hasBoxedExpressionDiff ? `Expression: ${node.boxedExpressionDiff!.kind}` : "No expression changes"}
        </td>
      </tr>
      {isExpanded && hasBoxedExpressionDiff && (
        <tr>
          <td colSpan={4} className="dmn-diff-change-list-v2__details">
            <BoxedExpressionDiffDetails diff={node.boxedExpressionDiff!} versionA={versionA} versionB={versionB} />
          </td>
        </tr>
      )}
    </>
  );
};

/**
 * Main component for displaying diff changes in a list format
 */
export const DmnDiffChangeList_v2: React.FC<DmnDiffChangeList_v2Props> = ({
  diffResult,
  isOpen,
  onToggle,
  versionA,
  versionB,
}) => {
  const nodesWithExpressionDiffs = useMemo(() => {
    if (!diffResult?.hasChanges) {
      return [];
    }
    return diffResult.nodes.filter((node) => node.boxedExpressionDiff !== undefined);
  }, [diffResult]);

  const totalChanges = useMemo(() => {
    if (!diffResult?.hasChanges) {
      return 0;
    }
    return nodesWithExpressionDiffs.length;
  }, [diffResult, nodesWithExpressionDiffs]);

  if (!isOpen) {
    return (
      <Button
        variant="primary"
        onClick={onToggle}
        className="dmn-diff-change-list-v2__toggle-button"
        aria-label="Open expression diff list"
        icon={<ListIcon />}
      >
        Expression Diffs
        {totalChanges > 0 && ` (${totalChanges})`}
      </Button>
    );
  }

  return (
    <div className="dmn-diff-change-list-v2">
      <div className="dmn-diff-change-list-v2__header">
        <Title headingLevel="h3" size="md">
          Boxed Expression Diffs
        </Title>
        <Button variant="plain" onClick={onToggle} aria-label="Close expression diff list" icon={<TimesIcon />} />
      </div>
      <div className="dmn-diff-change-list-v2__content">
        {totalChanges === 0 ? (
          <div className="dmn-diff-change-list-v2__empty">No expression changes detected</div>
        ) : (
          <div className="dmn-diff-change-list-v2__section">
            <table className="dmn-diff-change-list-v2__table">
              <thead>
                <tr>
                  <th className="dmn-diff-change-list-v2__table-header">Element</th>
                  <th className="dmn-diff-change-list-v2__table-header">Type</th>
                  <th className="dmn-diff-change-list-v2__table-header">Change</th>
                  <th className="dmn-diff-change-list-v2__table-header">Details</th>
                </tr>
              </thead>
              <tbody>
                {nodesWithExpressionDiffs.map((node, index) => (
                  <NodeDiffRow key={node.id} node={node} index={index} versionA={versionA} versionB={versionB} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {totalChanges > 0 && (
        <div className="dmn-diff-change-list-v2__footer">
          {totalChanges} element{totalChanges === 1 ? "" : "s"} with expression changes
        </div>
      )}
    </div>
  );
};
