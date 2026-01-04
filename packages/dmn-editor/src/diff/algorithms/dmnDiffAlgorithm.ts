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

import {
  DMN_LATEST__DMNShape,
  DmnLatestModel,
  DMN_LATEST__tInformationRequirement,
  DMN_LATEST__tKnowledgeRequirement,
  DMN_LATEST__tAuthorityRequirement,
  DMN_LATEST__tDecision,
  DMN_LATEST__tBusinessKnowledgeModel,
} from "@kie-tools/dmn-marshaller";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { buildXmlHref, parseXmlHref } from "@kie-tools/dmn-marshaller/dist/xml";
import { parseXmlQName } from "@kie-tools/xml-parser-ts/dist/qNames";
import { BoxedExpression } from "@kie-tools/boxed-expression-component/dist/api";

import { DiffChangeType, DiffPropertyChange, DiffResult, EdgeDiff, NodeDiff, NodePosition, NodeSize } from "../types";
import { diffBoxedExpression } from "./diffBoxedExpression";

// Re-export for compatibility
export { diffBoxedExpression } from "./diffBoxedExpression";

type DmnDefinitions = Normalized<DmnLatestModel>["definitions"];
type DrgElement = NonNullable<DmnDefinitions["drgElement"]>[number];
type ArtifactElement = NonNullable<DmnDefinitions["artifact"]>[number];
type ShapeElement = Normalized<DMN_LATEST__DMNShape>;
type DMNRequirement = Normalized<
  DMN_LATEST__tInformationRequirement | DMN_LATEST__tKnowledgeRequirement | DMN_LATEST__tAuthorityRequirement
>;

interface NodeSnapshot {
  id: string;
  rawId: string;
  elementType: string;
  elementName?: string;
  position?: NodePosition;
  size?: NodeSize;
  expression?: Normalized<BoxedExpression>;
}

interface EdgeSnapshot {
  id: string;
  rawId: string;
  edgeType: string;
  referenceKind?: string;
  source?: string;
  target?: string;
}

const POSITION_TOLERANCE_PX = 1;
const SIZE_TOLERANCE_PX = 1;

export function computeDmnDiff(modelA: Normalized<DmnLatestModel>, modelB: Normalized<DmnLatestModel>): DiffResult {
  const definitionsA = modelA?.definitions;
  const definitionsB = modelB?.definitions;

  if (!definitionsA || !definitionsB) {
    return { nodes: [], edges: [], hasChanges: false };
  }

  const nodeMapA = buildNodeSnapshots(definitionsA);
  const nodeMapB = buildNodeSnapshots(definitionsB);

  const edgeMapA = buildEdgeSnapshots(definitionsA);
  const edgeMapB = buildEdgeSnapshots(definitionsB);

  const nodeDiffs = diffNodes(nodeMapA, nodeMapB);
  const edgeDiffs = diffEdges(edgeMapA, edgeMapB);

  return {
    nodes: nodeDiffs,
    edges: edgeDiffs,
    hasChanges: nodeDiffs.length > 0 || edgeDiffs.length > 0,
  };
}

type DecisionWithExpressions = Normalized<DMN_LATEST__tDecision> & {
  expression?: Normalized<BoxedExpression>;
  literalExpression?: Normalized<BoxedExpression>;
  decisionTable?: Normalized<BoxedExpression>;
  relation?: Normalized<BoxedExpression>;
  list?: Normalized<BoxedExpression>;
  context?: Normalized<BoxedExpression>;
  invocation?: Normalized<BoxedExpression>;
  functionDefinition?: Normalized<BoxedExpression>;
  conditional?: Normalized<BoxedExpression>;
  filter?: Normalized<BoxedExpression>;
  every?: Normalized<BoxedExpression>;
  some?: Normalized<BoxedExpression>;
  for?: Normalized<BoxedExpression>;
};

