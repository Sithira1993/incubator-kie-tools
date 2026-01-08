import { DiffChangeType } from "../types";

export const DIFF_ADDED_COLOR = "rgba(79, 150, 110, 1)"; // Green
export const DIFF_REMOVED_COLOR = "rgba(201, 25, 11, 1)"; // Red
export const DIFF_MODIFIED_COLOR = "rgba(240, 171, 0, 1)"; // Yellow (Gold)
export const DIFF_UNCHANGED_OPACITY = 0.3;

/**
 * Decision Table Overlay Colors
 * These colors are used for cell/column/row highlighting in the Decision Table diff overlay.
 * They use lighter backgrounds with opacity for better readability.
 */
export const OVERLAY_ADDED_BG = "rgba(76, 175, 80, 0.2)"; // Light green background
export const OVERLAY_ADDED_BORDER = "#4CAF50"; // Green border
export const OVERLAY_REMOVED_BG = "rgba(255, 0, 0, 0.2)"; // Light red background
export const OVERLAY_REMOVED_BORDER = "#FF5252"; // Red border
export const OVERLAY_REMOVED_TEXT = "#B71C1C"; // Dark red text
export const OVERLAY_REMOVED_OPACITY = "0.8";
export const OVERLAY_MODIFIED_BG = "rgba(255, 235, 59, 0.3)"; // Light yellow background
export const OVERLAY_MODIFIED_BORDER = "#FFC107"; // Orange border
export const OVERLAY_MODIFIED_TEXT = "#F57C00"; // Orange text

export const getDiffStyle = (changeType?: DiffChangeType) => {
  switch (changeType) {
    case DiffChangeType.ADDED:
      return { strokeColor: DIFF_ADDED_COLOR, strokeWidth: 3 };
    case DiffChangeType.REMOVED:
      return { strokeColor: DIFF_REMOVED_COLOR, strokeWidth: 3, strokeDasharray: "4 4" };
    case DiffChangeType.MODIFIED:
      return { strokeColor: DIFF_MODIFIED_COLOR, strokeWidth: 3 };
    default:
      return {};
  }
};
