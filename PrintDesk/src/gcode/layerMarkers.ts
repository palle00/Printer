export type LayerMarkerMode =
  | "numbered"
  | "layer-change"
  | "z-comment"
  | "none";

const NUMBERED_LAYER_PATTERN =
  /^\s*;\s*LAYER:\s*(-?\d+)/i;
const LAYER_CHANGE_PATTERN =
  /^\s*;\s*LAYER_CHANGE\b/i;
const Z_COMMENT_PATTERN =
  /^\s*;\s*Z:\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)/i;

export function detectLayerMarkerMode(
  lines: readonly string[],
): LayerMarkerMode {
  let hasLayerChange = false;
  let hasZComment = false;

  for (const line of lines) {
    if (NUMBERED_LAYER_PATTERN.test(line)) {
      return "numbered";
    }

    hasLayerChange ||= LAYER_CHANGE_PATTERN.test(line);
    hasZComment ||= Z_COMMENT_PATTERN.test(line);
  }

  if (hasLayerChange) {
    return "layer-change";
  }

  return hasZComment ? "z-comment" : "none";
}

export function getNumberedLayer(
  line: string,
): number | null {
  const match = line.match(NUMBERED_LAYER_PATTERN);
  return match ? Number(match[1]) + 1 : null;
}

export function isLayerChangeMarker(line: string): boolean {
  return LAYER_CHANGE_PATTERN.test(line);
}

export function isZCommentMarker(line: string): boolean {
  return Z_COMMENT_PATTERN.test(line);
}