/**
 * Retrieves the boxed expression from a DRG element or artifact.
 *
 * According to the DMN specification, a Decision element can have exactly ONE expression child element.
 * The canonical property is `expression`, but for backward compatibility with older DMN versions
 * and different serialization formats, this function checks legacy property names as fallbacks.
 *
 * Priority chain (first non-null value is returned):
 * 1. `expression` - Canonical/normalized property (DMN 1.2+)
 * 2. `literalExpression` - Legacy property name
 * 3. `decisionTable` - Legacy property name
 * 4. `relation` - Legacy property name
 * 5. `list` - Legacy property name
 * 6. `context` - Legacy property name
 * 7. `invocation` - Legacy property name
 * 8. `functionDefinition` - Legacy property name
 * 9. `conditional` - Legacy property name (DMN 1.3+)
 * 10. `filter` - Legacy property name (DMN 1.3+)
 * 11. `every` - Legacy property name (DMN 1.3+)
 * 12. `some` - Legacy property name (DMN 1.3+)
 * 13. `for` - Legacy property name (DMN 1.3+)
 *
 * @param element - The DRG element or artifact to extract the expression from
 * @returns The boxed expression if found, undefined otherwise
 */
function getElementExpression(
  element: DrgElement | ArtifactElement | null | undefined
): Normalized<BoxedExpression> | undefined {
  if (!element) {
    return undefined;
  }
  if (element.__$$element === "decision") {
    const decision = element as unknown as DecisionWithExpressions;
    return (
      decision.expression ??
      decision.literalExpression ??
      decision.decisionTable ??
      decision.relation ??
      decision.list ??
      decision.context ??
      decision.invocation ??
      decision.functionDefinition ??
      decision.conditional ??
      decision.filter ??
      decision.every ??
      decision.some ??
      decision.for
    );
  } else if (element.__$$element === "businessKnowledgeModel") {
    const bkm = element as Normalized<DMN_LATEST__tBusinessKnowledgeModel>;
    if (bkm.encapsulatedLogic) {
      return {
        __$$element: "functionDefinition",
        ...bkm.encapsulatedLogic,
      } as Normalized<BoxedExpression>;
    }
    return undefined;
  }
  // Decision Services, Input Data, Knowledge Sources, and other DRG elements do not support boxed expressions.
  return undefined;
}

function buildNodeSnapshots(definitions: DmnDefinitions): Map<string, NodeSnapshot> {
  const nodes = new Map<string, NodeSnapshot>();
  const namespace = definitions["@_namespace"];
  const shapesByHref = indexShapes(definitions);

  const recordNode = (element: DrgElement | ArtifactElement | null | undefined) => {
    if (!element?.["@_id"]) {
      return;
    }
    const id = buildElementHref(element["@_id"], namespace);
    if (!id) {
      return;
    }

    const shape = shapesByHref.get(id);
    nodes.set(id, {
      id,
      rawId: element["@_id"],
      elementType: element.__$$element ?? "unknown",
      elementName: getStringAttribute(element, "@_name"),
      position: extractPosition(shape),
      size: extractSize(shape),
      expression: getElementExpression(element),
    });
  };

  for (const element of definitions.drgElement ?? []) {
    recordNode(element);
  }
  for (const artifact of definitions.artifact ?? []) {
    if (artifact.__$$element === "association") {
      continue;
    }
    recordNode(artifact);
  }

  return nodes;
}

function buildEdgeSnapshots(definitions: DmnDefinitions): Map<string, EdgeSnapshot> {
  const edges = new Map<string, EdgeSnapshot>();
  const namespace = definitions["@_namespace"];

  for (const element of definitions.drgElement ?? []) {
    const target = buildElementHref(element?.["@_id"], namespace);
    if (!target) {
      continue;
    }

    collectRequirementEdges(element, namespace, target, edges);
  }

  for (const artifact of definitions.artifact ?? []) {
    if (artifact.__$$element !== "association") {
      continue;
    }

    const source = resolveHref(artifact.sourceRef?.["@_href"], namespace);
    const target = resolveHref(artifact.targetRef?.["@_href"], namespace);
    if (!source || !target) {
      continue;
    }

    const rawId = artifact["@_id"] ?? `${source}->${target}`;
    const id = buildElementHref(rawId, namespace);
    if (!id) {
      continue;
    }

    edges.set(id, {
      id,
      rawId,
      edgeType: "association",
      source,
      target,
    });
  }

  return edges;
}

