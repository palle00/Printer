import * as THREE from "three";
import type {
  ParsedGcode,
} from "../../types/gcode";
import {
  buildToolpathData,
  type SceneLayout,
} from "./toolpath";
import {
  createBed,
  createGrid,
  disposeObject,
} from "./sceneObjects";
import {
  createToolpathMaterial,
  setMaterialFeatureVisibility,
  type FeatureVisibility,
} from "./toolpathMaterial";

export class ToolpathRenderer {
  private bed:
    THREE.Mesh | null = null;
  private grid:
    THREE.GridHelper | null = null;
  private toolpathLines:
    THREE.LineSegments | null = null;
  private toolpathMaterial:
    THREE.ShaderMaterial | null =
      null;
  private layerVertexOffsets:
    Uint32Array<ArrayBufferLike> =
      new Uint32Array(0);
  private previewLayer = 1;
  private printedCommand = 0;
  private featureVisibility:
    FeatureVisibility;
  private disposed = false;

  constructor(
    private readonly scene:
      THREE.Scene,
    private readonly requestRender:
      () => void,
    initialVisibility:
      FeatureVisibility,
  ) {
    this.featureVisibility =
      initialVisibility;
  }

  async setGcode(
    gcode: ParsedGcode | null,
    layout: SceneLayout,
    signal: AbortSignal,
    onProgress?: (
      percent: number,
    ) => void,
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposeToolpaths();
    this.disposeEnvironment();
    this.bed = createBed(layout);
    this.grid = createGrid(layout);
    this.scene.add(
      this.bed,
      this.grid,
    );
    this.requestRender();

    if (!gcode) {
      return;
    }

    const data =
      await buildToolpathData(
        gcode,
        signal,
        onProgress,
      );

    if (
      signal.aborted ||
      this.disposed
    ) {
      return;
    }

    this.layerVertexOffsets =
      data.layerVertexOffsets;

    if (data.positions.length > 0) {
      const geometry =
        new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          data.positions,
          3,
        ),
      );
      geometry.setAttribute(
        "commandIndex",
        new THREE.BufferAttribute(
          data.commandIndexes,
          1,
        ),
      );
      geometry.setAttribute(
        "categoryIndex",
        new THREE.Uint8BufferAttribute(
          data.categoryIndexes,
          1,
        ),
      );
      geometry.setDrawRange(0, 0);

      const material =
        createToolpathMaterial({
          layout,
          printedCommand:
            this.printedCommand,
          visibility:
            this.featureVisibility,
        });
      const lines =
        new THREE.LineSegments(
          geometry,
          material,
        );
      lines.frustumCulled = false;
      lines.renderOrder = 1;
      this.toolpathLines = lines;
      this.toolpathMaterial =
        material;
      this.scene.add(lines);
    }

    this.updateLayerDrawRange();
    this.requestRender();
  }

  setPreviewLayer(
    layer: number,
  ): void {
    const nextLayer = Math.max(
      1,
      Math.floor(layer),
    );

    if (
      nextLayer ===
      this.previewLayer
    ) {
      return;
    }

    this.previewLayer = nextLayer;
    this.updateLayerDrawRange();
    this.requestRender();
  }

  setPrintedCommand(
    command: number,
  ): void {
    const nextCommand = Math.max(
      0,
      Math.floor(command),
    );

    if (
      nextCommand ===
      this.printedCommand
    ) {
      return;
    }

    this.printedCommand =
      nextCommand;

    if (this.toolpathMaterial) {
      this.toolpathMaterial
        .uniforms
        .printedCommand
        .value = nextCommand;
      this.requestRender();
    }
  }

  setFeatureVisibility(
    visibility: FeatureVisibility,
  ): void {
    this.featureVisibility =
      visibility;

    if (!this.toolpathMaterial) {
      return;
    }

    setMaterialFeatureVisibility(
      this.toolpathMaterial,
      visibility,
    );
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.disposeToolpaths();
    this.disposeEnvironment();
  }

  private updateLayerDrawRange():
    void {
    if (!this.toolpathLines) {
      return;
    }

    const layer = Math.min(
      this.previewLayer,
      this.layerVertexOffsets
        .length - 1,
    );
    const count =
      layer >= 0
        ? this.layerVertexOffsets[
            layer
          ]
        : 0;
    this.toolpathLines.geometry
      .setDrawRange(0, count);
  }

  private disposeToolpaths():
    void {
    disposeObject(
      this.toolpathLines,
    );
    this.toolpathLines = null;
    this.toolpathMaterial = null;
    this.layerVertexOffsets =
      new Uint32Array(0);
  }

  private disposeEnvironment():
    void {
    disposeObject(this.bed);
    disposeObject(this.grid);
    this.bed = null;
    this.grid = null;
  }
}
