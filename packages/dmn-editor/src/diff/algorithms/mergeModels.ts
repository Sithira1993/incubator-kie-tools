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

import { DmnLatestModel } from "@kie-tools/dmn-marshaller";
import { Normalized } from "@kie-tools/dmn-marshaller/dist/normalization/normalize";
import { DiffChangeType, DiffResult } from "../types";
import { parseXmlHref } from "@kie-tools/dmn-marshaller/dist/xml";

export function mergeModels(
  baseModel: Normalized<DmnLatestModel>,
  changedModel: Normalized<DmnLatestModel>,
  diffResult: DiffResult
): Normalized<DmnLatestModel> {
  // Deep copy changedModel to avoid mutating the original
  const mergedModel = JSON.parse(JSON.stringify(changedModel)) as Normalized<DmnLatestModel>;

  const baseDefinitions = baseModel.definitions;
  const mergedDefinitions = mergedModel.definitions;

  // 1. Inject Removed Nodes (Ghost Nodes)
  for (const nodeDiff of diffResult.nodes) {
    if (nodeDiff.changeType === DiffChangeType.REMOVED) {
      const parsed = parseXmlHref(nodeDiff.id);
      const nodeId = parsed.id;

      const baseNode = baseDefinitions.drgElement?.find((el) => el["@_id"] === nodeId);
      const baseArtifact = baseDefinitions.artifact?.find((el) => el["@_id"] === nodeId);

      // Inject Node
      if (baseNode) {
        mergedDefinitions.drgElement ??= [];
        mergedDefinitions.drgElement.push(JSON.parse(JSON.stringify(baseNode))); // Copy to avoid ref issues
      } else if (baseArtifact) {
        mergedDefinitions.artifact ??= [];
        mergedDefinitions.artifact.push(JSON.parse(JSON.stringify(baseArtifact)));
      }

      // Inject Shape
      const baseShape = baseDefinitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0]?.["dmndi:DMNDiagramElement"]?.find(
        (el) => el["@_dmnElementRef"] === nodeId
      );

      if (baseShape) {
        injectShape(mergedDefinitions, baseShape);
      }
    }
  }

  // 1.5. Inject Removed Edges (Ghost Edges)
  for (const edgeDiff of diffResult.edges) {
    if (edgeDiff.changeType === DiffChangeType.REMOVED) {
      const parsed = parseXmlHref(edgeDiff.id);
      const edgeId = parsed.id;

      // 1.5.1. Associations
      const baseAssociation = baseDefinitions.artifact?.find((el) => el["@_id"] === edgeId);
      if (baseAssociation?.__$$element === "association") {
        mergedDefinitions.artifact ??= [];
        mergedDefinitions.artifact.push(JSON.parse(JSON.stringify(baseAssociation)));
      }

      // 1.5.2. Requirements
      for (const baseDrgElement of baseDefinitions.drgElement ?? []) {
        const mergedDrgElement = mergedDefinitions.drgElement?.find((el) => el["@_id"] === baseDrgElement["@_id"]);
        if (!mergedDrgElement) {
          continue; // Should not happen if ghost nodes are injected correctly
        }

        // Information Requirement
        if (baseDrgElement.__$$element === "decision") {
          const infoReq = baseDrgElement.informationRequirement?.find((req) => req["@_id"] === edgeId);
          if (infoReq && mergedDrgElement.__$$element === "decision") {
            mergedDrgElement.informationRequirement ??= [];
            mergedDrgElement.informationRequirement.push(JSON.parse(JSON.stringify(infoReq)));
          }
        }

        // Knowledge Requirement
        if (baseDrgElement.__$$element === "decision" || baseDrgElement.__$$element === "businessKnowledgeModel") {
          const knowReq = baseDrgElement.knowledgeRequirement?.find((req) => req["@_id"] === edgeId);
          if (
            knowReq &&
            (mergedDrgElement.__$$element === "decision" || mergedDrgElement.__$$element === "businessKnowledgeModel")
          ) {
            mergedDrgElement.knowledgeRequirement ??= [];
            mergedDrgElement.knowledgeRequirement.push(JSON.parse(JSON.stringify(knowReq)));
          }
        }

        // Authority Requirement
        if (
          baseDrgElement.__$$element === "decision" ||
          baseDrgElement.__$$element === "businessKnowledgeModel" ||
          baseDrgElement.__$$element === "knowledgeSource"
        ) {
          const authReq = baseDrgElement.authorityRequirement?.find((req) => req["@_id"] === edgeId);
          if (
            authReq &&
            (mergedDrgElement.__$$element === "decision" ||
              mergedDrgElement.__$$element === "businessKnowledgeModel" ||
              mergedDrgElement.__$$element === "knowledgeSource")
          ) {
            mergedDrgElement.authorityRequirement ??= [];
            mergedDrgElement.authorityRequirement.push(JSON.parse(JSON.stringify(authReq)));
          }
        }
      }

      // 1.5.3. Inject DMNDI Edge
      const baseEdge = baseDefinitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0]?.["dmndi:DMNDiagramElement"]?.find(
        (el) => el["@_dmnElementRef"] === edgeId
      );

      if (baseEdge) {
        injectShape(mergedDefinitions, baseEdge);
      }
    }
  }

  return mergedModel;
}

function injectShape(definitions: Normalized<DmnLatestModel>["definitions"], shape: any) {
  definitions["dmndi:DMNDI"] ??= {};
  definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"] ??= [];
  if (definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"].length === 0) {
    definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"].push({});
  }
  const diagram = definitions["dmndi:DMNDI"]["dmndi:DMNDiagram"][0];
  diagram["dmndi:DMNDiagramElement"] ??= [];
  diagram["dmndi:DMNDiagramElement"].push(JSON.parse(JSON.stringify(shape)));
}