function collectRequirementEdges(
  element: DrgElement,
  namespace: string | undefined,
  targetHref: string,
  accumulator: Map<string, EdgeSnapshot>
) {
  const requirementExtractors: Array<{
    kind: string;
    collection: Array<DMNRequirement> | undefined;
    resolver: (requirement: DMNRequirement) => { href?: string; referenceKind?: string };
  }> = [
    {
      kind: "informationRequirement",
      collection: getArrayProperty(element, "informationRequirement"),
      resolver: (requirement: Normalized<DMN_LATEST__tInformationRequirement>) => {
        if (requirement.requiredInput?.["@_href"]) {
          return { href: requirement.requiredInput["@_href"], referenceKind: "requiredInput" };
        }
        if (requirement.requiredDecision?.["@_href"]) {
          return { href: requirement.requiredDecision["@_href"], referenceKind: "requiredDecision" };
        }
        return {};
      },
    },
    {
      kind: "knowledgeRequirement",
      collection: getArrayProperty(element, "knowledgeRequirement"),
      resolver: (requirement: Normalized<DMN_LATEST__tKnowledgeRequirement>) => ({
        href: requirement.requiredKnowledge?.["@_href"],
        referenceKind: "requiredKnowledge",
      }),
    },
    {
      kind: "authorityRequirement",
      collection: getArrayProperty(element, "authorityRequirement"),
      resolver: (requirement: Normalized<DMN_LATEST__tAuthorityRequirement>) => {
        if (requirement.requiredDecision?.["@_href"]) {
          return { href: requirement.requiredDecision["@_href"], referenceKind: "requiredDecision" };
        }
        if (requirement.requiredInput?.["@_href"]) {
          return { href: requirement.requiredInput["@_href"], referenceKind: "requiredInput" };
        }
        if (requirement.requiredAuthority?.["@_href"]) {
          return { href: requirement.requiredAuthority["@_href"], referenceKind: "requiredAuthority" };
        }
        return {};
      },
    },
  ];

  for (const extractor of requirementExtractors) {
    const collection = extractor.collection ?? [];
    for (let index = 0; index < collection.length; index++) {
      const requirement = collection[index];
      const { href, referenceKind } = extractor.resolver(requirement);
      const source = resolveHref(href, namespace);
      if (!source) {
        continue;
      }

      const rawId = requirement?.["@_id"] ?? `${element["@_id"] ?? "element"}::${extractor.kind}::${index}`;
      const id = buildElementHref(rawId, namespace);
      if (!id) {
        continue;
      }

      accumulator.set(id, {
        id,
        rawId,
        edgeType: extractor.kind,
        referenceKind,
        source,
        target: targetHref,
      });
    }
  }
}

function diffNodes(mapA: Map<string, NodeSnapshot>, mapB: Map<string, NodeSnapshot>): NodeDiff[] {
  const diffs: NodeDiff[] = [];
  const ids = new Set<string>([...mapA.keys(), ...mapB.keys()]);

  for (const id of ids) {
    const nodeA = mapA.get(id);
    const nodeB = mapB.get(id);

    if (nodeA && !nodeB) {
      diffs.push({
        kind: "node",
        id,
        elementType: nodeA.elementType,
        elementName: nodeA.elementName,
        changeType: DiffChangeType.REMOVED,
        position: nodeA.position,
        size: nodeA.size,
      });
      continue;
    }

    if (!nodeA && nodeB) {
      diffs.push({
        kind: "node",
        id,
        elementType: nodeB.elementType,
        elementName: nodeB.elementName,
        changeType: DiffChangeType.ADDED,
        position: nodeB.position,
        size: nodeB.size,
      });
      continue;
    }

    if (nodeA && nodeB) {
      const changes = collectNodePropertyChanges(nodeA, nodeB);
      const expressionDiff = diffBoxedExpression(nodeA.expression, nodeB.expression);

      if (changes.length > 0 || expressionDiff) {
        diffs.push({
          kind: "node",
          id,
          elementType: nodeB.elementType,
          elementName: nodeB.elementName ?? nodeA.elementName,
          changeType: DiffChangeType.MODIFIED,
          changedProperties: changes,
          position: nodeB.position,
          size: nodeB.size,
          boxedExpressionDiff: expressionDiff,
        });
      }
    }
  }

  return diffs.sort((a, b) => a.id.localeCompare(b.id));
}

