export interface GcodePoint {
  x: number;
  y: number;
  z: number;
  extruding: boolean;
  layer: number;
}

export interface GcodeSegment {
  start: GcodePoint;
  end: GcodePoint;

  layer: number;
  commandIndex: number;
  extruding: boolean;
}

export interface ParsedGcode {
  fileName: string;
  text: string;
  lines: string[];
  segments: GcodeSegment[];

  totalLines: number;
  totalLayers: number;
  printableLines: number;

  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}