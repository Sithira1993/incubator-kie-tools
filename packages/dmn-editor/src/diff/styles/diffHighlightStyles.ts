import { DiffChangeType } from "../types";

export const DIFF_ADDED_COLOR = "rgba(79, 150, 110, 1)"; // Green
export const DIFF_REMOVED_COLOR = "rgba(201, 25, 11, 1)"; // Red
export const DIFF_MODIFIED_COLOR = "rgba(240, 171, 0, 1)"; // Yellow (Gold)
export const DIFF_UNCHANGED_OPACITY = 0.3;

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