function diffEdges(mapA: Map<string, EdgeSnapshot>, mapB: Map<string, EdgeSnapshot>): EdgeDiff[] {
  const diffs: EdgeDiff[] = [];
  const ids = new Set<string>([...mapA.keys(), ...mapB.keys()]);

  for (const id of ids) {
    const edgeA = mapA.get(id);
    const edgeB = mapB.get(id);

    if (edgeA && !edgeB) {
      diffs.push({
        kind: "edge",
        id,
        elementType: edgeA.edgeType,
        elementName: edgeA.rawId,
        changeType: DiffChangeType.REMOVED,
        source: edgeA.source,
        target: edgeA.target,
        referenceKind: edgeA.referenceKind,
      });
      continue;
    }

    if (!edgeA && edgeB) {
      diffs.push({
        kind: "edge",
        id,
        elementType: edgeB.edgeType,
        elementName: edgeB.rawId,
        changeType: DiffChangeType.ADDED,
        source: edgeB.source,
        target: edgeB.target,
        referenceKind: edgeB.referenceKind,
      });
      continue;
    }

    if (edgeA && edgeB) {
      const changes = collectEdgePropertyChanges(edgeA, edgeB);
      if (changes.length > 0) {
        diffs.push({
          kind: "edge",
          id,
          elementType: edgeB.edgeType,
          elementName: edgeB.rawId,
          changeType: DiffChangeType.MODIFIED,
          source: edgeB.source,
          target: edgeB.target,
          referenceKind: edgeB.referenceKind,
          changedProperties: changes,
        });
      }
    }
  }

  return diffs.sort((a, b) => a.id.localeCompare(b.id));
}

function collectNodePropertyChanges(nodeA: NodeSnapshot, nodeB: NodeSnapshot): DiffPropertyChange[] {
  const changes: DiffPropertyChange[] = [];

  if ((nodeA.elementName ?? "") !== (nodeB.elementName ?? "")) {
    changes.push({
      property: "name",
      previousValue: nodeA.elementName,
      currentValue: nodeB.elementName,
    });
  }

  if ((nodeA.elementType ?? "") !== (nodeB.elementType ?? "")) {
    changes.push({
      property: "type",
      previousValue: nodeA.elementType,
      currentValue: nodeB.elementType,
    });
  }

  compareNumericProperty("position.x", nodeA.position?.x, nodeB.position?.x, POSITION_TOLERANCE_PX, changes);
  compareNumericProperty("position.y", nodeA.position?.y, nodeB.position?.y, POSITION_TOLERANCE_PX, changes);
  compareNumericProperty("size.width", nodeA.size?.width, nodeB.size?.width, SIZE_TOLERANCE_PX, changes);
  compareNumericProperty("size.height", nodeA.size?.height, nodeB.size?.height, SIZE_TOLERANCE_PX, changes);

  return changes;
}

