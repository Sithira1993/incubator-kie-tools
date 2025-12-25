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
 * Throttles a function to execute at most once per interval.
 * Useful for performance optimization of high-frequency events like mousemove.
 *
 * @param func - The function to throttle
 * @param limit - Minimum time (ms) between function executions
 * @returns Throttled version of the function
 */
export function throttle<T extends (...args: unknown[]) => void>(func: T, limit: number): T {
  let inThrottle: boolean;
  return ((...args: unknown[]) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
}

/**
 * Robust ID sanitization for CSS classes.
 * Fallback to a simple replacement if CSS.escape fails (very rare).
 *
 * @param id - The ID string to sanitize
 * @returns CSS-safe string that can be used in selectors
 */
export function sanitizeForCSS(id: string): string {
  try {
    return CSS.escape(id);
  } catch (error) {
    // Fallback: replace invalid chars with a safe sequence
    return id.replace(/[^a-zA-Z0-9_-]/g, (match) => `_${match.charCodeAt(0).toString(16)}_`);
  }
}
