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

/**
 * Type guard to check if an expression has a description property.
 */
export function hasDescription(expr: unknown): expr is { description?: { __$$text: string } } {
  return typeof expr === "object" && expr !== null && "description" in expr;
}

/**
 * Safely extracts the description text from an expression.
 * @param expr - The expression to extract description from
 * @returns The description text or undefined if not present
 */
export function getDescriptionText(expr: unknown): string | undefined {
  return hasDescription(expr) ? expr.description?.__$$text : undefined;
}
