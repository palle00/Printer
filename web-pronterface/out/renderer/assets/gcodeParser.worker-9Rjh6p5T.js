(function() {
  "use strict";
  function stripGcodeLine(rawLine) {
    const semicolonIndex = rawLine.indexOf(";");
    const withoutComment = semicolonIndex >= 0 ? rawLine.slice(0, semicolonIndex) : rawLine;
    const checksumIndex = withoutComment.indexOf("*");
    const withoutChecksum = checksumIndex >= 0 ? withoutComment.slice(0, checksumIndex) : withoutComment;
    return withoutChecksum.replace(/\([^)]*\)/g, "").replace(
      /^\s*N\d+\s+/i,
      ""
    ).trim();
  }
  const GCODE_FEATURES = [
    {
      id: "outer-wall",
      name: "Outer walls",
      color: "#ef4444",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "inner-wall",
      name: "Inner walls",
      color: "#f97316",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "infill",
      name: "Infill",
      color: "#eab308",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "solid-infill",
      name: "Solid infill",
      color: "#84cc16",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "top-surface",
      name: "Top surfaces",
      color: "#22c55e",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "bottom-surface",
      name: "Bottom surfaces",
      color: "#14b8a6",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "support",
      name: "Supports",
      color: "#06b6d4",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "support-interface",
      name: "Support interfaces",
      color: "#3b82f6",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "skirt",
      name: "Skirts",
      color: "#8b5cf6",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "brim",
      name: "Brims",
      color: "#d946ef",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "raft",
      name: "Rafts",
      color: "#ec4899",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "bridge",
      name: "Bridges",
      color: "#f59e0b",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "ironing",
      name: "Ironing",
      color: "#a3e635",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "custom",
      name: "Custom paths",
      color: "#c084fc",
      defaultVisible: true,
      extrusion: true
    },
    {
      id: "travel",
      name: "Travel",
      color: "#64748b",
      defaultVisible: false,
      extrusion: false
    },
    {
      id: "unknown",
      name: "Unknown extrusion",
      color: "#e5e7eb",
      defaultVisible: true,
      extrusion: true
    }
  ];
  const featureIndexById = new Map(
    GCODE_FEATURES.map(
      (feature, index) => [
        feature.id,
        index
      ]
    )
  );
  function getFeatureIndex(category) {
    return featureIndexById.get(category) ?? 0;
  }
  function getFeatureCategory(index) {
    return GCODE_FEATURES[index]?.id ?? "unknown";
  }
  function normalizeFeatureLabel(value) {
    return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  }
  function detectFeatureCategory(rawLine) {
    const match = rawLine.match(
      /^\s*;\s*(?:(?:type|feature|line[_ ]?type)\s*:|extrusion\s+role\s*:)\s*(.+?)\s*$/i
    );
    if (!match) {
      return null;
    }
    const label = normalizeFeatureLabel(match[1]);
    if (label.includes("support interface") || label.includes("support material interface") || label.includes("support roof") || label.includes("support floor")) {
      return "support-interface";
    }
    if (label.includes("external perimeter") || label.includes("outer wall") || label.includes("wall outer")) {
      return "outer-wall";
    }
    if (label === "perimeter" || label.includes("inner wall") || label.includes("wall inner") || label.includes("internal perimeter")) {
      return "inner-wall";
    }
    if (label.includes("top surface") || label.includes("top solid infill") || label === "skin") {
      return "top-surface";
    }
    if (label.includes("bottom surface") || label.includes("bottom solid infill")) {
      return "bottom-surface";
    }
    if (label.includes("bridge") || label.includes("overhang wall")) {
      return "bridge";
    }
    if (label.includes("ironing")) {
      return "ironing";
    }
    if (label.includes("solid infill") || label.includes("internal solid") || label.includes("gap fill")) {
      return "solid-infill";
    }
    if (label.includes("infill") || label === "fill") {
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
    if (label.includes("travel") || label.includes("move")) {
      return "travel";
    }
    if (label.includes("custom") || label.includes("prime tower") || label.includes("wipe tower") || label.includes("purge")) {
      return "custom";
    }
    return "unknown";
  }
  const COORDINATES_PER_SEGMENT = 6;
  const INITIAL_CAPACITY = 16384;
  class GcodeSegmentStore {
    constructor(coordinates, commandIndexes, layers, extruding, featureIndexes) {
      this.coordinates = coordinates;
      this.commandIndexes = commandIndexes;
      this.layers = layers;
      this.extruding = extruding;
      this.featureIndexes = featureIndexes;
    }
    coordinates;
    commandIndexes;
    layers;
    extruding;
    featureIndexes;
    get length() {
      return this.commandIndexes.length;
    }
    get(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.length) {
        throw new RangeError(`Invalid G-code segment index: ${index}`);
      }
      const offset = index * COORDINATES_PER_SEGMENT;
      const extruding = this.extruding[index] !== 0;
      const layer = this.layers[index];
      const feature = getFeatureCategory(
        this.featureIndexes[index]
      );
      const start = {
        x: this.coordinates[offset],
        y: this.coordinates[offset + 1],
        z: this.coordinates[offset + 2],
        extruding,
        layer
      };
      const end = {
        x: this.coordinates[offset + 3],
        y: this.coordinates[offset + 4],
        z: this.coordinates[offset + 5],
        extruding,
        layer
      };
      return {
        start,
        end,
        layer,
        commandIndex: this.commandIndexes[index],
        extruding,
        feature
      };
    }
  }
  class GcodeSegmentStoreBuilder {
    coordinates = new Float32Array(INITIAL_CAPACITY * COORDINATES_PER_SEGMENT);
    commandIndexes = new Uint32Array(INITIAL_CAPACITY);
    layers = new Uint32Array(INITIAL_CAPACITY);
    extruding = new Uint8Array(INITIAL_CAPACITY);
    featureIndexes = new Uint8Array(INITIAL_CAPACITY);
    count = 0;
    append(startX, startY, startZ, endX, endY, endZ, layer, commandIndex, isExtruding, feature) {
      this.ensureCapacity(this.count + 1);
      const offset = this.count * COORDINATES_PER_SEGMENT;
      this.coordinates[offset] = startX;
      this.coordinates[offset + 1] = startY;
      this.coordinates[offset + 2] = startZ;
      this.coordinates[offset + 3] = endX;
      this.coordinates[offset + 4] = endY;
      this.coordinates[offset + 5] = endZ;
      this.commandIndexes[this.count] = Math.max(0, commandIndex);
      this.layers[this.count] = Math.max(1, layer);
      this.extruding[this.count] = isExtruding ? 1 : 0;
      this.featureIndexes[this.count] = getFeatureIndex(feature);
      this.count++;
    }
    finish() {
      return new GcodeSegmentStore(
        this.coordinates.slice(0, this.count * COORDINATES_PER_SEGMENT),
        this.commandIndexes.slice(0, this.count),
        this.layers.slice(0, this.count),
        this.extruding.slice(0, this.count),
        this.featureIndexes.slice(0, this.count)
      );
    }
    ensureCapacity(requiredCapacity) {
      if (requiredCapacity <= this.commandIndexes.length) {
        return;
      }
      const nextCapacity = Math.max(
        requiredCapacity,
        this.commandIndexes.length * 2
      );
      const nextCoordinates = new Float32Array(nextCapacity * COORDINATES_PER_SEGMENT);
      const nextCommandIndexes = new Uint32Array(nextCapacity);
      const nextLayers = new Uint32Array(nextCapacity);
      const nextExtruding = new Uint8Array(nextCapacity);
      const nextFeatureIndexes = new Uint8Array(nextCapacity);
      nextCoordinates.set(this.coordinates);
      nextCommandIndexes.set(this.commandIndexes);
      nextLayers.set(this.layers);
      nextExtruding.set(this.extruding);
      nextFeatureIndexes.set(this.featureIndexes);
      this.coordinates = nextCoordinates;
      this.commandIndexes = nextCommandIndexes;
      this.layers = nextLayers;
      this.extruding = nextExtruding;
      this.featureIndexes = nextFeatureIndexes;
    }
  }
  const NUMBERED_LAYER_PATTERN = /^\s*;\s*LAYER:\s*(-?\d+)/i;
  const LAYER_CHANGE_PATTERN = /^\s*;\s*LAYER_CHANGE\b/i;
  const Z_COMMENT_PATTERN = /^\s*;\s*Z:\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)/i;
  function detectLayerMarkerMode(lines) {
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
  function getNumberedLayer(line) {
    const match = line.match(NUMBERED_LAYER_PATTERN);
    return match ? Number(match[1]) + 1 : null;
  }
  function isLayerChangeMarker(line) {
    return LAYER_CHANGE_PATTERN.test(line);
  }
  function isZCommentMarker(line) {
    return Z_COMMENT_PATTERN.test(line);
  }
  const DEFAULT_GCODE_ANALYSIS_PROFILE = {
    filamentDiameterMm: 1.75,
    filamentDensityGramsPerCubicCentimeter: 1.24,
    printAccelerationMmPerSecondSquared: 1e3,
    travelAccelerationMmPerSecondSquared: 1500,
    defaultFeedRateMmPerMinute: 1800,
    nozzleHeatingWaitSeconds: 90,
    bedHeatingWaitSeconds: 120,
    pauseSeconds: 30,
    filamentChangeSeconds: 120
  };
  const MAXIMUM_ESTIMATE_SECONDS = 60 * 60 * 24 * 30;
  function validateDuration(seconds) {
    return Number.isFinite(seconds) && seconds > 0 && seconds <= MAXIMUM_ESTIMATE_SECONDS ? seconds : null;
  }
  function parseDurationValue(value) {
    const normalized = value.trim().toLowerCase();
    const clock = normalized.match(
      /\b(\d{1,3}):(\d{1,2}):(\d{1,2})\b/
    );
    if (clock) {
      return validateDuration(
        Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      );
    }
    let seconds = 0;
    let matched = false;
    const units = /(\d+(?:\.\d+)?)\s*(d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?)?)/gi;
    let unitMatch;
    while ((unitMatch = units.exec(normalized)) !== null) {
      matched = true;
      const amount = Number(unitMatch[1]);
      const unit = unitMatch[2].toLowerCase();
      if (unit.startsWith("d")) {
        seconds += amount * 86400;
      } else if (unit.startsWith("h")) {
        seconds += amount * 3600;
      } else if (unit.startsWith("m")) {
        seconds += amount * 60;
      } else {
        seconds += amount;
      }
    }
    if (matched) {
      return validateDuration(seconds);
    }
    const plainSeconds = normalized.match(
      /^\s*(\d+(?:\.\d+)?)\s*$/
    );
    return plainSeconds ? validateDuration(
      Number(plainSeconds[1])
    ) : null;
  }
  function extractSlicerTimeMetadata(rawLine) {
    if (!rawLine.trimStart().startsWith(";")) {
      return null;
    }
    const line = rawLine.replace(/^\s*;\s*/, "").trim();
    const lower = line.toLowerCase();
    if (lower.includes("first layer") || lower.includes("until color change")) {
      return null;
    }
    let kind = "total";
    let priority = 1;
    if (lower.includes("remaining") || /^time_remaining\b/i.test(line)) {
      kind = "remaining";
      priority = 0;
    } else if (lower.includes("elapsed") || /^time_elapsed\b/i.test(line)) {
      kind = "elapsed";
      priority = 0;
    } else if (lower.includes("normal mode") || lower.includes("total estimated") || lower.includes("model printing time")) {
      priority = 4;
    } else if (lower.includes("estimated printing time") || lower.includes("print time") || lower.includes("printing time") || /^total\s+time\s*[:=]/i.test(
      line
    )) {
      priority = 3;
    } else if (/^time\s*[:=]/i.test(line)) {
      priority = 2;
    } else {
      return null;
    }
    const equalsIndex = line.indexOf("=");
    const separatorIndex = equalsIndex >= 0 ? equalsIndex : line.indexOf(":");
    const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : line;
    const seconds = parseDurationValue(value);
    return seconds === null ? null : {
      kind,
      seconds,
      priority
    };
  }
  function estimateMotionSeconds(distanceMm, feedRateMmPerMinute, accelerationMmPerSecondSquared) {
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) {
      return 0;
    }
    const speed = Math.max(
      0.1,
      feedRateMmPerMinute / 60
    );
    const acceleration = Math.max(
      1,
      accelerationMmPerSecondSquared
    );
    const accelerationDistance = speed * speed / acceleration;
    if (distanceMm >= accelerationDistance) {
      return 2 * speed / acceleration + (distanceMm - accelerationDistance) / speed;
    }
    return 2 * Math.sqrt(
      distanceMm / acceleration
    );
  }
  class CumulativeTimeBuilder {
    values = new Float64Array(16384);
    count = 1;
    total = 0;
    constructor() {
      this.values[0] = 0;
    }
    append(durationSeconds) {
      this.ensureCapacity(this.count + 1);
      this.total += Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
      this.values[this.count] = this.total;
      this.count++;
    }
    get totalSeconds() {
      return this.total;
    }
    get commandCount() {
      return this.count - 1;
    }
    finish(targetTotalSeconds) {
      const scale = targetTotalSeconds !== void 0 && this.total > 0 ? targetTotalSeconds / this.total : 1;
      const result = new Float32Array(this.count);
      for (let index = 0; index < this.count; index++) {
        result[index] = this.values[index] * scale;
      }
      return result;
    }
    ensureCapacity(required) {
      if (required <= this.values.length) {
        return;
      }
      const next = new Float64Array(
        Math.max(
          required,
          this.values.length * 2
        )
      );
      next.set(this.values);
      this.values = next;
    }
  }
  function getEstimateConfidence(source, totalSeconds) {
    if (source === "slicer") {
      return totalSeconds >= 60 ? "high" : "medium";
    }
    return totalSeconds >= 60 ? "medium" : "low";
  }
  const EPSILON = 1e-6;
  function parseCommand(commandText) {
    if (!commandText || commandText === "%") {
      return null;
    }
    const commandMatch = commandText.match(
      /^([GMT])(\d+(?:\.\d+)?)/i
    );
    if (!commandMatch) {
      return null;
    }
    const command = `${commandMatch[1].toUpperCase()}${Number(commandMatch[2])}`;
    const parameters = {};
    const parameterRegex = /([A-Z])\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/gi;
    let match;
    while ((match = parameterRegex.exec(
      commandText
    )) !== null) {
      const value = Number(match[2]);
      switch (match[1].toUpperCase()) {
        case "X":
          parameters.x = value;
          break;
        case "Y":
          parameters.y = value;
          break;
        case "Z":
          parameters.z = value;
          break;
        case "E":
          parameters.e = value;
          break;
        case "I":
          parameters.i = value;
          break;
        case "J":
          parameters.j = value;
          break;
        case "R":
          parameters.r = value;
          break;
        case "F":
          parameters.f = value;
          break;
        case "S":
          parameters.s = value;
          break;
        case "P":
          parameters.p = value;
          break;
        case "T":
          parameters.t = value;
          break;
      }
    }
    return {
      command,
      parameters
    };
  }
  function updateCommentLayer(rawLine, mode, currentLayer) {
    if (mode === "numbered") {
      const numberedLayer = getNumberedLayer(rawLine);
      if (numberedLayer !== null) {
        return Math.max(
          1,
          numberedLayer
        );
      }
    }
    if (mode === "layer-change" && isLayerChangeMarker(rawLine)) {
      return currentLayer + 1;
    }
    if (mode === "z-comment" && isZCommentMarker(rawLine)) {
      return currentLayer + 1;
    }
    return currentLayer;
  }
  function appendLinearSegment(segments, start, end, layer, commandIndex, extruding, feature, featurePathCounts) {
    const moved = Math.abs(end.x - start.x) > EPSILON || Math.abs(end.y - start.y) > EPSILON || Math.abs(end.z - start.z) > EPSILON;
    if (!moved) {
      return false;
    }
    segments.append(
      start.x,
      start.y,
      start.z,
      end.x,
      end.y,
      end.z,
      layer,
      commandIndex,
      extruding,
      feature
    );
    featurePathCounts[getFeatureIndex(feature)]++;
    return true;
  }
  function getArcCenterFromRadius(startX, startY, endX, endY, radius, clockwise) {
    const dx = endX - startX;
    const dy = endY - startY;
    const chordLength = Math.hypot(dx, dy);
    const absoluteRadius = Math.abs(radius);
    if (chordLength < EPSILON || chordLength > absoluteRadius * 2) {
      return null;
    }
    const midpointX = (startX + endX) / 2;
    const midpointY = (startY + endY) / 2;
    const distanceFromMidpoint = Math.sqrt(
      Math.max(
        0,
        absoluteRadius * absoluteRadius - chordLength * chordLength / 4
      )
    );
    const perpendicularX = -dy / chordLength;
    const perpendicularY = dx / chordLength;
    let direction = clockwise ? -1 : 1;
    if (radius < 0) {
      direction *= -1;
    }
    return {
      x: midpointX + perpendicularX * distanceFromMidpoint * direction,
      y: midpointY + perpendicularY * distanceFromMidpoint * direction
    };
  }
  function normalizeArcSweep(startAngle, endAngle, clockwise) {
    let sweep = endAngle - startAngle;
    if (clockwise) {
      while (sweep >= 0) {
        sweep -= Math.PI * 2;
      }
    } else {
      while (sweep <= 0) {
        sweep += Math.PI * 2;
      }
    }
    return sweep;
  }
  function getArcGeometry(start, end, centerX, centerY, clockwise) {
    const radius = Math.hypot(
      start.x - centerX,
      start.y - centerY
    );
    if (radius < EPSILON) {
      return null;
    }
    const startAngle = Math.atan2(
      start.y - centerY,
      start.x - centerX
    );
    const endAngle = Math.atan2(
      end.y - centerY,
      end.x - centerX
    );
    const sweep = normalizeArcSweep(
      startAngle,
      endAngle,
      clockwise
    );
    const planarDistance = Math.abs(sweep * radius);
    return {
      radius,
      startAngle,
      sweep,
      distance: Math.hypot(
        planarDistance,
        end.z - start.z
      )
    };
  }
  function appendArcSegments(segments, start, end, centerX, centerY, clockwise, layer, commandIndex, extruding, feature, featurePathCounts) {
    const geometry = getArcGeometry(
      start,
      end,
      centerX,
      centerY,
      clockwise
    );
    if (!geometry) {
      appendLinearSegment(
        segments,
        start,
        end,
        layer,
        commandIndex,
        extruding,
        feature,
        featurePathCounts
      );
      return Math.hypot(
        end.x - start.x,
        end.y - start.y,
        end.z - start.z
      );
    }
    const arcSegmentCount = Math.max(
      8,
      Math.min(
        200,
        Math.ceil(
          geometry.distance / 1.5
        )
      )
    );
    let previous = {
      ...start
    };
    for (let index = 1; index <= arcSegmentCount; index++) {
      const progress = index / arcSegmentCount;
      const angle = geometry.startAngle + geometry.sweep * progress;
      const next = {
        x: centerX + Math.cos(angle) * geometry.radius,
        y: centerY + Math.sin(angle) * geometry.radius,
        z: start.z + (end.z - start.z) * progress,
        e: start.e + (end.e - start.e) * progress
      };
      if (index === arcSegmentCount) {
        next.x = end.x;
        next.y = end.y;
        next.z = end.z;
        next.e = end.e;
      }
      appendLinearSegment(
        segments,
        previous,
        next,
        layer,
        commandIndex,
        extruding,
        feature,
        featurePathCounts
      );
      previous = next;
    }
    return geometry.distance;
  }
  function updateSlicerEstimate(state, rawLine) {
    const metadata = extractSlicerTimeMetadata(
      rawLine
    );
    if (!metadata) {
      return;
    }
    if (metadata.kind === "total") {
      if (!state.total || metadata.priority > state.total.priority) {
        state.total = metadata;
      }
    } else if (metadata.kind === "elapsed") {
      state.elapsedSeconds = metadata.seconds;
    } else {
      state.remainingSeconds = metadata.seconds;
    }
  }
  function getPreferredSlicerSeconds(state) {
    if (state.total) {
      return state.total.seconds;
    }
    if (state.elapsedSeconds !== null && state.remainingSeconds !== null) {
      return state.elapsedSeconds + state.remainingSeconds;
    }
    return null;
  }
  function createFeatureBreakdown(pathCounts, distances, durations, durationScale) {
    let totalDistance = 0;
    for (let index = 0; index < distances.length; index++) {
      totalDistance += distances[index];
    }
    return GCODE_FEATURES.map(
      (feature, index) => ({
        category: feature.id,
        pathCount: pathCounts[index],
        movementDistanceMm: distances[index],
        estimatedDurationSeconds: durations[index] * durationScale,
        movementPercentage: totalDistance > 0 ? distances[index] / totalDistance * 100 : 0
      })
    );
  }
  function parseGcode(fileName, text, options = {}) {
    const lines = text.split(/\r?\n/);
    const segmentBuilder = new GcodeSegmentStoreBuilder();
    const timelineBuilder = new CumulativeTimeBuilder();
    const profile = {
      ...DEFAULT_GCODE_ANALYSIS_PROFILE,
      ...options.profile
    };
    const featurePathCounts = new Uint32Array(
      GCODE_FEATURES.length
    );
    const featureDistances = new Float64Array(
      GCODE_FEATURES.length
    );
    const featureDurations = new Float64Array(
      GCODE_FEATURES.length
    );
    const slicerEstimate = {
      total: null,
      elapsedSeconds: null,
      remainingSeconds: null
    };
    const layerMarkerMode = detectLayerMarkerMode(lines);
    const usesAutomaticLayers = layerMarkerMode === "none";
    const position = {
      x: 0,
      y: 0,
      z: 0,
      e: 0
    };
    let absolutePositioning = true;
    let absoluteExtrusion = true;
    let unitScale = 1;
    let speedMultiplier = 1;
    let feedRate = profile.defaultFeedRateMmPerMinute;
    let printAcceleration = profile.printAccelerationMmPerSecondSquared;
    let travelAcceleration = profile.travelAccelerationMmPerSecondSquared;
    let activeFeature = "unknown";
    let currentLayer = layerMarkerMode === "layer-change" || layerMarkerMode === "z-comment" ? 0 : 1;
    let highestLayer = 1;
    let lastAutomaticLayerZ = null;
    let filamentLengthMm = 0;
    let travelDistanceMm = 0;
    let extrusionDistanceMm = 0;
    let retractionCount = 0;
    let maximumHotendTemperature = null;
    let maximumBedTemperature = null;
    let heatingSeconds = 0;
    for (const rawLine of lines) {
      updateSlicerEstimate(
        slicerEstimate,
        rawLine
      );
      const detectedFeature = detectFeatureCategory(rawLine);
      if (detectedFeature) {
        activeFeature = detectedFeature === "travel" ? "unknown" : detectedFeature;
      }
      currentLayer = updateCommentLayer(
        rawLine,
        layerMarkerMode,
        currentLayer
      );
      highestLayer = Math.max(
        highestLayer,
        currentLayer
      );
      const commandText = stripGcodeLine(rawLine);
      if (!commandText || commandText === "%") {
        continue;
      }
      const commandIndex = timelineBuilder.commandCount + 1;
      const parsed = parseCommand(commandText);
      let commandDuration = 0;
      if (!parsed) {
        timelineBuilder.append(0);
        continue;
      }
      const {
        command,
        parameters
      } = parsed;
      if (parameters.f !== void 0 && parameters.f > 0) {
        feedRate = parameters.f * unitScale;
      }
      if (command === "G20") {
        unitScale = 25.4;
      } else if (command === "G21") {
        unitScale = 1;
      } else if (command === "G90") {
        absolutePositioning = true;
      } else if (command === "G91") {
        absolutePositioning = false;
      } else if (command === "M82") {
        absoluteExtrusion = true;
      } else if (command === "M83") {
        absoluteExtrusion = false;
      } else if (command === "M220") {
        if (parameters.s !== void 0 && parameters.s > 0) {
          speedMultiplier = parameters.s / 100;
        }
      } else if (command === "M204") {
        const nextPrintAcceleration = parameters.p ?? parameters.s;
        if (nextPrintAcceleration !== void 0 && nextPrintAcceleration > 0) {
          printAcceleration = nextPrintAcceleration * unitScale;
        }
        if (parameters.t !== void 0 && parameters.t > 0) {
          travelAcceleration = parameters.t * unitScale;
        }
      } else if (command === "G92") {
        if (parameters.x !== void 0) {
          position.x = parameters.x * unitScale;
        }
        if (parameters.y !== void 0) {
          position.y = parameters.y * unitScale;
        }
        if (parameters.z !== void 0) {
          position.z = parameters.z * unitScale;
        }
        if (parameters.e !== void 0) {
          position.e = parameters.e * unitScale;
        }
      } else if (command === "M104" || command === "M109") {
        const target = parameters.s ?? parameters.r;
        if (target !== void 0 && target >= 0) {
          maximumHotendTemperature = Math.max(
            maximumHotendTemperature ?? target,
            target
          );
        }
        if (command === "M109" && (target ?? 0) > 0) {
          commandDuration = profile.nozzleHeatingWaitSeconds;
          heatingSeconds += commandDuration;
        }
      } else if (command === "M140" || command === "M190") {
        const target = parameters.s ?? parameters.r;
        if (target !== void 0 && target >= 0) {
          maximumBedTemperature = Math.max(
            maximumBedTemperature ?? target,
            target
          );
        }
        if (command === "M190" && (target ?? 0) > 0) {
          commandDuration = profile.bedHeatingWaitSeconds;
          heatingSeconds += commandDuration;
        }
      } else if (command === "G4") {
        commandDuration = Math.max(
          0,
          parameters.p !== void 0 ? parameters.p / 1e3 : parameters.s ?? 0
        );
      } else if (command === "M0" || command === "M1" || command === "M25") {
        commandDuration = profile.pauseSeconds;
      } else if (command === "M600") {
        commandDuration = profile.filamentChangeSeconds;
      } else if (command === "G0" || command === "G1" || command === "G2" || command === "G3") {
        const start = {
          ...position
        };
        const end = {
          x: parameters.x === void 0 ? position.x : absolutePositioning ? parameters.x * unitScale : position.x + parameters.x * unitScale,
          y: parameters.y === void 0 ? position.y : absolutePositioning ? parameters.y * unitScale : position.y + parameters.y * unitScale,
          z: parameters.z === void 0 ? position.z : absolutePositioning ? parameters.z * unitScale : position.z + parameters.z * unitScale,
          e: parameters.e === void 0 ? position.e : absoluteExtrusion ? parameters.e * unitScale : position.e + parameters.e * unitScale
        };
        const extrusionAmount = end.e - position.e;
        const extruding = extrusionAmount > EPSILON;
        if (extruding) {
          filamentLengthMm += extrusionAmount;
        } else if (extrusionAmount < -EPSILON) {
          retractionCount++;
        }
        if (usesAutomaticLayers && extruding) {
          if (lastAutomaticLayerZ === null) {
            lastAutomaticLayerZ = end.z;
          } else if (end.z > lastAutomaticLayerZ + 0.01) {
            currentLayer++;
            lastAutomaticLayerZ = end.z;
          }
        }
        const segmentLayer = Math.max(1, currentLayer);
        highestLayer = Math.max(
          highestLayer,
          segmentLayer
        );
        const feature = extruding ? activeFeature : "travel";
        let movementDistance = Math.hypot(
          end.x - start.x,
          end.y - start.y,
          end.z - start.z
        );
        if (command === "G2" || command === "G3") {
          let center = null;
          if (parameters.i !== void 0 || parameters.j !== void 0) {
            center = {
              x: start.x + (parameters.i ?? 0) * unitScale,
              y: start.y + (parameters.j ?? 0) * unitScale
            };
          } else if (parameters.r !== void 0) {
            center = getArcCenterFromRadius(
              start.x,
              start.y,
              end.x,
              end.y,
              parameters.r * unitScale,
              command === "G2"
            );
          }
          if (center) {
            movementDistance = appendArcSegments(
              segmentBuilder,
              start,
              end,
              center.x,
              center.y,
              command === "G2",
              segmentLayer,
              commandIndex,
              extruding,
              feature,
              featurePathCounts
            );
          } else {
            appendLinearSegment(
              segmentBuilder,
              start,
              end,
              segmentLayer,
              commandIndex,
              extruding,
              feature,
              featurePathCounts
            );
          }
        } else {
          appendLinearSegment(
            segmentBuilder,
            start,
            end,
            segmentLayer,
            commandIndex,
            extruding,
            feature,
            featurePathCounts
          );
        }
        const timingDistance = movementDistance > EPSILON ? movementDistance : Math.abs(
          extrusionAmount
        );
        commandDuration = estimateMotionSeconds(
          timingDistance,
          feedRate * speedMultiplier,
          extruding ? printAcceleration : travelAcceleration
        );
        const featureIndex = getFeatureIndex(feature);
        if (movementDistance > EPSILON) {
          featureDistances[featureIndex] += movementDistance;
          if (extruding) {
            extrusionDistanceMm += movementDistance;
          } else {
            travelDistanceMm += movementDistance;
          }
        }
        featureDurations[featureIndex] += commandDuration;
        position.x = end.x;
        position.y = end.y;
        position.z = end.z;
        position.e = end.e;
      }
      timelineBuilder.append(
        commandDuration
      );
    }
    const segments = segmentBuilder.finish();
    let hasExtrudingSegments = false;
    for (let index = 0; index < segments.length; index++) {
      if (getFeatureCategory(
        segments.featureIndexes[index]
      ) !== "travel") {
        hasExtrudingSegments = true;
        break;
      }
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < segments.length; index++) {
      if (hasExtrudingSegments && getFeatureCategory(
        segments.featureIndexes[index]
      ) === "travel") {
        continue;
      }
      const offset = index * 6;
      const startX = segments.coordinates[offset];
      const startY = segments.coordinates[offset + 1];
      const startZ = segments.coordinates[offset + 2];
      const endX = segments.coordinates[offset + 3];
      const endY = segments.coordinates[offset + 4];
      const endZ = segments.coordinates[offset + 5];
      minX = Math.min(
        minX,
        startX,
        endX
      );
      maxX = Math.max(
        maxX,
        startX,
        endX
      );
      minY = Math.min(
        minY,
        startY,
        endY
      );
      maxY = Math.max(
        maxY,
        startY,
        endY
      );
      minZ = Math.min(
        minZ,
        startZ,
        endZ
      );
      maxZ = Math.max(
        maxZ,
        startZ,
        endZ
      );
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minY = 0;
      maxY = 0;
      minZ = 0;
      maxZ = 0;
    }
    const slicerEstimateSeconds = getPreferredSlicerSeconds(
      slicerEstimate
    );
    const motionTotalSeconds = timelineBuilder.totalSeconds;
    const totalSeconds = slicerEstimateSeconds ?? motionTotalSeconds;
    const source = slicerEstimateSeconds !== null ? "slicer" : "motion";
    const confidence = getEstimateConfidence(
      source,
      totalSeconds
    );
    const durationScale = motionTotalSeconds > 0 ? totalSeconds / motionTotalSeconds : 1;
    const cumulativeSeconds = timelineBuilder.finish(
      slicerEstimateSeconds ?? void 0
    );
    const filamentRadius = profile.filamentDiameterMm / 2;
    const filamentVolumeCubicMm = Math.PI * filamentRadius * filamentRadius * filamentLengthMm;
    const filamentWeightGrams = filamentVolumeCubicMm / 1e3 * profile.filamentDensityGramsPerCubicCentimeter;
    const width = hasExtrudingSegments ? Math.max(0, maxX - minX) : null;
    const depth = hasExtrudingSegments ? Math.max(0, maxY - minY) : null;
    const height = hasExtrudingSegments ? Math.max(0, maxZ - minZ) : null;
    return {
      fileName,
      filePath: options.filePath ?? null,
      fileSize: options.fileSize ?? null,
      lines,
      segments,
      statistics: {
        estimatedDurationSeconds: totalSeconds > 0 ? totalSeconds : null,
        estimateSource: source,
        estimateConfidence: confidence,
        slicerEstimateSeconds,
        motionEstimateSeconds: motionTotalSeconds > 0 ? motionTotalSeconds : null,
        heatingEstimateSeconds: heatingSeconds * durationScale,
        filamentLengthMm,
        filamentWeightGrams,
        widthMm: width,
        depthMm: depth,
        heightMm: height,
        travelDistanceMm,
        extrusionDistanceMm,
        retractionCount,
        maximumHotendTemperatureCelsius: maximumHotendTemperature,
        maximumBedTemperatureCelsius: maximumBedTemperature,
        featureBreakdown: createFeatureBreakdown(
          featurePathCounts,
          featureDistances,
          featureDurations,
          durationScale
        )
      },
      timing: {
        cumulativeSeconds,
        totalSeconds,
        motionTotalSeconds,
        heatingSeconds: heatingSeconds * durationScale,
        source,
        confidence
      },
      totalLines: lines.length,
      totalLayers: Math.max(
        1,
        highestLayer
      ),
      printableLines: cumulativeSeconds.length - 1,
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ
    };
  }
  self.onmessage = (event) => {
    try {
      const {
        fileName,
        text,
        filePath,
        fileSize
      } = event.data;
      const parsed = parseGcode(
        fileName,
        text,
        {
          filePath,
          fileSize
        }
      );
      const transfers = [
        parsed.segments.coordinates.buffer,
        parsed.segments.commandIndexes.buffer,
        parsed.segments.layers.buffer,
        parsed.segments.extruding.buffer,
        parsed.segments.featureIndexes.buffer,
        parsed.timing.cumulativeSeconds.buffer
      ];
      self.postMessage(
        {
          parsed
        },
        {
          transfer: transfers
        }
      );
    } catch (error) {
      self.postMessage({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
})();
