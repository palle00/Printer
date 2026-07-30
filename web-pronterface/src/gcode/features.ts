export const GCODE_FEATURES = [
  {
    id: "outer-wall",
    name: "Outer walls",
    color: "#ef4444",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "inner-wall",
    name: "Inner walls",
    color: "#f97316",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "infill",
    name: "Infill",
    color: "#eab308",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "solid-infill",
    name: "Solid infill",
    color: "#84cc16",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "top-surface",
    name: "Top surfaces",
    color: "#22c55e",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "bottom-surface",
    name: "Bottom surfaces",
    color: "#14b8a6",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "support",
    name: "Supports",
    color: "#06b6d4",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "support-interface",
    name: "Support interfaces",
    color: "#3b82f6",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "skirt",
    name: "Skirts",
    color: "#8b5cf6",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "brim",
    name: "Brims",
    color: "#d946ef",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "raft",
    name: "Rafts",
    color: "#ec4899",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "bridge",
    name: "Bridges",
    color: "#f59e0b",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "ironing",
    name: "Ironing",
    color: "#a3e635",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "custom",
    name: "Custom paths",
    color: "#c084fc",
    defaultVisible: true,
    extrusion: true,
  },
  {
    id: "travel",
    name: "Travel",
    color: "#64748b",
    defaultVisible: false,
    extrusion: false,
  },
  {
    id: "unknown",
    name: "Unknown extrusion",
    color: "#e5e7eb",
    defaultVisible: true,
    extrusion: true,
  },
] as const;

export const PRINTED_PATH_COLOR =
  "#00ff7f";

export type GcodeFeatureCategory =
  (typeof GCODE_FEATURES)[number]["id"];

export const GCODE_FEATURE_COUNT =
  GCODE_FEATURES.length;

const featureIndexById = new Map<
  GcodeFeatureCategory,
  number
>(
  GCODE_FEATURES.map(
    (feature, index) => [
      feature.id,
      index,
    ],
  ),
);

export function getFeatureIndex(
  category: GcodeFeatureCategory,
): number {
  return featureIndexById.get(category) ?? 0;
}

export function getFeatureCategory(
  index: number,
): GcodeFeatureCategory {
  return (
    GCODE_FEATURES[index]?.id ??
    "unknown"
  );
}

function normalizeFeatureLabel(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function detectFeatureCategory(
  rawLine: string,
): GcodeFeatureCategory | null {
  const match = rawLine.match(
    /^\s*;\s*(?:(?:type|feature|line[_ ]?type)\s*:|extrusion\s+role\s*:)\s*(.+?)\s*$/i,
  );

  if (!match) {
    return null;
  }

  const label =
    normalizeFeatureLabel(match[1]);

  if (
    label.includes("support interface") ||
    label.includes("support material interface") ||
    label.includes("support roof") ||
    label.includes("support floor")
  ) {
    return "support-interface";
  }

  if (
    label.includes("external perimeter") ||
    label.includes("outer wall") ||
    label.includes("wall outer")
  ) {
    return "outer-wall";
  }

  if (
    label === "perimeter" ||
    label.includes("inner wall") ||
    label.includes("wall inner") ||
    label.includes("internal perimeter")
  ) {
    return "inner-wall";
  }

  if (
    label.includes("top surface") ||
    label.includes("top solid infill") ||
    label === "skin"
  ) {
    return "top-surface";
  }

  if (
    label.includes("bottom surface") ||
    label.includes("bottom solid infill")
  ) {
    return "bottom-surface";
  }

  if (
    label.includes("bridge") ||
    label.includes("overhang wall")
  ) {
    return "bridge";
  }

  if (label.includes("ironing")) {
    return "ironing";
  }

  if (
    label.includes("solid infill") ||
    label.includes("internal solid") ||
    label.includes("gap fill")
  ) {
    return "solid-infill";
  }

  if (
    label.includes("infill") ||
    label === "fill"
  ) {
    return "infill";
  }

  if (label.includes("support")) {
    return "support";
  }

  if (label.includes("skirt")) {
    return "skirt";
  }

  if (label.includes("brim")) {
    return "brim";
  }

  if (label.includes("raft")) {
    return "raft";
  }

  if (
    label.includes("travel") ||
    label.includes("move")
  ) {
    return "travel";
  }

  if (
    label.includes("custom") ||
    label.includes("prime tower") ||
    label.includes("wipe tower") ||
    label.includes("purge")
  ) {
    return "custom";
  }

  return "unknown";
}

export function createDefaultFeatureVisibility():
  Record<GcodeFeatureCategory, boolean> {
  return Object.fromEntries(
    GCODE_FEATURES.map(
      (feature) => [
        feature.id,
        feature.defaultVisible,
      ],
    ),
  ) as Record<
    GcodeFeatureCategory,
    boolean
  >;
}
