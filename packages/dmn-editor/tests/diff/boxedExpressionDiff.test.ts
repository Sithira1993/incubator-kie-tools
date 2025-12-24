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

import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { BoxedLiteral, BoxedExpression, BoxedContext, BoxedList } from "@kie-tools/boxed-expression-component/dist/api";
import { diffBoxedExpression, computeDmnDiff } from "../../src/diff/algorithms/dmnDiffAlgorithm";
import {
  DiffChangeType,
  ListDiff,
  ContextDiff,
  LiteralExpressionDiff,
  DecisionTableDiff,
  FunctionDefinitionDiff,
  InvocationDiff,
  RelationDiff,
  ConditionalDiff,
  FilterDiff,
  EveryDiff,
  SomeDiff,
  ForDiff,
} from "../../src/diff/types";
import {
  createModelWithExpression,
  BoxedExpressionBuilders as DMN,
  createEmptyModel,
  addBusinessKnowledgeModel,
  diagramElements,
  createShape,
  addDecision,
} from "./utils";

describe("DMN Diff Algorithm - Boxed Expressions", () => {
  describe("Core Expression Types", () => {
    describe("Literal Expression", () => {
      it("detects expression text change when node properties are unchanged", () => {
        const nodeA = {
          "@_id": "n1",
          "@_name": "Dec1",
          __$$element: "decision",
          literalExpression: DMN.literal("foo"),
        };
        const nodeB = { ...nodeA, literalExpression: DMN.literal("bar") }; // Only text changed

        const result = computeDmnDiff(createModelWithExpression(nodeA), createModelWithExpression(nodeB));

        expect(result.hasChanges).toBe(true);
        expect(result.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
        expect(result.nodes[0].boxedExpressionDiff?.kind).toBe("literalExpression");
      });

      it("detects expression type replacement", () => {
        const nodeA = { "@_id": "n1", __$$element: "decision", literalExpression: DMN.literal("foo") };
        const nodeB = { "@_id": "n1", __$$element: "decision", list: DMN.list([]) };

        const result = computeDmnDiff(createModelWithExpression(nodeA), createModelWithExpression(nodeB));

        expect(result.nodes[0].boxedExpressionDiff).toEqual({
          kind: "expressionReplacement",
          previousType: "literalExpression",
          currentType: "list",
          previousExpression: nodeA.literalExpression,
          currentExpression: nodeB.list,
        });
      });

      it("preserves deeply nested details in expression replacement", () => {
        // Verify that expression replacement preserves full nested structure details

        const contextExpr = DMN.context(
          [
            DMN.contextEntry("Entry1", DMN.literal("Value1"), "entry1_id"),
            DMN.contextEntry("Entry2", DMN.list([DMN.literal("NestedItem")], "nested_list"), "entry2_id"),
          ],
          "context_id"
        );

        const listExpr = DMN.list([DMN.literal("NewList")], "list_id");

        const diff = diffBoxedExpression(contextExpr, listExpr);

        expect(diff?.kind).toBe("expressionReplacement");
        const replaceDiff = diff as any; // Cast to access specific fields if needed

        // Assert preservation of original deeply nested structure
        const prev = replaceDiff.previousExpression as Normalized<BoxedContext>;
        expect(prev).toBeDefined();
        expect(prev.__$$element).toBe("context");
        expect(prev.contextEntry).toHaveLength(2);

        // Check first entry
        expect(prev.contextEntry![0].variable!["@_name"]).toBe("Entry1");
        expect((prev.contextEntry![0].expression as Normalized<BoxedLiteral>)?.text?.__$$text).toBe("Value1");

        // Check second entry (nested list)
        expect(prev.contextEntry![1].variable!["@_name"]).toBe("Entry2");
        const nestedList = prev.contextEntry![1].expression as Normalized<BoxedList>;
        expect(nestedList.__$$element).toBe("list");
        expect((nestedList.expression?.[0] as Normalized<BoxedLiteral>)?.text?.__$$text).toBe("NestedItem");
      });
    });

    describe("List Expression", () => {
      it("detects insertion in list without flagging all subsequent items as modified", () => {
        // List A: [A, B]
        const itemsA = [DMN.literal("A", "id_a"), DMN.literal("B", "id_b")];
        // List B: [C, A, B] (Inserted C at start)
        const itemsB = [
          DMN.literal("C", "id_c"), // New item
          DMN.literal("A", "id_a"), // Moved index 0 -> 1
          DMN.literal("B", "id_b"), // Moved index 1 -> 2
        ];

        const exprA = DMN.list(itemsA);
        const exprB = DMN.list(itemsB);

        const diff = diffBoxedExpression(exprA, exprB);
        expect(diff?.kind).toBe("list");

        const listDiff = diff as ListDiff;

        expect(listDiff.items.added).toContain(0); // Index 0 is the new item C
        expect(listDiff.items.modified[1].index).toEqual({
          property: "index",
          previousValue: 0,
          currentValue: 1,
        }); // A was moved
        expect(listDiff.items.modified[2].index).toEqual({
          property: "index",
          previousValue: 1,
          currentValue: 2,
        }); // B was moved

        // Ensure we don't have false positives
        expect(Object.keys(listDiff.items.modified)).toHaveLength(2);
      });

      it("falls back to index-based diff if IDs are missing", () => {
        const itemsA = [{ __$$element: "literalExpression", text: { __$$text: "A" } }] as Normalized<BoxedLiteral>[];
        const itemsB = [{ __$$element: "literalExpression", text: { __$$text: "B" } }] as Normalized<BoxedLiteral>[]; // Modified at index 0

        const diff = diffBoxedExpression(DMN.list(itemsA), DMN.list(itemsB));
        const listDiff = diff as ListDiff;
        expect(listDiff.items.modified[0].diff).toBeDefined();
      });

      it("detects item reordering (swap)", () => {
        const itemsA = [DMN.literal("A", "id_a"), DMN.literal("B", "id_b")];
        const itemsB = [DMN.literal("B", "id_b"), DMN.literal("A", "id_a")];

        const diff = diffBoxedExpression(DMN.list(itemsA), DMN.list(itemsB)) as ListDiff;
        expect(diff.items.modified[0].index).toEqual({
          property: "index",
          previousValue: 1,
          currentValue: 0,
        });
        expect(diff.items.modified[1].index).toEqual({
          property: "index",
          previousValue: 0,
          currentValue: 1,
        });
      });
    });

    describe("Context Expression", () => {
      it("detects reordering of context entries", () => {
        const entry1 = DMN.contextEntry("var1", DMN.literal("1"), "id_1");
        const entry2 = DMN.contextEntry("var2", DMN.literal("2"), "id_2");

        const ctxA = DMN.context([entry1, entry2]);
        const ctxB = DMN.context([entry2, entry1]);

        const diff = diffBoxedExpression(ctxA, ctxB);
        expect(diff?.kind).toBe("context");

        const ctxDiff = diff as ContextDiff;

        expect(ctxDiff.entries.modified["id_1"].index).toEqual({
          property: "index",
          previousValue: 0,
          currentValue: 1,
        });

        expect(ctxDiff.entries.modified["id_2"].index).toEqual({
          property: "index",
          previousValue: 1,
          currentValue: 0,
        });
      });

      it("fallback: matches entries by index when IDs are missing", () => {
        const entryA = DMN.contextEntry("var1", DMN.literal("A"), ""); // Missing ID
        const entryB = DMN.contextEntry("var1", DMN.literal("B"), ""); // Missing ID, modified expression

        const ctxA = DMN.context([entryA]);
        const ctxB = DMN.context([entryB]);

        const diff = diffBoxedExpression(ctxA, ctxB) as ContextDiff;
        expect(diff).toBeDefined();
        // Should treat index 0 as modified, using "0" as key
        expect(diff.entries.modified["0"].expression).toBeDefined();
        expect(diff.entries.added).toHaveLength(0);
        expect(diff.entries.removed).toHaveLength(0);
      });
    });

    describe("Decision Table", () => {
      it("detects modified input entry in rule", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("Input", "in1")], [DMN.rule(["val1"], "rule1")]);
        const dtB = DMN.decisionTable([DMN.inputClause("Input", "in1")], [DMN.rule(["val2"], "rule1")]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.kind).toBe("decisionTable");
        expect(diff.rules.modified["rule1"].inputEntries[0].currentValue).toBe("val2");
      });

      it("detects annotation property change (name)", () => {
        const dtA = DMN.decisionTable([], []);
        dtA.annotation = [{ "@_name": "My Annotation" }];

        const dtB = DMN.decisionTable([], []);
        dtB.annotation = [{ "@_name": "Updated Annotation" }];

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.annotation?.modified).toBeDefined();
        // Annotation columns fall back to index if no ID.
        const changes = diff.annotation?.modified["0"];
        expect(changes).toBeDefined();
        expect(changes?.name).toBeDefined();
        expect(changes?.name?.previousValue).toBe("My Annotation");
        expect(changes?.name?.currentValue).toBe("Updated Annotation");
      });

      it("detects added rule", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], "r1")]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], "r1"), DMN.rule(["B"], "r2")]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.rules.added).toContain("r2");
      });

      it("fallback: matches rules by index when IDs are missing", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], "")]); // No ID (empty string)
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["B"], "")]); // No ID, modified value

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        // Should treat index 0 as modified, using "0" as key
        expect(diff.rules.modified["0"].inputEntries[0].currentValue).toBe("B");
      });

      it("detects rule reordering", () => {
        const rule1 = DMN.rule(["1"], "r1");
        const rule2 = DMN.rule(["2"], "r2");

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i")], [rule1, rule2]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i")], [rule2, rule1]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.rules.modified["r1"].index).toEqual({
          property: "index",
          previousValue: 0,
          currentValue: 1,
        });
        expect(diff.rules.modified["r2"].index).toEqual({
          property: "index",
          previousValue: 1,
          currentValue: 0,
        });
      });
    });

    describe("Decision Table - Property Checks", () => {
      it("detects changes in Input Constraints (inputValues)", () => {
        const inputA = DMN.inputClause("Input 1", "in1");
        // TypeScript types don't include inputValues property
        (inputA as any).inputValues = { text: { __$$text: "foo, bar" } };

        const inputB = DMN.inputClause("Input 1", "in1");
        (inputB as any).inputValues = { text: { __$$text: "foo, baz" } };

        const dtA = DMN.decisionTable([inputA], []);
        const dtB = DMN.decisionTable([inputB], []);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.kind).toBe("decisionTable");
        expect(diff.input.modified["in1"]).toBeDefined();

        const changes = diff.input.modified["in1"];
        expect(changes.inputValues).toBeDefined();
        expect(changes.inputValues?.currentValue).toBe("foo, baz");
      });

      it("detects changes in Output Constraints (outputValues)", () => {
        const dtA = DMN.decisionTable([], []);
        // TypeScript types don't include outputValues property
        const outA = dtA.output?.[0] as any;
        outA.outputValues = { text: { __$$text: "1..10" } };

        const dtB = DMN.decisionTable([], []);
        const outB = dtB.output?.[0] as any;
        outB.outputValues = { text: { __$$text: "1..20" } };

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.kind).toBe("decisionTable");
        expect(diff.output.modified["dt_out"]).toBeDefined();

        const changes = diff.output.modified["dt_out"];
        expect(changes.outputValues).toBeDefined();
        expect(changes.outputValues?.currentValue).toBe("1..20");
      });

      it("detects changes in Default Output Value (defaultOutputEntry)", () => {
        const dtA = DMN.decisionTable([], []);
        // TypeScript types don't include defaultOutputEntry property
        const outA = dtA.output?.[0] as any;
        outA.defaultOutputEntry = { text: { __$$text: "5" } };

        const dtB = DMN.decisionTable([], []);
        const outB = dtB.output?.[0] as any;
        outB.defaultOutputEntry = { text: { __$$text: "10" } };

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.kind).toBe("decisionTable");
        expect(diff.output.modified["dt_out"]).toBeDefined();

        const changes = diff.output.modified["dt_out"];
        expect(changes.defaultOutputEntry).toBeDefined();
        expect(changes.defaultOutputEntry?.currentValue).toBe("10");
      });
    });

    describe("Decision Table - Annotation Entries", () => {
      it("detects modified annotation entry in rule", () => {
        const ruleA = DMN.rule(["input1"], "r1");
        ruleA.annotationEntry = [{ text: { __$$text: "Original annotation" } }];

        const ruleB = DMN.rule(["input1"], "r1");
        ruleB.annotationEntry = [{ text: { __$$text: "Modified annotation" } }];

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleA]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleB]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.kind).toBe("decisionTable");
        expect(diff.rules.modified["r1"].annotationEntries[0]).toBeDefined();
        expect(diff.rules.modified["r1"].annotationEntries[0].property).toBe("text");
        expect(diff.rules.modified["r1"].annotationEntries[0].previousValue).toBe("Original annotation");
        expect(diff.rules.modified["r1"].annotationEntries[0].currentValue).toBe("Modified annotation");
      });

      it("detects multiple annotation entries changes in same rule", () => {
        const ruleA = DMN.rule(["input1"], "r1");
        ruleA.annotationEntry = [
          { text: { __$$text: "Annotation 1" } },
          { text: { __$$text: "Annotation 2" } },
          { text: { __$$text: "Annotation 3" } },
        ];

        const ruleB = DMN.rule(["input1"], "r1");
        ruleB.annotationEntry = [
          { text: { __$$text: "Annotation 1" } }, // Unchanged
          { text: { __$$text: "Modified Annotation 2" } }, // Changed
          { text: { __$$text: "Annotation 3" } }, // Unchanged
        ];

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleA]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleB]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.rules.modified["r1"].annotationEntries[0]).toBeUndefined(); // Index 0 unchanged
        expect(diff.rules.modified["r1"].annotationEntries[1]).toBeDefined(); // Index 1 changed
        expect(diff.rules.modified["r1"].annotationEntries[1].currentValue).toBe("Modified Annotation 2");
        expect(diff.rules.modified["r1"].annotationEntries[2]).toBeUndefined(); // Index 2 unchanged
      });

      it("handles empty annotation entries", () => {
        const ruleA = DMN.rule(["input1"], "r1");
        ruleA.annotationEntry = [];

        const ruleB = DMN.rule(["input1"], "r1");
        ruleB.annotationEntry = [];

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleA]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleB]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        // Should not detect any changes since both are empty
        expect(diff).toBeUndefined();
      });

      it("detects annotation entry addition (empty to non-empty)", () => {
        const ruleA = DMN.rule(["input1"], "r1");
        ruleA.annotationEntry = [];

        const ruleB = DMN.rule(["input1"], "r1");
        ruleB.annotationEntry = [{ text: { __$$text: "New annotation" } }];

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleA]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleB]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.rules.modified["r1"].annotationEntries[0]).toBeDefined();
        expect(diff.rules.modified["r1"].annotationEntries[0].previousValue).toBe("");
        expect(diff.rules.modified["r1"].annotationEntries[0].currentValue).toBe("New annotation");
      });

      it("detects annotation entry removal (non-empty to empty)", () => {
        const ruleA = DMN.rule(["input1"], "r1");
        ruleA.annotationEntry = [{ text: { __$$text: "Removed annotation" } }];

        const ruleB = DMN.rule(["input1"], "r1");
        ruleB.annotationEntry = [];

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleA]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleB]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.rules.modified["r1"].annotationEntries[0]).toBeDefined();
        expect(diff.rules.modified["r1"].annotationEntries[0].previousValue).toBe("Removed annotation");
        expect(diff.rules.modified["r1"].annotationEntries[0].currentValue).toBe("");
      });

      it("handles undefined annotation entries", () => {
        const ruleA = DMN.rule(["input1"], "r1");
        delete ruleA.annotationEntry;

        const ruleB = DMN.rule(["input1"], "r1");
        delete ruleB.annotationEntry;

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleA]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleB]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        // Should not detect any changes since both are undefined
        expect(diff).toBeUndefined();
      });

      it("detects changes when annotation text is empty string vs undefined", () => {
        const ruleA = DMN.rule(["input1"], "r1");
        ruleA.annotationEntry = [{ text: { __$$text: "" } }];

        const ruleB = DMN.rule(["input1"], "r1");
        ruleB.annotationEntry = [{}]; // No text property

        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleA]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [ruleB]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        // Both should be treated as empty strings, so no change
        expect(diff).toBeUndefined();
      });
    });

    describe("Function Definition", () => {
      it("detects parameter type change", () => {
        const fnA = DMN.functionDef([DMN.param("p1", "string", "pid1")], DMN.literal("body"));
        const fnB = DMN.functionDef([DMN.param("p1", "number", "pid1")], DMN.literal("body"));

        const diff = diffBoxedExpression(fnA, fnB) as FunctionDefinitionDiff;
        expect(diff.parameters.modified["pid1"].diffs[0].property).toBe("typeRef");
        expect(diff.parameters.modified["pid1"].diffs[0].currentValue).toBe("number");
      });

      it("detects expression body change", () => {
        const fnA = DMN.functionDef([], DMN.literal("foo"));
        const fnB = DMN.functionDef([], DMN.literal("bar"));

        const diff = diffBoxedExpression(fnA, fnB) as FunctionDefinitionDiff;
        expect(diff.expression?.kind).toBe("literalExpression");
      });

      it("detects parameter reordering", () => {
        const p1 = DMN.param("p1", "string", "id_p1");
        const p2 = DMN.param("p2", "string", "id_p2");

        const fnA = DMN.functionDef([p1, p2], DMN.literal("foo"));
        const fnB = DMN.functionDef([p2, p1], DMN.literal("foo"));

        const diff = diffBoxedExpression(fnA, fnB) as FunctionDefinitionDiff;
        expect(diff.parameters.modified["id_p1"].index).toEqual({
          property: "index",
          previousValue: 0,
          currentValue: 1,
        });
        expect(diff.parameters.modified["id_p2"].index).toEqual({
          property: "index",
          previousValue: 1,
          currentValue: 0,
        });
      });
    });

    describe("Invocation", () => {
      it("detects modified binding expression", () => {
        const invA = DMN.invocation([DMN.binding("p1", DMN.literal("10"))]);
        const invB = DMN.invocation([DMN.binding("p1", DMN.literal("20"))]);

        const diff = diffBoxedExpression(invA, invB) as InvocationDiff;
        expect(diff.bindings.modified["p1"].expression?.kind).toBe("literalExpression");
      });

      it("detects binding reordering", () => {
        const b1 = DMN.binding("id_p1", DMN.literal("1"));
        const b2 = DMN.binding("id_p2", DMN.literal("2"));

        const invA = DMN.invocation([b1, b2]);
        const invB = DMN.invocation([b2, b1]);

        const diff = diffBoxedExpression(invA, invB) as InvocationDiff;
        expect(diff).toBeDefined();
        expect(diff.bindings.modified["id_p1"].index).toEqual({
          property: "index",
          previousValue: 0,
          currentValue: 1,
        });
        expect(diff.bindings.modified["id_p2"].index).toEqual({
          property: "index",
          previousValue: 1,
          currentValue: 0,
        });
      });
    });

    describe("Relation", () => {
      it("detects modified cell value", () => {
        const relA = DMN.relation([DMN.relCol("Col1", "c1")], [DMN.relRow([DMN.literal("ValA")], "r1")]);
        const relB = DMN.relation([DMN.relCol("Col1", "c1")], [DMN.relRow([DMN.literal("ValB")], "r1")]);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        // modified rows -> rowId -> cell -> diff
        expect(diff.rows.modified["r1"].cells[0].kind).toBe("literalExpression");
        const litDiff = diff.rows.modified["r1"].cells[0] as LiteralExpressionDiff;
        expect(litDiff.text?.currentValue).toBe("ValB");
      });

      it("fallback: matches rows by index when IDs are missing", () => {
        const relA = DMN.relation([DMN.relCol("C", "c1")], [DMN.relRow([DMN.literal("A")], "")]);
        const relB = DMN.relation([DMN.relCol("C", "c1")], [DMN.relRow([DMN.literal("B")], "")]);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff.rows.modified["0"].cells[0]).toBeDefined();
      });

      it("detects row reordering", () => {
        const relA = DMN.relation(
          [DMN.relCol("C", "c1")],
          [DMN.relRow([DMN.literal("A")], "r1"), DMN.relRow([DMN.literal("B")], "r2")]
        );
        const relB = DMN.relation(
          [DMN.relCol("C", "c1")],
          [DMN.relRow([DMN.literal("B")], "r2"), DMN.relRow([DMN.literal("A")], "r1")]
        );

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff.rows.modified["r1"].index).toEqual({
          property: "index",
          previousValue: 0,
          currentValue: 1,
        });
        expect(diff.rows.modified["r2"].index).toEqual({
          property: "index",
          previousValue: 1,
          currentValue: 0,
        });
      });
    });

    describe("Conditional", () => {
      it("detects changes in if branch", () => {
        const condA = DMN.conditional(DMN.literal("condition1"), DMN.literal("then1"), DMN.literal("else1"));
        const condB = DMN.conditional(DMN.literal("condition2"), DMN.literal("then1"), DMN.literal("else1"));

        const diff = diffBoxedExpression(condA, condB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("conditional");
        const condDiff = diff as ConditionalDiff;
        expect(condDiff.if).toBeDefined();
        expect(condDiff.if?.kind).toBe("literalExpression");
        expect(condDiff.then).toBeUndefined();
        expect(condDiff.else).toBeUndefined();
      });

      it("detects changes in then branch", () => {
        const condA = DMN.conditional(DMN.literal("cond"), DMN.literal("then1"), DMN.literal("else1"));
        const condB = DMN.conditional(DMN.literal("cond"), DMN.literal("then2"), DMN.literal("else1"));

        const diff = diffBoxedExpression(condA, condB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("conditional");
        const condDiff = diff as ConditionalDiff;
        expect(condDiff.if).toBeUndefined();
        expect(condDiff.then).toBeDefined();
        expect(condDiff.then?.kind).toBe("literalExpression");
        expect(condDiff.else).toBeUndefined();
      });

      it("detects changes in else branch", () => {
        const condA = DMN.conditional(DMN.literal("cond"), DMN.literal("then1"), DMN.literal("else1"));
        const condB = DMN.conditional(DMN.literal("cond"), DMN.literal("then1"), DMN.literal("else2"));

        const diff = diffBoxedExpression(condA, condB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("conditional");
        const condDiff = diff as ConditionalDiff;
        expect(condDiff.if).toBeUndefined();
        expect(condDiff.then).toBeUndefined();
        expect(condDiff.else).toBeDefined();
        expect(condDiff.else?.kind).toBe("literalExpression");
      });

      it("detects multiple branches changing simultaneously", () => {
        const condA = DMN.conditional(DMN.literal("cond1"), DMN.literal("then1"), DMN.literal("else1"));
        const condB = DMN.conditional(DMN.literal("cond2"), DMN.literal("then2"), DMN.literal("else2"));

        const diff = diffBoxedExpression(condA, condB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("conditional");
        const condDiff = diff as ConditionalDiff;
        expect(condDiff.if).toBeDefined();
        expect(condDiff.then).toBeDefined();
        expect(condDiff.else).toBeDefined();
      });

      it("handles nested conditionals", () => {
        const innerCondA = DMN.conditional(
          DMN.literal("inner_if"),
          DMN.literal("inner_then"),
          DMN.literal("inner_else")
        );
        const innerCondB = DMN.conditional(
          DMN.literal("inner_if_modified"),
          DMN.literal("inner_then"),
          DMN.literal("inner_else")
        );

        const outerCondA = DMN.conditional(innerCondA, DMN.literal("outer_then"), DMN.literal("outer_else"));
        const outerCondB = DMN.conditional(innerCondB, DMN.literal("outer_then"), DMN.literal("outer_else"));

        const diff = diffBoxedExpression(outerCondA, outerCondB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("conditional");
        const outerDiff = diff as ConditionalDiff;
        expect(outerDiff.if).toBeDefined();
        expect(outerDiff.if?.kind).toBe("conditional");
        const innerDiff = outerDiff.if as ConditionalDiff;
        expect(innerDiff.if).toBeDefined();
      });

      it("handles empty/undefined branches", () => {
        const condA = DMN.conditional(DMN.literal("cond"), undefined, DMN.literal("else1"));
        const condB = DMN.conditional(DMN.literal("cond"), DMN.literal("then1"), DMN.literal("else1"));

        const diff = diffBoxedExpression(condA, condB);
        expect(diff).toBeDefined();
        // When one branch is undefined and the other is defined, it's still a conditional diff
        expect(diff?.kind).toBe("conditional");
        const condDiff = diff as ConditionalDiff;
        expect(condDiff.then).toBeDefined(); // Then branch changed from undefined to defined
      });
    });

    describe("Filter", () => {
      it("detects changes in 'in' expression", () => {
        const filterA = DMN.filter(DMN.literal("list1"), DMN.literal("match"));
        const filterB = DMN.filter(DMN.literal("list2"), DMN.literal("match"));

        const diff = diffBoxedExpression(filterA, filterB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("filter");
        const filterDiff = diff as FilterDiff;
        expect(filterDiff.in).toBeDefined();
        expect(filterDiff.in?.kind).toBe("literalExpression");
        expect(filterDiff.match).toBeUndefined();
      });

      it("detects changes in 'match' expression", () => {
        const filterA = DMN.filter(DMN.literal("list"), DMN.literal("match1"));
        const filterB = DMN.filter(DMN.literal("list"), DMN.literal("match2"));

        const diff = diffBoxedExpression(filterA, filterB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("filter");
        const filterDiff = diff as FilterDiff;
        expect(filterDiff.in).toBeUndefined();
        expect(filterDiff.match).toBeDefined();
        expect(filterDiff.match?.kind).toBe("literalExpression");
      });

      it("detects both expressions changing", () => {
        const filterA = DMN.filter(DMN.literal("list1"), DMN.literal("match1"));
        const filterB = DMN.filter(DMN.literal("list2"), DMN.literal("match2"));

        const diff = diffBoxedExpression(filterA, filterB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("filter");
        const filterDiff = diff as FilterDiff;
        expect(filterDiff.in).toBeDefined();
        expect(filterDiff.match).toBeDefined();
      });

      it("handles nested filters", () => {
        const innerFilterA = DMN.filter(DMN.literal("inner_list"), DMN.literal("inner_match"));
        const innerFilterB = DMN.filter(DMN.literal("inner_list_modified"), DMN.literal("inner_match"));

        const outerFilterA = DMN.filter(innerFilterA, DMN.literal("outer_match"));
        const outerFilterB = DMN.filter(innerFilterB, DMN.literal("outer_match"));

        const diff = diffBoxedExpression(outerFilterA, outerFilterB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("filter");
        const outerDiff = diff as FilterDiff;
        expect(outerDiff.in).toBeDefined();
        expect(outerDiff.in?.kind).toBe("filter");
      });

      it("handles empty/undefined expressions", () => {
        const filterA = DMN.filter(undefined, DMN.literal("match"));
        const filterB = DMN.filter(DMN.literal("list"), DMN.literal("match"));

        const diff = diffBoxedExpression(filterA, filterB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("filter");
        const filterDiff = diff as FilterDiff;
        expect(filterDiff.in).toBeDefined();
      });
    });

    describe("Every", () => {
      it("detects changes in 'in' expression", () => {
        const everyA = DMN.every(DMN.literal("list1"), DMN.literal("condition"));
        const everyB = DMN.every(DMN.literal("list2"), DMN.literal("condition"));

        const diff = diffBoxedExpression(everyA, everyB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("every");
        const everyDiff = diff as EveryDiff;
        expect(everyDiff.in).toBeDefined();
        expect(everyDiff.in?.kind).toBe("literalExpression");
        expect(everyDiff.satisfies).toBeUndefined();
      });

      it("detects changes in 'satisfies' expression", () => {
        const everyA = DMN.every(DMN.literal("list"), DMN.literal("condition1"));
        const everyB = DMN.every(DMN.literal("list"), DMN.literal("condition2"));

        const diff = diffBoxedExpression(everyA, everyB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("every");
        const everyDiff = diff as EveryDiff;
        expect(everyDiff.in).toBeUndefined();
        expect(everyDiff.satisfies).toBeDefined();
        expect(everyDiff.satisfies?.kind).toBe("literalExpression");
      });

      it("detects both expressions changing", () => {
        const everyA = DMN.every(DMN.literal("list1"), DMN.literal("condition1"));
        const everyB = DMN.every(DMN.literal("list2"), DMN.literal("condition2"));

        const diff = diffBoxedExpression(everyA, everyB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("every");
        const everyDiff = diff as EveryDiff;
        expect(everyDiff.in).toBeDefined();
        expect(everyDiff.satisfies).toBeDefined();
      });

      it("handles nested every expressions", () => {
        const innerEveryA = DMN.every(DMN.literal("inner_list"), DMN.literal("inner_cond"));
        const innerEveryB = DMN.every(DMN.literal("inner_list_modified"), DMN.literal("inner_cond"));

        const outerEveryA = DMN.every(innerEveryA, DMN.literal("outer_cond"));
        const outerEveryB = DMN.every(innerEveryB, DMN.literal("outer_cond"));

        const diff = diffBoxedExpression(outerEveryA, outerEveryB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("every");
        const outerDiff = diff as EveryDiff;
        expect(outerDiff.in).toBeDefined();
        expect(outerDiff.in?.kind).toBe("every");
      });

      it("handles empty/undefined expressions", () => {
        const everyA = DMN.every(DMN.literal("list"), undefined);
        const everyB = DMN.every(DMN.literal("list"), DMN.literal("condition"));

        const diff = diffBoxedExpression(everyA, everyB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("every");
        const everyDiff = diff as EveryDiff;
        expect(everyDiff.satisfies).toBeDefined();
      });
    });

    describe("Some", () => {
      it("detects changes in 'in' expression", () => {
        const someA = DMN.some(DMN.literal("list1"), DMN.literal("condition"));
        const someB = DMN.some(DMN.literal("list2"), DMN.literal("condition"));

        const diff = diffBoxedExpression(someA, someB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("some");
        const someDiff = diff as SomeDiff;
        expect(someDiff.in).toBeDefined();
        expect(someDiff.in?.kind).toBe("literalExpression");
        expect(someDiff.satisfies).toBeUndefined();
      });

      it("detects changes in 'satisfies' expression", () => {
        const someA = DMN.some(DMN.literal("list"), DMN.literal("condition1"));
        const someB = DMN.some(DMN.literal("list"), DMN.literal("condition2"));

        const diff = diffBoxedExpression(someA, someB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("some");
        const someDiff = diff as SomeDiff;
        expect(someDiff.in).toBeUndefined();
        expect(someDiff.satisfies).toBeDefined();
        expect(someDiff.satisfies?.kind).toBe("literalExpression");
      });

      it("detects both expressions changing", () => {
        const someA = DMN.some(DMN.literal("list1"), DMN.literal("condition1"));
        const someB = DMN.some(DMN.literal("list2"), DMN.literal("condition2"));

        const diff = diffBoxedExpression(someA, someB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("some");
        const someDiff = diff as SomeDiff;
        expect(someDiff.in).toBeDefined();
        expect(someDiff.satisfies).toBeDefined();
      });

      it("handles nested some expressions", () => {
        const innerSomeA = DMN.some(DMN.literal("inner_list"), DMN.literal("inner_cond"));
        const innerSomeB = DMN.some(DMN.literal("inner_list_modified"), DMN.literal("inner_cond"));

        const outerSomeA = DMN.some(innerSomeA, DMN.literal("outer_cond"));
        const outerSomeB = DMN.some(innerSomeB, DMN.literal("outer_cond"));

        const diff = diffBoxedExpression(outerSomeA, outerSomeB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("some");
        const outerDiff = diff as SomeDiff;
        expect(outerDiff.in).toBeDefined();
        expect(outerDiff.in?.kind).toBe("some");
      });

      it("handles empty/undefined expressions", () => {
        const someA = DMN.some(undefined, DMN.literal("condition"));
        const someB = DMN.some(DMN.literal("list"), DMN.literal("condition"));

        const diff = diffBoxedExpression(someA, someB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("some");
        const someDiff = diff as SomeDiff;
        expect(someDiff.in).toBeDefined();
      });
    });

    describe("For", () => {
      it("detects changes in 'in' expression", () => {
        const forA = DMN.for(DMN.literal("list1"), DMN.literal("return_expr"));
        const forB = DMN.for(DMN.literal("list2"), DMN.literal("return_expr"));

        const diff = diffBoxedExpression(forA, forB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("for");
        const forDiff = diff as ForDiff;
        expect(forDiff.in).toBeDefined();
        expect(forDiff.in?.kind).toBe("literalExpression");
        expect(forDiff.return).toBeUndefined();
      });

      it("detects changes in 'return' expression", () => {
        const forA = DMN.for(DMN.literal("list"), DMN.literal("return1"));
        const forB = DMN.for(DMN.literal("list"), DMN.literal("return2"));

        const diff = diffBoxedExpression(forA, forB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("for");
        const forDiff = diff as ForDiff;
        expect(forDiff.in).toBeUndefined();
        expect(forDiff.return).toBeDefined();
        expect(forDiff.return?.kind).toBe("literalExpression");
      });

      it("detects both expressions changing", () => {
        const forA = DMN.for(DMN.literal("list1"), DMN.literal("return1"));
        const forB = DMN.for(DMN.literal("list2"), DMN.literal("return2"));

        const diff = diffBoxedExpression(forA, forB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("for");
        const forDiff = diff as ForDiff;
        expect(forDiff.in).toBeDefined();
        expect(forDiff.return).toBeDefined();
      });

      it("handles nested for expressions", () => {
        const innerForA = DMN.for(DMN.literal("inner_list"), DMN.literal("inner_return"));
        const innerForB = DMN.for(DMN.literal("inner_list_modified"), DMN.literal("inner_return"));

        const outerForA = DMN.for(innerForA, DMN.literal("outer_return"));
        const outerForB = DMN.for(innerForB, DMN.literal("outer_return"));

        const diff = diffBoxedExpression(outerForA, outerForB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("for");
        const outerDiff = diff as ForDiff;
        expect(outerDiff.in).toBeDefined();
        expect(outerDiff.in?.kind).toBe("for");
      });

      it("handles empty/undefined expressions", () => {
        const forA = DMN.for(DMN.literal("list"), undefined);
        const forB = DMN.for(DMN.literal("list"), DMN.literal("return"));

        const diff = diffBoxedExpression(forA, forB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("for");
        const forDiff = diff as ForDiff;
        expect(forDiff.return).toBeDefined();
      });
    });
  });

  describe("Cross-Cutting Concerns", () => {
    describe("Index Fallback Matching", () => {
      it("matches Function Definition parameters by index when IDs are missing", () => {
        const p1A = DMN.param("p1", "string", "");
        const p1B = DMN.param("p1", "number", "");

        const fnA = DMN.functionDef([p1A], DMN.literal("body"));
        const fnB = DMN.functionDef([p1B], DMN.literal("body"));

        const diff = diffBoxedExpression(fnA, fnB) as FunctionDefinitionDiff;
        expect(diff).toBeDefined();
        expect(diff.kind).toBe("functionDefinition");

        const changes = diff.parameters.modified["0"];
        expect(changes).toBeDefined();
        expect(changes.diffs[0].property).toBe("typeRef");
        expect(diff.parameters.added).toHaveLength(0);
        expect(diff.parameters.removed).toHaveLength(0);
      });

      it("matches Invocation bindings by index when IDs are missing", () => {
        const b1A = DMN.binding("", DMN.literal("10"));
        const b1B = DMN.binding("", DMN.literal("20"));

        const invA = DMN.invocation([b1A]);
        const invB = DMN.invocation([b1B]);

        const diff = diffBoxedExpression(invA, invB) as InvocationDiff;
        expect(diff).toBeDefined();
        expect(diff.kind).toBe("invocation");

        const changes = diff.bindings.modified["0"];
        expect(changes).toBeDefined();
        expect(changes.expression?.kind).toBe("literalExpression");
        expect(diff.bindings.added).toHaveLength(0);
        expect(diff.bindings.removed).toHaveLength(0);
      });

      it("matches List items by index when IDs are missing (Addition/Removal)", () => {
        // Case: A has 1 item, B has 0 (Removal)
        const listA = DMN.list([DMN.literal("A")]); // No ID
        const listB = DMN.list([]);

        const diff1 = diffBoxedExpression(listA, listB) as ListDiff;
        expect(diff1).toBeDefined();
        expect(diff1.items.removed).toContain(0);

        // Case: A has 0 items, B has 1 (Addition)
        const diff2 = diffBoxedExpression(listB, listA) as ListDiff;
        expect(diff2).toBeDefined();
        expect(diff2.items.added).toContain(0);
      });

      it("matches Context entries by index when IDs are missing (Addition/Removal)", () => {
        // Case: A has 1 var, B has 0
        const entry = DMN.contextEntry("v", DMN.literal("val"), "");
        const ctxA = DMN.context([entry]);
        const ctxB = DMN.context([]);

        const diff1 = diffBoxedExpression(ctxA, ctxB) as ContextDiff;
        expect(diff1).toBeDefined();
        expect(diff1.entries.removed).toContain("0");

        // Case: A has 0 var, B has 1
        const diff2 = diffBoxedExpression(ctxB, ctxA) as ContextDiff;
        expect(diff2).toBeDefined();
        expect(diff2.entries.added).toContain("0");
      });
    });

    describe("Complex Nested Scenarios", () => {
      it("Deep nesting: List in Context in List", () => {
        const deepExprA = DMN.list(
          [
            DMN.context(
              [DMN.contextEntry("v1", DMN.list([DMN.literal("old", "deepId")], "list2"), "ctx_entry")],
              "ctx1"
            ),
          ],
          "list1"
        );

        const deepExprB = DMN.list(
          [
            DMN.context(
              [DMN.contextEntry("v1", DMN.list([DMN.literal("new", "deepId")], "list2"), "ctx_entry")],
              "ctx1"
            ),
          ],
          "list1"
        );

        const diff = diffBoxedExpression(deepExprA, deepExprB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("list");

        const rootListDiff = diff as ListDiff;
        const ctxDiff = rootListDiff.items.modified[0].diff as ContextDiff;
        expect(ctxDiff.kind).toBe("context");

        const nestedListDiff = ctxDiff.entries.modified["ctx_entry"].expression as ListDiff;
        expect(nestedListDiff.kind).toBe("list");

        const litDiff = nestedListDiff.items.modified[0].diff as LiteralExpressionDiff;
        expect(litDiff.kind).toBe("literalExpression");
        expect(litDiff.text?.currentValue).toBe("new");
      });
    });
  });

  describe("Edge Cases", () => {
    describe("Empty Expressions", () => {
      it("detects no changes when both expressions are undefined", () => {
        const diff = diffBoxedExpression(undefined, undefined);
        expect(diff).toBeUndefined();
      });

      it("detects expression replacement when one side is undefined", () => {
        const exprA = DMN.literal("foo");
        const diff = diffBoxedExpression(exprA, undefined);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("expressionReplacement");
      });

      it("handles empty list expressions", () => {
        const listA = DMN.list([]);
        const listB = DMN.list([]);
        const diff = diffBoxedExpression(listA, listB);
        expect(diff).toBeUndefined();
      });

      it("handles empty context expressions", () => {
        const ctxA = DMN.context([]);
        const ctxB = DMN.context([]);
        const diff = diffBoxedExpression(ctxA, ctxB);
        expect(diff).toBeUndefined();
      });

      it("handles empty decision table rules", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        const diff = diffBoxedExpression(dtA, dtB);
        expect(diff).toBeUndefined();
      });
    });

    describe("Deeply Nested Structures", () => {
      it("handles 4 levels of nesting: List → Context → DecisionTable → List", () => {
        const deepA = DMN.list([
          DMN.context([
            DMN.contextEntry(
              "v1",
              DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["old_value"], "r1")]),
              "ctx_entry"
            ),
          ]),
        ]);

        const deepB = DMN.list([
          DMN.context([
            DMN.contextEntry(
              "v1",
              DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["new_value"], "r1")]),
              "ctx_entry"
            ),
          ]),
        ]);

        const diff = diffBoxedExpression(deepA, deepB);
        expect(diff).toBeDefined();
        expect(diff?.kind).toBe("list");
      });

      it("handles 5 levels of nesting with mixed expression types", () => {
        const deep5A = DMN.context(
          [
            DMN.contextEntry(
              "level1",
              DMN.list(
                [
                  DMN.functionDef(
                    [],
                    DMN.context(
                      [
                        DMN.contextEntry(
                          "level4",
                          DMN.list([DMN.literal("original", "level5")], "level5_list"),
                          "level4_entry"
                        ),
                      ],
                      "level4_ctx"
                    ),
                    "level3_fn"
                  ),
                ],
                "level2_list"
              ),
              "level1_entry"
            ),
          ],
          "level1_ctx"
        );

        const deep5B = DMN.context(
          [
            DMN.contextEntry(
              "level1",
              DMN.list(
                [
                  DMN.functionDef(
                    [],
                    DMN.context(
                      [
                        DMN.contextEntry(
                          "level4",
                          DMN.list([DMN.literal("modified", "level5")], "level5_list"),
                          "level4_entry"
                        ),
                      ],
                      "level4_ctx"
                    ),
                    "level3_fn"
                  ),
                ],
                "level2_list"
              ),
              "level1_entry"
            ),
          ],
          "level1_ctx"
        );

        const diff = diffBoxedExpression(deep5A, deep5B);
        expect(diff).toBeDefined();
        // Verify we can traverse all the way down
        expect(diff?.kind).toBe("context");
      });
    });

    describe("Mixed ID/Index Scenarios", () => {
      it("handles Decision Table rules where some have IDs and others don't", () => {
        const dtA = DMN.decisionTable(
          [DMN.inputClause("I", "i1")],
          [DMN.rule(["A"], "r1"), DMN.rule(["B"], ""), DMN.rule(["C"], "r3")] // Middle rule has no ID
        );

        const dtB = DMN.decisionTable(
          [DMN.inputClause("I", "i1")],
          [DMN.rule(["A"], "r1"), DMN.rule(["B_modified"], ""), DMN.rule(["C"], "r3")]
        );

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        // Rule with ID should be matched by ID
        expect(diff.rules.modified["r1"]).toBeUndefined();
        expect(diff.rules.modified["r3"]).toBeUndefined();
        // Rule without ID should be matched by index
        expect(diff.rules.modified["1"]).toBeDefined();
      });

      it("handles Context entries with partial ID coverage", () => {
        const ctxA = DMN.context([
          DMN.contextEntry("var1", DMN.literal("A"), "id1"),
          DMN.contextEntry("var2", DMN.literal("B"), ""), // No ID
          DMN.contextEntry("var3", DMN.literal("C"), "id3"),
        ]);

        const ctxB = DMN.context([
          DMN.contextEntry("var1", DMN.literal("A"), "id1"),
          DMN.contextEntry("var2", DMN.literal("B_modified"), ""), // No ID, modified
          DMN.contextEntry("var3", DMN.literal("C"), "id3"),
        ]);

        const diff = diffBoxedExpression(ctxA, ctxB) as ContextDiff;
        expect(diff).toBeDefined();
        // Entries with IDs should not be flagged as modified
        expect(diff.entries.modified["id1"]).toBeUndefined();
        expect(diff.entries.modified["id3"]).toBeUndefined();
        // Entry without ID should be matched by index
        expect(diff.entries.modified["1"]).toBeDefined();
      });

      it("handles List items with partial ID coverage", () => {
        const listA = DMN.list([DMN.literal("A", "id_a"), DMN.literal("B"), DMN.literal("C", "id_c")]);

        const listB = DMN.list([DMN.literal("A", "id_a"), DMN.literal("B_modified"), DMN.literal("C", "id_c")]);

        const diff = diffBoxedExpression(listA, listB) as ListDiff;
        expect(diff).toBeDefined();
        // Items with IDs should not be flagged
        expect(diff.items.modified[0]).toBeUndefined();
        expect(diff.items.modified[2]).toBeUndefined();
        // Item without ID should be matched by index
        expect(diff.items.modified[1]).toBeDefined();
      });
    });

    describe("Hit Policy and Aggregation", () => {
      it("detects Hit Policy changes", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        // TypeScript types don't include @_hitPolicy property
        (dtA as any)["@_hitPolicy"] = "UNIQUE";

        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        (dtB as any)["@_hitPolicy"] = "FIRST";

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.hitPolicy).toBeDefined();
        expect(diff.hitPolicy?.previousValue).toBe("UNIQUE");
        expect(diff.hitPolicy?.currentValue).toBe("FIRST");
      });

      it("detects Aggregation changes", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        // TypeScript types don't include @_aggregation property
        (dtA as any)["@_aggregation"] = "SUM";

        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        (dtB as any)["@_aggregation"] = "COUNT";

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.aggregation).toBeDefined();
        expect(diff.aggregation?.previousValue).toBe("SUM");
        expect(diff.aggregation?.currentValue).toBe("COUNT");
      });

      it("detects both Hit Policy and Aggregation changes simultaneously", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        // TypeScript types don't include @_hitPolicy and @_aggregation properties
        (dtA as any)["@_hitPolicy"] = "COLLECT";
        (dtA as any)["@_aggregation"] = "MIN";

        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], []);
        (dtB as any)["@_hitPolicy"] = "COLLECT";
        (dtB as any)["@_aggregation"] = "MAX";

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.hitPolicy).toBeUndefined(); // Same value
        expect(diff.aggregation).toBeDefined();
        expect(diff.aggregation?.currentValue).toBe("MAX");
      });
    });

    describe("Decision Table Column Type Changes", () => {
      it("detects input column type reference changes", () => {
        const inputA = DMN.inputClause("Input", "in1");
        // TypeScript types don't include @_typeRef property
        (inputA.inputExpression as any)["@_typeRef"] = "string";

        const inputB = DMN.inputClause("Input", "in1");
        (inputB.inputExpression as any)["@_typeRef"] = "number";

        const dtA = DMN.decisionTable([inputA], []);
        const dtB = DMN.decisionTable([inputB], []);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.input.modified["in1"]).toBeDefined();
        // The property is tracked as "inputExpression" with nested typeRef change
        const changes = diff.input.modified["in1"];
        expect(changes.typeRef).toBeDefined();
      });

      it("detects output column type reference changes", () => {
        const dtA = DMN.decisionTable([], []);
        // TypeScript types don't include @_typeRef property
        (dtA.output?.[0] as any)["@_typeRef"] = "string";

        const dtB = DMN.decisionTable([], []);
        (dtB.output?.[0] as any)["@_typeRef"] = "boolean";

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff).toBeDefined();
        expect(diff.output.modified["dt_out"]).toBeDefined();
        const typeChange = diff.output.modified["dt_out"].typeRef;
        expect(typeChange).toBeDefined();
        expect(typeChange?.previousValue).toBe("string");
        expect(typeChange?.currentValue).toBe("boolean");
      });
    });

    describe("Depth Limit", () => {
      it("stops recursing when depth limit is exceeded", () => {
        // Helper to create a nested list structure
        const createNestedMock = (depth: number, value: string): Normalized<BoxedExpression> => {
          if (depth === 0) {
            return DMN.literal(value);
          }
          return DMN.list([createNestedMock(depth - 1, value)]);
        };

        // Create deeply nested expressions (depth 55 > 50)
        const deepA = createNestedMock(55, "initial");
        const deepB = createNestedMock(55, "modified");

        const diff = diffBoxedExpression(deepA, deepB);

        // Should return undefined because it stops recursing before finding the difference at the bottom
        expect(diff).toBeUndefined();
      });

      it("detects changes within depth limit", () => {
        // Helper to create a nested list structure
        const createNestedMock = (depth: number, value: string): Normalized<BoxedExpression> => {
          if (depth === 0) {
            return DMN.literal(value);
          }
          return DMN.list([createNestedMock(depth - 1, value)]);
        };

        // Create nested expressions within limit (depth 45 < 50)
        const deepA = createNestedMock(45, "initial");
        const deepB = createNestedMock(45, "modified");

        const diff = diffBoxedExpression(deepA, deepB);

        // Should find the diff since it's within the limit
        expect(diff).toBeDefined();
      });
    });
  });

  describe("Coverage", () => {
    describe("Coverage Improvements - Relation Diff", () => {
      it("detects column removal when columns lack ids (fallback)", () => {
        const colA = DMN.relCol("Col1", "");
        const relA = DMN.relation([colA], []);
        const relB = DMN.relation([], []);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.kind).toBe("relation");
        expect(diff.columns.removed).toContain("0");
      });

      it("detects column addition when columns lack ids (fallback)", () => {
        const colB = DMN.relCol("Col1", "");
        const relA = DMN.relation([], []);
        const relB = DMN.relation([colB], []);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.columns.added).toContain("0");
      });

      it("detects column modification when columns lack ids (fallback)", () => {
        const colA = DMN.relCol("Col1", "");
        const colB = DMN.relCol("Col1_Modified", "");
        const relA = DMN.relation([colA], []);
        const relB = DMN.relation([colB], []);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.columns.modified["0"]).toBeDefined();
        expect(diff.columns.modified["0"][0].property).toBe("name");
        expect(diff.columns.modified["0"][0].currentValue).toBe("Col1_Modified");
      });

      it("detects typeRef modification when columns lack ids (fallback)", () => {
        const colA = DMN.relCol("Col1", "");
        const colB = DMN.relCol("Col1", "");
        colA["@_typeRef"] = "string";
        colB["@_typeRef"] = "number";

        const relA = DMN.relation([colA], []);
        const relB = DMN.relation([colB], []);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.columns.modified["0"][0].property).toBe("typeRef");
        expect(diff.columns.modified["0"][0].currentValue).toBe("number");
      });

      it("detects row removal when rows lack ids (fallback)", () => {
        const rowA = DMN.relRow([DMN.literal("val")], "");
        const relA = DMN.relation([], [rowA]);
        const relB = DMN.relation([], []);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.rows.removed).toContain("0");
      });

      it("detects row addition when rows lack ids (fallback)", () => {
        const rowB = DMN.relRow([DMN.literal("val")], "");
        const relA = DMN.relation([], []);
        const relB = DMN.relation([], [rowB]);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.rows.added).toContain("0");
      });

      it("detects row modification when rows lack ids (fallback)", () => {
        const rowA = DMN.relRow([DMN.literal("valA")], "");
        const rowB = DMN.relRow([DMN.literal("valB")], "");
        const relA = DMN.relation([], [rowA]);
        const relB = DMN.relation([], [rowB]);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.rows.modified["0"].cells[0]).toBeDefined();
      });

      it("detects column removal by ID", () => {
        const colA = DMN.relCol("Col1", "c1");
        const relA = DMN.relation([colA], []);
        const relB = DMN.relation([], []);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        expect(diff.columns.removed).toContain("c1");
      });

      it("detects column modifications (name and typeRef)", () => {
        const colA = DMN.relCol("Col1", "c1");
        colA["@_typeRef"] = "string";

        const colB = DMN.relCol("Col1_Mod", "c1");
        colB["@_typeRef"] = "number";

        const relA = DMN.relation([colA], []);
        const relB = DMN.relation([colB], []);

        const diff = diffBoxedExpression(relA, relB) as RelationDiff;
        expect(diff).toBeDefined();
        const changes = diff.columns.modified["c1"];
        expect(changes).toBeDefined();
        expect(changes.find((c) => c.property === "name")?.currentValue).toBe("Col1_Mod");
        expect(changes.find((c) => c.property === "typeRef")?.currentValue).toBe("number");
      });
    });

    describe("Coverage Improvements - Identity Checks", () => {
      it("returns undefined for identical Conditional objects", () => {
        const cond = DMN.conditional(DMN.literal("if"), DMN.literal("then"), DMN.literal("else"));
        const diff = diffBoxedExpression(cond, cond);
        expect(diff).toBeUndefined();
      });

      it("returns undefined for identical Filter objects", () => {
        const filter = DMN.filter(DMN.literal("in"), DMN.literal("match"));
        const diff = diffBoxedExpression(filter, filter);
        expect(diff).toBeUndefined();
      });

      it("returns undefined for identical Every objects", () => {
        const every = DMN.every(DMN.literal("in"), DMN.literal("satisfies"));
        const diff = diffBoxedExpression(every, every);
        expect(diff).toBeUndefined();
      });

      it("returns undefined for identical Some objects", () => {
        const some = DMN.some(DMN.literal("in"), DMN.literal("satisfies"));
        const diff = diffBoxedExpression(some, some);
        expect(diff).toBeUndefined();
      });

      it("returns undefined for identical For objects", () => {
        const forExpr = DMN.for(DMN.literal("in"), DMN.literal("return"));
        const diff = diffBoxedExpression(forExpr, forExpr);
        expect(diff).toBeUndefined();
      });
    });

    describe("Index Fallback Coverage - Context Diff", () => {
      it("detects entry removal when IDs are missing", () => {
        const ctxA = DMN.context([
          DMN.contextEntry("var1", DMN.literal("A"), ""),
          DMN.contextEntry("var2", DMN.literal("B"), ""),
        ]);
        const ctxB = DMN.context([DMN.contextEntry("var1", DMN.literal("A"), "")]);

        const diff = diffBoxedExpression(ctxA, ctxB) as ContextDiff;
        expect(diff).toBeDefined();
        expect(diff.entries.removed).toContain("1");
      });

      it("detects entry addition when IDs are missing", () => {
        const ctxA = DMN.context([DMN.contextEntry("var1", DMN.literal("A"), "")]);
        const ctxB = DMN.context([
          DMN.contextEntry("var1", DMN.literal("A"), ""),
          DMN.contextEntry("var2", DMN.literal("B"), ""),
        ]);

        const diff = diffBoxedExpression(ctxA, ctxB) as ContextDiff;
        expect(diff).toBeDefined();
        expect(diff.entries.added).toContain("1");
      });
    });

    describe("Index Fallback Coverage - Decision Table Diff", () => {
      it("detects column removal when columns lack ids", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I1", ""), DMN.inputClause("I2", "")], []);
        const dtB = DMN.decisionTable([DMN.inputClause("I1", "")], []);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.input.removed).toContain("1");
      });

      it("detects column addition when columns lack ids", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I1", "")], []);
        const dtB = DMN.decisionTable([DMN.inputClause("I1", ""), DMN.inputClause("I2", "")], []);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.input.added).toContain("1");
      });

      it("detects modification when columns lack ids", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I1", "")], []);
        const dtB = DMN.decisionTable([DMN.inputClause("I1_mod", "")], []);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.input.modified["0"]).toBeDefined();
        expect(diff.input.modified["0"].label?.property).toBe("label");
      });

      it("detects typeRef modification when columns lack ids", () => {
        const inA = DMN.inputClause("I1", "");
        (inA.inputExpression as any)["@_typeRef"] = "string";
        const inB = DMN.inputClause("I1", "");
        (inB.inputExpression as any)["@_typeRef"] = "number";

        const dtA = DMN.decisionTable([inA], []);
        const dtB = DMN.decisionTable([inB], []);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.input.modified["0"].typeRef?.property).toBe("typeRef");
      });

      it("detects row removal when rows lack ids", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], ""), DMN.rule(["B"], "")]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], "")]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.rules.removed).toContain("1");
      });

      it("detects row addition when rows lack ids", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], "")]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], ""), DMN.rule(["B"], "")]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.rules.added).toContain("1");
      });

      it("detects row modification when rows lack ids", () => {
        const dtA = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A"], "")]);
        const dtB = DMN.decisionTable([DMN.inputClause("I", "i1")], [DMN.rule(["A_mod"], "")]);

        const diff = diffBoxedExpression(dtA, dtB) as DecisionTableDiff;
        expect(diff.rules.modified["0"]).toBeDefined();
        expect(diff.rules.modified["0"].inputEntries[0].currentValue).toBe("A_mod");
      });
    });

    describe("Index Fallback Coverage - Function Definition Diff", () => {
      it("detects parameter removal when params lack ids", () => {
        const fnA = DMN.functionDef([DMN.param("p1", "string", ""), DMN.param("p2", "string", "")], DMN.literal("b"));
        const fnB = DMN.functionDef([DMN.param("p1", "string", "")], DMN.literal("b"));

        const diff = diffBoxedExpression(fnA, fnB) as FunctionDefinitionDiff;
        expect(diff.parameters.removed).toContain("1");
      });

      it("detects parameter addition when params lack ids", () => {
        const fnA = DMN.functionDef([DMN.param("p1", "string", "")], DMN.literal("b"));
        const fnB = DMN.functionDef([DMN.param("p1", "string", ""), DMN.param("p2", "string", "")], DMN.literal("b"));

        const diff = diffBoxedExpression(fnA, fnB) as FunctionDefinitionDiff;
        expect(diff.parameters.added).toContain("1");
      });
    });

    describe("Invocation Diff - Identical Bindings Coverage", () => {
      it("returns undefined for identical bindings (coverage for early exit)", () => {
        const b1 = DMN.binding("p1", DMN.literal("val1"));
        const b2 = DMN.binding("p2", DMN.literal("val2"));

        const invA = DMN.invocation([b1, b2]);
        // Create a new object with same content to ensure deep equality check works
        const invB = DMN.invocation([structuredClone(b1), structuredClone(b2)]);

        const diff = diffBoxedExpression(invA, invB);
        expect(diff).toBeUndefined();
      });
    });
  });
});

