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

import { createEmptyModel, addInputData, addDecision, TEST_NAMESPACE } from "./utils";
import { computeDmnDiff } from "../../src/diff/algorithms/dmnDiffAlgorithm";
import { DiffChangeType } from "../../src/diff/types";

describe("DMN diff algorithm", () => {
  it("returns no diffs for empty diagrams", () => {
    const diff = computeDmnDiff(createEmptyModel(), createEmptyModel());
    expect(diff.hasChanges).toBe(false);
    expect(diff.nodes).toHaveLength(0);
    expect(diff.edges).toHaveLength(0);
  });

  it("detects added nodes", () => {
    const source = createEmptyModel();
    const target = createEmptyModel();

    addInputData(target, { id: "Input_1", name: "Income", x: 10, y: 20 });

    const diff = computeDmnDiff(source, target);
    expect(diff.nodes).toHaveLength(1);
    expect(diff.nodes[0]).toEqual(
      expect.objectContaining({
        id: `${TEST_NAMESPACE}#Input_1`,
        changeType: DiffChangeType.ADDED,
      })
    );
  });

  it("detects removed nodes", () => {
    const source = createEmptyModel();
    addInputData(source, { id: "Input_1", name: "Income", x: 10, y: 20 });

    const diff = computeDmnDiff(source, createEmptyModel());
    expect(diff.nodes).toHaveLength(1);
    expect(diff.nodes[0].changeType).toBe(DiffChangeType.REMOVED);
  });

  it("detects modified node names and layout changes", () => {
    const source = createEmptyModel();
    const target = createEmptyModel();

    addInputData(source, { id: "Input_1", name: "Income", x: 10, y: 20 });
    addInputData(target, { id: "Input_1", name: "Salary", x: 25, y: 50, width: 120, height: 60 });

    const diff = computeDmnDiff(source, target);
    expect(diff.nodes).toHaveLength(1);
    expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
    expect(diff.nodes[0].changedProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "name", previousValue: "Income", currentValue: "Salary" }),
        expect.objectContaining({ property: "position.x", previousValue: 10, currentValue: 25 }),
        expect.objectContaining({ property: "position.y", previousValue: 20, currentValue: 50 }),
        expect.objectContaining({ property: "size.width", previousValue: 160, currentValue: 120 }),
        expect.objectContaining({ property: "size.height", previousValue: 80, currentValue: 60 }),
      ])
    );
  });

  it("ignores minor position drift within tolerance", () => {
    const source = createEmptyModel();
    const target = createEmptyModel();

    addInputData(source, { id: "Input_1", name: "Income", x: 10, y: 20 });
    addInputData(target, { id: "Input_1", name: "Income", x: 10.5, y: 20.5 });

    const diff = computeDmnDiff(source, target);
    expect(diff.nodes).toHaveLength(0);
  });

  it("detects added edges", () => {
    const source = createEmptyModel();
    const target = createEmptyModel();

    addInputData(source, { id: "Input_1", name: "Income", x: 10, y: 20 });
    addInputData(target, { id: "Input_1", name: "Income", x: 10, y: 20 });

    addDecision(target, {
      id: "Decision_1",
      name: "Risk",
      informationRequirements: [{ id: "InfoReq_1", requiredInputId: "Input_1" }],
    });

    const diff = computeDmnDiff(source, target);
    expect(diff.edges).toHaveLength(1);
    expect(diff.edges[0]).toEqual(
      expect.objectContaining({
        id: `${TEST_NAMESPACE}#InfoReq_1`,
        source: `${TEST_NAMESPACE}#Input_1`,
        target: `${TEST_NAMESPACE}#Decision_1`,
        changeType: DiffChangeType.ADDED,
      })
    );
  });

  it("detects removed edges", () => {
    const source = createEmptyModel();
    addInputData(source, { id: "Input_1", name: "Income", x: 10, y: 20 });
    addDecision(source, {
      id: "Decision_1",
      name: "Risk",
      informationRequirements: [{ id: "InfoReq_1", requiredInputId: "Input_1" }],
    });

    const target = createEmptyModel();
    addInputData(target, { id: "Input_1", name: "Income", x: 10, y: 20 });
    addDecision(target, { id: "Decision_1", name: "Risk" });

    const diff = computeDmnDiff(source, target);
    expect(diff.edges).toHaveLength(1);
    expect(diff.edges[0].changeType).toBe(DiffChangeType.REMOVED);
  });

  it("detects modified edges when source changes", () => {
    const source = createEmptyModel();
    const target = createEmptyModel();

    addInputData(source, { id: "Input_1", name: "Income", x: 10, y: 20 });
    addInputData(target, { id: "Input_1", name: "Income", x: 10, y: 20 });
    addInputData(target, { id: "Input_2", name: "Age", x: 40, y: 20 });

    addDecision(source, {
      id: "Decision_1",
      name: "Risk",
      informationRequirements: [{ id: "InfoReq_1", requiredInputId: "Input_1" }],
    });

    addDecision(target, {
      id: "Decision_1",
      name: "Risk",
      informationRequirements: [{ id: "InfoReq_1", requiredInputId: "Input_2" }],
    });

    const diff = computeDmnDiff(source, target);
    expect(diff.edges).toHaveLength(1);
    expect(diff.edges[0].changeType).toBe(DiffChangeType.MODIFIED);
    expect(diff.edges[0].changedProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "source",
          previousValue: `${TEST_NAMESPACE}#Input_1`,
          currentValue: `${TEST_NAMESPACE}#Input_2`,
        }),
      ])
    );
  });

  it("detects modified properties (description, typeRef, question, allowedAnswers)", () => {
    const source = createEmptyModel();
    const target = createEmptyModel();

    addDecision(source, {
      id: "Decision_1",
      name: "Risk",
    });

    (source.definitions.drgElement![0] as any).description = { __$$text: "Initial Description" };
    (source.definitions.drgElement![0] as any).variable = { "@_typeRef": "string" };
    (source.definitions.drgElement![0] as any).question = { __$$text: "Initial Question" };
    (source.definitions.drgElement![0] as any).allowedAnswers = { __$$text: "Initial Answers" };

    addDecision(target, {
      id: "Decision_1",
      name: "Risk",
    });

    (target.definitions.drgElement![0] as any).description = { __$$text: "Changed Description" };
    (target.definitions.drgElement![0] as any).variable = { "@_typeRef": "number" };
    (target.definitions.drgElement![0] as any).question = { __$$text: "Changed Question" };
    (target.definitions.drgElement![0] as any).allowedAnswers = { __$$text: "Changed Answers" };

    const diff = computeDmnDiff(source, target);
    expect(diff.nodes).toHaveLength(1);
    expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
    expect(diff.nodes[0].changedProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "description",
          previousValue: "Initial Description",
          currentValue: "Changed Description",
        }),
        expect.objectContaining({ property: "typeRef", previousValue: "string", currentValue: "number" }),
        expect.objectContaining({
          property: "question",
          previousValue: "Initial Question",
          currentValue: "Changed Question",
        }),
        expect.objectContaining({
          property: "allowedAnswers",
          previousValue: "Initial Answers",
          currentValue: "Changed Answers",
        }),
      ])
    );
  });
});
