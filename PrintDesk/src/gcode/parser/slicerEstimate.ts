import {
  extractSlicerTimeMetadata,
} from "../timeEstimation";
import type {
  SlicerEstimateState,
} from "./parserTypes";

export function updateSlicerEstimate(
  state: SlicerEstimateState,
  rawLine: string,
): void {
  const metadata =
    extractSlicerTimeMetadata(
      rawLine,
    );

  if (!metadata) {
    return;
  }

  if (metadata.kind === "total") {
    if (
      !state.total ||
      metadata.priority >
        state.total.priority
    ) {
      state.total = metadata;
    }
  } else if (
    metadata.kind === "elapsed"
  ) {
    state.elapsedSeconds =
      metadata.seconds;
  } else {
    state.remainingSeconds =
      metadata.seconds;
  }
}

export function getPreferredSlicerSeconds(
  state: SlicerEstimateState,
): number | null {
  if (state.total) {
    return state.total.seconds;
  }

  if (
    state.elapsedSeconds !== null &&
    state.remainingSeconds !== null
  ) {
    return (
      state.elapsedSeconds +
      state.remainingSeconds
    );
  }

  return null;
}
