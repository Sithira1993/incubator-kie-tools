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
 * Maximum file size allowed for DMN diff (5MB in bytes)
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Allowed file extension for DMN files
 */
export const ALLOWED_FILE_EXTENSION = ".dmn";

/**
 * Validation error messages
 */
export const VALIDATION_ERROR_MESSAGES = {
  INVALID_EXTENSION: `Only ${ALLOWED_FILE_EXTENSION} files are allowed`,
  FILE_TOO_LARGE: `File size must be less than ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
  MALFORMED_XML: "File contains malformed XML",
  INVALID_DMN: "File is not a valid DMN model",
  PARSING_ERROR: "Failed to parse DMN file",
} as const;

/**
 * Decision Table Diff Constants
 */

/**
 * Default width for the row number column in Decision Tables.
 * Used when no width is specified in the model.
 */
export const DEFAULT_ROW_NUMBER_WIDTH = 50;

/**
 * Default width for data columns (input/output/annotation) in Decision Tables.
 * Used when no width is specified in the model.
 */
export const DEFAULT_COLUMN_WIDTH = 150;

/**
 * Minimum length for UUID-based class names (heuristic: >10 chars, starts with '_').
 * Update this if BoxedExpressionComponent naming changes.
 */
export const MIN_UUID_CLASS_LENGTH = 10;

/**
 * Throttle interval (ms) for mousemove events (~60fps).
 */
export const MOUSEMOVE_THROTTLE_MS = 16;

/**
 * Default cell value for removed input columns when original value is unavailable.
 * The dash "-" indicates "any value" in DMN FEEL syntax.
 */
export const DEFAULT_REMOVED_INPUT_CELL_VALUE = "-";

/**
 * Default cell value for removed output/annotation columns when original value is unavailable.
 */
export const DEFAULT_REMOVED_OUTPUT_CELL_VALUE = "";
