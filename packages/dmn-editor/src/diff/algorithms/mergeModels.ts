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
  DmnLatestModel,
  DMN_LATEST__DMNShape,
  DMN_LATEST__DMNEdge,
  DMN_LATEST__tInformationRequirement,
  DMN_LATEST__tKnowledgeRequirement,
  DMN_LATEST__tAuthorityRequirement,
} from "@kie-tools/dmn-marshaller";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { DiffChangeType, DiffResult } from "../types";
import { parseXmlHref } from "@kie-tools/dmn-marshaller/dist/xml";

interface WithRequirements {
  informationRequirement?: Normalized<DMN_LATEST__tInformationRequirement>[];
  knowledgeRequirement?: Normalized<DMN_LATEST__tKnowledgeRequirement>[];
  authorityRequirement?: Normalized<DMN_LATEST__tAuthorityRequirement>[];
}

export function mergeModels(
  baseModel: Normalized<DmnLatestModel>,
  changedModel: Normalized<DmnLatestModel>,
  diffResult: DiffResult
): Normalized<DmnLatestModel> {
  const mergedModel = structuredClone(changedModel) as Normalized<DmnLatestModel>;

  const baseDefinitions = baseModel.definitions;
  const mergedDefinitions = mergedModel.definitions;

  // Index base model elements for faster lookup
  const baseDrgElements = new Map(baseDefinitions.drgElement?.map((el) => [el["@_id"], el]));
  const baseArtifacts = new Map(baseDefinitions.artifact?.map((el) => [el["@_id"], el]));
  const baseShapes = new Map(
    baseDefinitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0]?.["dmndi:DMNDiagramElement"]?.map((el) => [
      el["@_dmnElementRef"],
      el,
    ])
  );

  // Inject Removed Nodes
  for (const nodeDiff of diffResult.nodes) {
    if (nodeDiff.changeType === DiffChangeType.REMOVED) {
      const parsed = parseXmlHref(nodeDiff.id);
      const nodeId = parsed.id;

      const baseNode = baseDrgElements.get(nodeId);
      const baseArtifact = baseArtifacts.get(nodeId);

      // Inject Node
      if (baseNode) {
        mergedDefinitions.drgElement ??= [];
        mergedDefinitions.drgElement.push(structuredClone(baseNode));
      } else if (baseArtifact) {
        mergedDefinitions.artifact ??= [];
        mergedDefinitions.artifact.push(structuredClone(baseArtifact));
      }

      const baseShape = baseShapes.get(nodeId);

      if (baseShape) {
        injectShape(mergedDefinitions, baseShape as Normalized<DMN_LATEST__DMNShape>);
      }
    }
  }

  // Inject Removed Edges
  for (const edgeDiff of diffResult.edges) {
    if (edgeDiff.changeType === DiffChangeType.REMOVED) {
      const parsed = parseXmlHref(edgeDiff.id);
      const edgeId = parsed.id;

      const baseAssociation = baseArtifacts.get(edgeId);
      if (baseAssociation?.__$$element === "association") {
        mergedDefinitions.artifact ??= [];
        mergedDefinitions.artifact.push(structuredClone(baseAssociation));
      }

      if (edgeDiff.target) {
        const targetId = parseXmlHref(edgeDiff.target).id;
        if (targetId) {
          const baseDrgElement = baseDrgElements.get(targetId);
          const mergedDrgElement = mergedDefinitions.drgElement?.find((el) => el["@_id"] === targetId);

          if (baseDrgElement && mergedDrgElement) {
            injectRequirement(baseDrgElement, mergedDrgElement, "informationRequirement", edgeId);
            injectRequirement(baseDrgElement, mergedDrgElement, "knowledgeRequirement", edgeId);
            injectRequirement(baseDrgElement, mergedDrgElement, "authorityRequirement", edgeId);
          }
        }
      }

      const baseEdge = baseShapes.get(edgeId);

      if (baseEdge) {
        injectShape(mergedDefinitions, baseEdge as Normalized<DMN_LATEST__DMNEdge>);
      }
    }
  }

  return mergedModel;
}

function injectRequirement<K extends keyof WithRequirements>(
  baseDrgElement: unknown,
  mergedDrgElement: unknown,
  reqProp: K,
  edgeId: string
) {
  const baseElementTyped = baseDrgElement as WithRequirements;
  const baseReqs = baseElementTyped[reqProp];

  if (Array.isArray(baseReqs)) {
    // Inferred type of req matching K
    const reqToInject = baseReqs.find((req) => req["@_id"] === edgeId);
    if (reqToInject) {
      const mergedElementTyped = mergedDrgElement as WithRequirements;
      if (!mergedElementTyped[reqProp]) {
        // Safe cast to initialize array of specific type
        mergedElementTyped[reqProp] = [] as WithRequirements[K];
      }

      const exists = (mergedElementTyped[reqProp] as any[]).some((req) => req["@_id"] === edgeId);
      if (!exists) {
        // Cast to any because K is a union and TS can't verify exact match between source and destination arrays
        mergedElementTyped[reqProp]!.push(structuredClone(reqToInject) as any);
      }
    }
  }
}

function injectShape(
  definitions: Normalized<DmnLatestModel>["definitions"],
  shape: Normalized<DMN_LATEST__DMNShape | DMN_LATEST__DMNEdge>
) {
  definitions["dmndi:DMNDI"] ??= {};
  definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"] ??= [];
  if (definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"].length === 0) {
    definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"].push({});
  }
  const diagram = definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"][0];
  diagram["dmndi:DMNDiagramElement"] ??= [];
  diagram["dmndi:DMNDiagramElement"].push(structuredClone(shape) as any);
}
