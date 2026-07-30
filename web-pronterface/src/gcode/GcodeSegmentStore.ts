import type {
  GcodePoint,
  GcodeSegment,
} from "../types/gcode";

const COORDINATES_PER_SEGMENT = 6;
const INITIAL_CAPACITY = 16_384;

export class GcodeSegmentStore {
  constructor(
    readonly coordinates: Float32Array<ArrayBufferLike>,
    readonly commandIndexes: Uint32Array<ArrayBufferLike>,
    readonly layers: Uint32Array<ArrayBufferLike>,
    readonly extruding: Uint8Array<ArrayBufferLike>,
  ) {}

  get length(): number {
    return this.commandIndexes.length;
  }

  get(index: number): GcodeSegment {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`Invalid G-code segment index: ${index}`);
    }

    const offset = index * COORDINATES_PER_SEGMENT;
    const extruding = this.extruding[index] !== 0;
    const layer = this.layers[index];

    const start: GcodePoint = {
      x: this.coordinates[offset],
      y: this.coordinates[offset + 1],
      z: this.coordinates[offset + 2],
      extruding,
      layer,
    };
    const end: GcodePoint = {
      x: this.coordinates[offset + 3],
      y: this.coordinates[offset + 4],
      z: this.coordinates[offset + 5],
      extruding,
      layer,
    };

    return {
      start,
      end,
      layer,
      commandIndex: this.commandIndexes[index],
      extruding,
    };
  }
}

export class GcodeSegmentStoreBuilder {
  private coordinates =
    new Float32Array(INITIAL_CAPACITY * COORDINATES_PER_SEGMENT);
  private commandIndexes = new Uint32Array(INITIAL_CAPACITY);
  private layers = new Uint32Array(INITIAL_CAPACITY);
  private extruding = new Uint8Array(INITIAL_CAPACITY);
  private count = 0;

  append(
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    layer: number,
    commandIndex: number,
    isExtruding: boolean,
  ): void {
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
    this.count++;
  }

  finish(): GcodeSegmentStore {
    return new GcodeSegmentStore(
      this.coordinates.slice(0, this.count * COORDINATES_PER_SEGMENT),
      this.commandIndexes.slice(0, this.count),
      this.layers.slice(0, this.count),
      this.extruding.slice(0, this.count),
    );
  }

  private ensureCapacity(requiredCapacity: number): void {
    if (requiredCapacity <= this.commandIndexes.length) {
      return;
    }

    const nextCapacity = Math.max(
      requiredCapacity,
      this.commandIndexes.length * 2,
    );
    const nextCoordinates =
      new Float32Array(nextCapacity * COORDINATES_PER_SEGMENT);
    const nextCommandIndexes = new Uint32Array(nextCapacity);
    const nextLayers = new Uint32Array(nextCapacity);
    const nextExtruding = new Uint8Array(nextCapacity);

    nextCoordinates.set(this.coordinates);
    nextCommandIndexes.set(this.commandIndexes);
    nextLayers.set(this.layers);
    nextExtruding.set(this.extruding);
    this.coordinates = nextCoordinates;
    this.commandIndexes = nextCommandIndexes;
    this.layers = nextLayers;
    this.extruding = nextExtruding;
  }
}
