import * as THREE from "three";
import type { ParsedGcode } from "../../types/gcode";
import {
  buildToolpathData,
  type SceneLayout,
  type ToolpathBuildOptions,
} from "./toolpath";
import { createBed, createGrid, disposeObject } from "./sceneObjects";

const VERTEX_SHADER = `
  attribute float commandIndex;
  varying float vPrinted;
  uniform float printedCommand;
  uniform vec2 modelCenter;
  uniform float minimumZ;

  void main() {
    vec3 scenePosition = vec3(
      position.x - modelCenter.x,
      position.z - minimumZ,
      modelCenter.y - position.y
    );
    vPrinted = step(commandIndex, printedCommand + 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePosition, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  varying float vPrinted;
  uniform vec3 plannedColor;
  uniform vec3 printedColor;

  void main() {
    vec3 color = mix(plannedColor, printedColor, vPrinted);
    float alpha = mix(0.48, 1.0, vPrinted);
    gl_FragColor = vec4(color, alpha);
  }
`;

const TRAVEL_VERTEX_SHADER = `
  uniform vec2 modelCenter;
  uniform float minimumZ;

  void main() {
    vec3 scenePosition = vec3(
      position.x - modelCenter.x,
      position.z - minimumZ,
      modelCenter.y - position.y
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePosition, 1.0);
  }
`;

const TRAVEL_FRAGMENT_SHADER = `
  void main() {
    gl_FragColor = vec4(0.58, 0.64, 0.72, 1.0);
  }
`;

export class ToolpathRenderer {
  private bed: THREE.Mesh | null = null;
  private grid: THREE.GridHelper | null = null;
  private extrusionLines: THREE.LineSegments | null = null;
  private travelLines: THREE.LineSegments | null = null;
  private layerIndexOffsets:
    Uint32Array<ArrayBufferLike> = new Uint32Array(0);
  private travelLayerIndexOffsets:
    Uint32Array<ArrayBufferLike> = new Uint32Array(0);
  private previewLayer = 1;
  private printedCommand = 0;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly requestRender: () => void,
    private readonly buildOptions: ToolpathBuildOptions = {},
  ) {}

  async setGcode(
    gcode: ParsedGcode | null,
    layout: SceneLayout,
    signal: AbortSignal,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposeToolpaths();
    this.disposeEnvironment();
    this.bed = createBed(layout);
    this.grid = createGrid(layout);
    this.scene.add(this.bed, this.grid);
    this.requestRender();

    if (!gcode) {
      return;
    }

    const data = await buildToolpathData(
      gcode,
      signal,
      onProgress,
      this.buildOptions,
    );

    if (signal.aborted || this.disposed) {
      return;
    }

    this.layerIndexOffsets = data.layerIndexOffsets;
    this.travelLayerIndexOffsets =
      data.travelLayerIndexOffsets ?? new Uint32Array(0);

    if (data.extrusionIndices.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(data.positions, 3),
      );
      geometry.setIndex(
        new THREE.BufferAttribute(data.extrusionIndices, 1),
      );
      geometry.setAttribute(
        "commandIndex",
        new THREE.BufferAttribute(data.commandIndexes, 1),
      );
      geometry.setDrawRange(0, 0);

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          printedCommand: { value: this.printedCommand },
          modelCenter: {
            value: new THREE.Vector2(layout.centerX, layout.centerY),
          },
          minimumZ: { value: layout.minZ },
          plannedColor: { value: new THREE.Color(0x2563eb) },
          printedColor: { value: new THREE.Color(0xff6a00) },
        },
        transparent: true,
        depthWrite: true,
      });

      this.extrusionLines = new THREE.LineSegments(geometry, material);
      this.extrusionLines.frustumCulled = false;
      this.extrusionLines.renderOrder = 1;
      this.scene.add(this.extrusionLines);
    }

    if (data.travelIndices && data.travelIndices.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(data.positions, 3),
      );
      geometry.setIndex(
        new THREE.BufferAttribute(data.travelIndices, 1),
      );
      geometry.setDrawRange(0, 0);

      this.travelLines = new THREE.LineSegments(
        geometry,
        new THREE.ShaderMaterial({
          vertexShader: TRAVEL_VERTEX_SHADER,
          fragmentShader: TRAVEL_FRAGMENT_SHADER,
          uniforms: {
            modelCenter: {
              value: new THREE.Vector2(layout.centerX, layout.centerY),
            },
            minimumZ: { value: layout.minZ },
          },
        }),
      );
      this.travelLines.visible = false;
      this.travelLines.frustumCulled = false;
      this.scene.add(this.travelLines);
    }

    this.updateLayerDrawRanges();
    this.requestRender();
  }

  setPreviewLayer(layer: number): void {
    const nextLayer = Math.max(1, Math.floor(layer));

    if (nextLayer === this.previewLayer) {
      return;
    }

    this.previewLayer = nextLayer;
    this.updateLayerDrawRanges();
    this.requestRender();
  }

  setPrintedCommand(command: number): void {
    const nextCommand = Math.max(0, Math.floor(command));

    if (nextCommand === this.printedCommand) {
      return;
    }

    this.printedCommand = nextCommand;

    if (this.extrusionLines) {
      const material = this.extrusionLines.material as THREE.ShaderMaterial;
      material.uniforms.printedCommand.value = nextCommand;
      this.requestRender();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.disposeToolpaths();
    this.disposeEnvironment();
  }

  private updateLayerDrawRanges(): void {
    if (this.extrusionLines) {
      const layer = Math.min(
        this.previewLayer,
        this.layerIndexOffsets.length - 1,
      );
      const count =
        layer >= 0 ? this.layerIndexOffsets[layer] : 0;
      this.extrusionLines.geometry.setDrawRange(0, count);
    }

    if (this.travelLines) {
      const layer = Math.min(
        this.previewLayer,
        this.travelLayerIndexOffsets.length - 1,
      );
      const count =
        layer >= 0 ? this.travelLayerIndexOffsets[layer] : 0;
      this.travelLines.geometry.setDrawRange(0, count);
    }
  }

  private disposeToolpaths(): void {
    disposeObject(this.extrusionLines);
    disposeObject(this.travelLines);
    this.extrusionLines = null;
    this.travelLines = null;
    this.layerIndexOffsets = new Uint32Array(0);
    this.travelLayerIndexOffsets = new Uint32Array(0);
  }

  private disposeEnvironment(): void {
    disposeObject(this.bed);
    disposeObject(this.grid);
    this.bed = null;
    this.grid = null;
  }
}