describe("BKM Integration Tests", () => {
  describe("Parameter Changes", () => {
    it("detects BKM parameter name change via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fnA = DMN.functionDef([DMN.param("oldParam", "string", "p1")], DMN.literal("body"));
      const fnB = DMN.functionDef([DMN.param("newParam", "string", "p1")], DMN.literal("body"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnA });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnB });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
      expect(diff.nodes[0].boxedExpressionDiff).toBeDefined();
      expect(diff.nodes[0].boxedExpressionDiff?.kind).toBe("functionDefinition");

      const fnDiff = diff.nodes[0].boxedExpressionDiff as FunctionDefinitionDiff;
      expect(fnDiff.parameters.modified["p1"]).toBeDefined();
      expect(fnDiff.parameters.modified["p1"].diffs[0].property).toBe("name");
      expect(fnDiff.parameters.modified["p1"].diffs[0].previousValue).toBe("oldParam");
      expect(fnDiff.parameters.modified["p1"].diffs[0].currentValue).toBe("newParam");
    });

    it("detects BKM parameter type change via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fnA = DMN.functionDef([DMN.param("param1", "string", "p1")], DMN.literal("body"));
      const fnB = DMN.functionDef([DMN.param("param1", "number", "p1")], DMN.literal("body"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnA });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnB });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      const fnDiff = diff.nodes[0].boxedExpressionDiff as FunctionDefinitionDiff;
      expect(fnDiff.parameters.modified["p1"].diffs[0].property).toBe("typeRef");
      expect(fnDiff.parameters.modified["p1"].diffs[0].previousValue).toBe("string");
      expect(fnDiff.parameters.modified["p1"].diffs[0].currentValue).toBe("number");
    });

    it("detects BKM parameter reordering via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const p1 = DMN.param("param1", "string", "p1");
      const p2 = DMN.param("param2", "number", "p2");

      const fnA = DMN.functionDef([p1, p2], DMN.literal("body"));
      const fnB = DMN.functionDef([p2, p1], DMN.literal("body"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnA });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnB });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      const fnDiff = diff.nodes[0].boxedExpressionDiff as FunctionDefinitionDiff;
      expect(fnDiff.parameters.modified["p1"].index).toEqual({
        property: "index",
        previousValue: 0,
        currentValue: 1,
      });
      expect(fnDiff.parameters.modified["p2"].index).toEqual({
        property: "index",
        previousValue: 1,
        currentValue: 0,
      });
    });

    it("detects BKM parameter addition via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fnA = DMN.functionDef([DMN.param("x", "number", "p1")], DMN.literal("x"));
      const fnB = DMN.functionDef(
        [DMN.param("x", "number", "p1"), DMN.param("y", "number", "p2")],
        DMN.literal("x + y")
      );

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnA });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnB });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      const fnDiff = diff.nodes[0].boxedExpressionDiff as FunctionDefinitionDiff;
      expect(fnDiff.parameters.added).toContain("p2");
    });

    it("detects BKM parameter removal via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fnA = DMN.functionDef(
        [DMN.param("x", "number", "p1"), DMN.param("y", "number", "p2")],
        DMN.literal("x + y")
      );
      const fnB = DMN.functionDef([DMN.param("x", "number", "p1")], DMN.literal("x"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnA });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnB });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      const fnDiff = diff.nodes[0].boxedExpressionDiff as FunctionDefinitionDiff;
      expect(fnDiff.parameters.removed).toContain("p2");
    });
  });

  describe("Expression Changes", () => {
    it("detects BKM body expression change via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fnA = DMN.functionDef([DMN.param("x", "number", "p1")], DMN.literal("x + 1"));
      const fnB = DMN.functionDef([DMN.param("x", "number", "p1")], DMN.literal("x * 2"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnA });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnB });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      const fnDiff = diff.nodes[0].boxedExpressionDiff as FunctionDefinitionDiff;
      expect(fnDiff.expression).toBeDefined();
      expect(fnDiff.expression?.kind).toBe("literalExpression");
    });

    it("detects complex nested expression changes in BKM body via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const complexBodyA = DMN.context([DMN.contextEntry("result", DMN.literal("old value"), "ctx1")]);
      const complexBodyB = DMN.context([DMN.contextEntry("result", DMN.literal("new value"), "ctx1")]);

      const fnA = DMN.functionDef([DMN.param("x", "number", "p1")], complexBodyA);
      const fnB = DMN.functionDef([DMN.param("x", "number", "p1")], complexBodyB);

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnA });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fnB });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      const fnDiff = diff.nodes[0].boxedExpressionDiff as FunctionDefinitionDiff;
      expect(fnDiff.expression).toBeDefined();
      expect(fnDiff.expression?.kind).toBe("context");
    });

    it("detects no changes when BKM is identical via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fn = DMN.functionDef([DMN.param("x", "number", "p1")], DMN.literal("x + 1"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fn });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fn });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(0);
      expect(diff.hasChanges).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("detects BKM with no encapsulatedLogic via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate" });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate Modified" });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
      expect(diff.nodes[0].boxedExpressionDiff).toBeUndefined();
      expect(diff.nodes[0].changedProperties).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: "name", previousValue: "Calculate", currentValue: "Calculate Modified" }),
        ])
      );
    });

    it("detects BKM encapsulatedLogic added via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fn = DMN.functionDef([DMN.param("x", "number", "p1")], DMN.literal("x + 1"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate" });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fn });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
      expect(diff.nodes[0].boxedExpressionDiff).toBeDefined();
      expect(diff.nodes[0].boxedExpressionDiff?.kind).toBe("expressionReplacement");
    });

    it("detects BKM encapsulatedLogic removed via computeDmnDiff", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      const fn = DMN.functionDef([DMN.param("x", "number", "p1")], DMN.literal("x + 1"));

      addBusinessKnowledgeModel(source, { id: "BKM_1", name: "Calculate", encapsulatedLogic: fn });
      addBusinessKnowledgeModel(target, { id: "BKM_1", name: "Calculate" });

      const diff = computeDmnDiff(source, target);

      expect(diff.nodes).toHaveLength(1);
      expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
      expect(diff.nodes[0].boxedExpressionDiff).toBeDefined();
      expect(diff.nodes[0].boxedExpressionDiff?.kind).toBe("expressionReplacement");
    });

    it("ignores boxed expression diffs for Decision Services", () => {
      const source = createEmptyModel();
      const target = createEmptyModel();

      source.definitions.drgElement?.push({
        __$$element: "decisionService",
        "@_id": "ds1",
        "@_name": "DS1",
        variable: { "@_id": "ds1_var", "@_name": "DS1" },
      } as any);

      target.definitions.drgElement?.push({
        __$$element: "decisionService",
        "@_id": "ds1",
        "@_name": "DS1 Modified",
        variable: { "@_id": "ds1_var", "@_name": "DS1 Modified" },
      } as any);

      const diff = computeDmnDiff(source, target);
      expect(diff.nodes).toHaveLength(1);
      expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
      expect(diff.nodes[0].boxedExpressionDiff).toBeUndefined();
    });

    describe("Integration Edge Cases", () => {
      it("completes within performance budget", () => {
        const source = createEmptyModel();
        const target = createEmptyModel();

        const numElements = 100;
        const largeRulesSource = Array.from({ length: numElements }, (_, i) => ({
          "@_id": `rule_${i}`,
          inputEntry: [{ "@_id": `in_${i}`, text: { __$$text: `"${i}"` } }],
          outputEntry: [{ "@_id": `out_${i}`, text: { __$$text: `"${i}"` } }],
        }));

        const addLargeDecision = (model: any, rules: any[]) => {
          model.definitions.drgElement?.push({
            __$$element: "decision",
            "@_id": "Performance_Decision",
            "@_name": "Performance Decision",
            decisionTable: {
              __$$element: "decisionTable",
              "@_id": "Performance_DT",
              input: [{ "@_id": "input_1", inputExpression: { "@_id": "ie_1", text: { __$$text: "Input" } } }],
              output: [{ "@_id": "output_1", "@_name": "Output" }],
              rule: rules,
            },
          });
          diagramElements(model).push(createShape("Performance_Decision", { x: 0, y: 0 }));
        };

        addLargeDecision(source, largeRulesSource);
        addLargeDecision(target, largeRulesSource);

        const startTime = performance.now();
        computeDmnDiff(source, target);
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(3000);
      });

      it("handles very large decision tables (performance check)", () => {
        const source = createEmptyModel();
        const target = createEmptyModel();

        const largeDtRulesSource = Array.from({ length: 200 }, (_, i) => ({
          "@_id": `rule_${i}`,
          inputEntry: [{ "@_id": `in_${i}`, text: { __$$text: `"${i}"` } }],
          outputEntry: [{ "@_id": `out_${i}`, text: { __$$text: `"${i}"` } }],
        }));

        const largeDtRulesTarget = [...largeDtRulesSource];
        largeDtRulesTarget[199] = {
          ...largeDtRulesTarget[199],
          outputEntry: [{ "@_id": `out_199`, text: { __$$text: `"modified"` } }],
        };

        const decisionId = "Decision_Large";
        const addLargeDecision = (model: any, rules: any[]) => {
          model.definitions.drgElement?.push({
            __$$element: "decision",
            "@_id": decisionId,
            "@_name": "Large Decision",
            decisionTable: {
              __$$element: "decisionTable",
              "@_id": `${decisionId}_dt`,
              input: [{ "@_id": "input_1", inputExpression: { "@_id": "ie_1", text: { __$$text: "Input" } } }],
              output: [{ "@_id": "output_1", "@_name": "Output" }],
              rule: rules,
            },
          });
          diagramElements(model).push(createShape(decisionId, { x: 0, y: 0 }));
        };

        addLargeDecision(source, largeDtRulesSource);
        addLargeDecision(target, largeDtRulesTarget);

        const diff = computeDmnDiff(source, target);

        expect(diff.nodes).toHaveLength(1);
        expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
        expect(diff.nodes[0].boxedExpressionDiff).toBeDefined();
      });

      it("handles unicode and special characters correctly", () => {
        const source = createEmptyModel();
        const target = createEmptyModel();

        const unicodeName = "Decision 🚀";
        const unicodeLiteral = "안녕하세요";
        const specialCharsLiteral = 'Line 1\nLine 2\tTabbed "Quoted"';

        const addUnicodeDecision = (model: any, literalText: string) => {
          model.definitions.drgElement?.push({
            __$$element: "decision",
            "@_id": "unicode_decision",
            "@_name": unicodeName,
            literalExpression: {
              __$$element: "literalExpression",
              "@_id": "lit_expr",
              text: { __$$text: literalText },
            },
          });
          diagramElements(model).push(createShape("unicode_decision", { x: 0, y: 0 }));
        };

        addUnicodeDecision(source, unicodeLiteral);
        addUnicodeDecision(target, specialCharsLiteral);

        const diff = computeDmnDiff(source, target);

        expect(diff.nodes).toHaveLength(1);
        expect(diff.nodes[0].changeType).toBe(DiffChangeType.MODIFIED);
        expect(diff.nodes[0].boxedExpressionDiff).toBeDefined();
      });

      it("handles circular references gracefully (no infinite recursion)", () => {
        const source = createEmptyModel();
        const target = createEmptyModel();

        addDecision(source, {
          id: "Decision_A",
          name: "Decision A",
          informationRequirements: [{ id: "req_B", requiredInputId: "Decision_B" }],
        });
        addDecision(source, {
          id: "Decision_B",
          name: "Decision B",
          informationRequirements: [{ id: "req_A", requiredInputId: "Decision_A" }],
        });

        addDecision(target, {
          id: "Decision_A",
          name: "Decision A Modified",
          informationRequirements: [{ id: "req_B", requiredInputId: "Decision_B" }],
        });
        addDecision(target, {
          id: "Decision_B",
          name: "Decision B",
          informationRequirements: [{ id: "req_A", requiredInputId: "Decision_A" }],
        });

        const diff = computeDmnDiff(source, target);

        expect(diff.nodes).toHaveLength(1);
        const modifiedNode = diff.nodes.find((n) => n.id.endsWith("Decision_A"));
        expect(modifiedNode).toBeDefined();
        expect(modifiedNode?.changeType).toBe(DiffChangeType.MODIFIED);
      });
    });
  });

  describe("Performance Benchmarks", () => {
    it("should diff large decision table (100 rules, 20 columns) within 3 seconds", () => {
      // Create a large decision table with 100 rules and 20 columns (10 inputs + 10 outputs)
      const inputs = Array.from({ length: 10 }, (_, i) => DMN.inputClause(`Input ${i + 1}`, `in_${i}`));

      const outputs = Array.from({ length: 10 }, (_, i) => ({
        "@_id": `out_${i}`,
        "@_name": `Output ${i + 1}`,
      }));

      const rulesA = Array.from({ length: 100 }, (_, ruleIdx) => {
        const inputEntries = Array.from({ length: 10 }, (_, i) => `val_${ruleIdx}_${i}`);
        return DMN.rule(inputEntries, `rule_${ruleIdx}`, `result_${ruleIdx}`);
      });

      // Create modified version with changes to 20% of rules
      const rulesB = rulesA.map((rule, idx) => {
        if (idx % 5 === 0) {
          // Modify every 5th rule (20% of rules)
          const inputEntries = Array.from({ length: 10 }, (_, i) => `modified_${idx}_${i}`);
          return DMN.rule(inputEntries, rule["@_id"], `modified_result_${idx}`);
        }
        return rule;
      });

      const largeTableA = DMN.decisionTable(inputs, rulesA, "large_dt", outputs);
      const largeTableB = DMN.decisionTable(inputs, rulesB, "large_dt", outputs);

      const start = performance.now();
      const diff = diffBoxedExpression(largeTableA, largeTableB);
      const duration = performance.now() - start;

      expect(diff).toBeDefined();
      expect(diff?.kind).toBe("decisionTable");
      expect(duration).toBeLessThan(3000); // Must complete within 3 seconds
    });

    it("should diff large decision table with column changes within 3 seconds", () => {
      // Test performance when columns are modified (not just rules)
      const inputsA = Array.from({ length: 15 }, (_, i) => DMN.inputClause(`Input ${i + 1}`, `in_${i}`));

      const inputsB = inputsA.map((input, idx) => {
        if (idx % 3 === 0) {
          // Modify every 3rd input column
          const modified = structuredClone(input);
          modified.inputExpression!["@_typeRef"] = "number";
          return modified;
        }
        return input;
      });

      const rules = Array.from({ length: 80 }, (_, ruleIdx) => {
        const inputEntries = Array.from({ length: 15 }, (_, i) => `val_${ruleIdx}_${i}`);
        return DMN.rule(inputEntries, `rule_${ruleIdx}`);
      });

      const tableA = DMN.decisionTable(inputsA, rules, "dt_col_test");
      const tableB = DMN.decisionTable(inputsB, rules, "dt_col_test");

      const start = performance.now();
      const diff = diffBoxedExpression(tableA, tableB);
      const duration = performance.now() - start;

      expect(diff).toBeDefined();
      expect(duration).toBeLessThan(3000);
    });

    it("should diff deeply nested expressions within 3 seconds", () => {
      // Create a complex nested structure: Context with 50 entries, each containing a List with 5 items
      const createComplexContext = (suffix: string) => {
        const entries = Array.from({ length: 50 }, (_, i) =>
          DMN.contextEntry(
            `var_${i}`,
            DMN.list(
              Array.from({ length: 5 }, (_, j) => DMN.literal(`${suffix}_${i}_${j}`, `lit_${i}_${j}`)),
              `list_${i}`
            ),
            `entry_${i}`
          )
        );
        return DMN.context(entries, "complex_ctx");
      };

      const complexA = createComplexContext("original");
      const complexB = createComplexContext("modified");

      const start = performance.now();
      const diff = diffBoxedExpression(complexA, complexB);
      const duration = performance.now() - start;

      expect(diff).toBeDefined();
      expect(diff?.kind).toBe("context");
      expect(duration).toBeLessThan(3000);
    });

    it("should diff large relation (50 rows, 10 columns) within 3 seconds", () => {
      const columns = Array.from({ length: 10 }, (_, i) => DMN.relCol(`Col ${i + 1}`, `col_${i}`));

      const rowsA = Array.from({ length: 50 }, (_, rowIdx) => {
        const cells = Array.from({ length: 10 }, (_, colIdx) =>
          DMN.literal(`val_${rowIdx}_${colIdx}`, `cell_${rowIdx}_${colIdx}`)
        );
        return DMN.relRow(cells, `row_${rowIdx}`);
      });

      // Modify 25% of rows
      const rowsB = rowsA.map((row, idx) => {
        if (idx % 4 === 0) {
          const cells = Array.from({ length: 10 }, (_, colIdx) =>
            DMN.literal(`modified_${idx}_${colIdx}`, `cell_${idx}_${colIdx}`)
          );
          return DMN.relRow(cells, row["@_id"]);
        }
        return row;
      });

      const relationA = DMN.relation(columns, rowsA, "large_rel");
      const relationB = DMN.relation(columns, rowsB, "large_rel");

      const start = performance.now();
      const diff = diffBoxedExpression(relationA, relationB);
      const duration = performance.now() - start;

      expect(diff).toBeDefined();
      expect(diff?.kind).toBe("relation");
      expect(duration).toBeLessThan(3000);
    });

    it("should diff function with many parameters (50 params) within 3 seconds", () => {
      const paramsA = Array.from({ length: 50 }, (_, i) => DMN.param(`param_${i}`, "string", `p_${i}`));

      // Modify 20% of parameters
      const paramsB = paramsA.map((param, idx) => {
        if (idx % 5 === 0) {
          return DMN.param(param["@_name"]!, "number", param["@_id"]!);
        }
        return param;
      });

      const bodyExpr = DMN.literal("function body");
      const fnA = DMN.functionDef(paramsA, bodyExpr, "large_fn");
      const fnB = DMN.functionDef(paramsB, bodyExpr, "large_fn");

      const start = performance.now();
      const diff = diffBoxedExpression(fnA, fnB);
      const duration = performance.now() - start;

      expect(diff).toBeDefined();
      expect(diff?.kind).toBe("functionDefinition");
      expect(duration).toBeLessThan(3000);
    });

    it("should handle worst-case scenario: all rules modified in large table", () => {
      // Worst case: Every single rule is modified
      const inputs = Array.from({ length: 8 }, (_, i) => DMN.inputClause(`In ${i}`, `in_${i}`));

      const rulesA = Array.from({ length: 100 }, (_, ruleIdx) => {
        const inputEntries = Array.from({ length: 8 }, (_, i) => `original_${ruleIdx}_${i}`);
        return DMN.rule(inputEntries, `rule_${ruleIdx}`, `result_${ruleIdx}`);
      });

      const rulesB = Array.from({ length: 100 }, (_, ruleIdx) => {
        const inputEntries = Array.from({ length: 8 }, (_, i) => `modified_${ruleIdx}_${i}`);
        return DMN.rule(inputEntries, `rule_${ruleIdx}`, `new_result_${ruleIdx}`);
      });

      const tableA = DMN.decisionTable(inputs, rulesA, "worst_case_dt");
      const tableB = DMN.decisionTable(inputs, rulesB, "worst_case_dt");

      const start = performance.now();
      const diff = diffBoxedExpression(tableA, tableB);
      const duration = performance.now() - start;

      expect(diff).toBeDefined();
      const dtDiff = diff as DecisionTableDiff;
      expect(Object.keys(dtDiff.rules.modified).length).toBe(100);
      expect(duration).toBeLessThan(3000);
    });
  });
});