function collectEdgePropertyChanges(edgeA: EdgeSnapshot, edgeB: EdgeSnapshot): DiffPropertyChange[] {
  const changes: DiffPropertyChange[] = [];

  if ((edgeA.source ?? "") !== (edgeB.source ?? "")) {
    changes.push({ property: "source", previousValue: edgeA.source, currentValue: edgeB.source });
  }

  if ((edgeA.target ?? "") !== (edgeB.target ?? "")) {
    changes.push({ property: "target", previousValue: edgeA.target, currentValue: edgeB.target });
  }

  if ((edgeA.edgeType ?? "") !== (edgeB.edgeType ?? "")) {
    changes.push({
      property: "type",
      previousValue: edgeA.edgeType,
      currentValue: edgeB.edgeType,
    });
  }

  if ((edgeA.referenceKind ?? "") !== (edgeB.referenceKind ?? "")) {
    changes.push({
      property: "referenceKind",
      previousValue: edgeA.referenceKind,
      currentValue: edgeB.referenceKind,
    });
  }

  return changes;
}

function compareNumericProperty(
  property: string,
  previousValue: number | undefined,
  currentValue: number | undefined,
  tolerance: number,
  collector: DiffPropertyChange[]
) {
  if (!numbersAreEqual(previousValue, currentValue, tolerance)) {
    collector.push({ property, previousValue, currentValue });
  }
}

function numbersAreEqual(previousValue: number | undefined, currentValue: number | undefined, tolerance: number) {
  if (previousValue === undefined && currentValue === undefined) {
    return true;
  }

  if (previousValue === undefined || currentValue === undefined) {
    return false;
  }

  return Math.abs(previousValue - currentValue) <= tolerance;
}

function indexShapes(definitions: DmnDefinitions): Map<string, ShapeElement> {
  const shapes = new Map<string, ShapeElement>();
  const diagrams = definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"] ?? [];

  for (const diagram of diagrams) {
    const elements = diagram?.["dmndi:DMNDiagramElement"] ?? [];
    for (const element of elements) {
      if (element?.__$$element !== "dmndi:DMNShape") {
        continue;
      }

      const href = resolveShapeHref(element["@_dmnElementRef"], definitions);
      if (!href) {
        continue;
      }

      shapes.set(href, element as ShapeElement);
    }
  }

  return shapes;
}

function resolveShapeHref(reference: string | undefined, definitions: DmnDefinitions) {
  if (!reference) {
    return undefined;
  }

  const qName = parseXmlQName(reference);
  const namespace = qName.prefix ? definitions[`@_xmlns:${qName.prefix}`] : definitions["@_namespace"];
  return buildElementHref(qName.localPart, namespace);
}

function extractPosition(shape?: ShapeElement): NodePosition | undefined {
  const bounds = shape?.["dc:Bounds"];
  if (typeof bounds?.["@_x"] !== "number" || typeof bounds?.["@_y"] !== "number") {
    return undefined;
  }

  return {
    x: bounds["@_x"],
    y: bounds["@_y"],
  };
}

function extractSize(shape?: ShapeElement): NodeSize | undefined {
  const bounds = shape?.["dc:Bounds"];
  if (typeof bounds?.["@_width"] !== "number" || typeof bounds?.["@_height"] !== "number") {
    return undefined;
  }

  return {
    width: bounds["@_width"],
    height: bounds["@_height"],
  };
}

function toArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
}

function buildElementHref(id: string | undefined, namespace: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  return buildXmlHref({ namespace, id });
}

function resolveHref(href: string | undefined, fallbackNamespace: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  const sanitizedHref = href.includes("#") ? href : `#${href}`;
  const { namespace, id } = parseXmlHref(sanitizedHref);
  if (!id) {
    return undefined;
  }

  return buildXmlHref({ namespace: namespace ?? fallbackNamespace, id });
}

function getStringAttribute(element: unknown, attribute: string): string | undefined {
  if (!element || typeof element !== "object") {
    return undefined;
  }

  const value = (element as Record<string, unknown>)[attribute];
  return typeof value === "string" ? value : undefined;
}

function getArrayProperty<T>(element: unknown, key: string): T[] | undefined {
  if (!element || typeof element !== "object") {
    return undefined;
  }

  const value = (element as Record<string, unknown>)[key];
  return toArray(value as T | T[] | undefined);
}
