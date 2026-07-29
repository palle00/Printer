import * as THREE from "three";

import type {
  ParsedGcode,
} from "../../types/gcode";

import {
  buildToolpathData,
  PLANNED_FILAMENT_RADIUS,
  PRINTED_FILAMENT_RADIUS,
  upperBound,
  type SceneLayout,
} from "./toolpath";

import {
  createBed,
  createGrid,
  disposeObject,
} from "./sceneObjects";

export class ToolpathRenderer {
  private bed:
    THREE.Mesh | null = null;

  private grid:
    THREE.GridHelper | null = null;

  private plannedToolpath:
    THREE.InstancedMesh | null = null;

  private printedToolpath:
    THREE.InstancedMesh | null = null;

  private segmentLayers:
    Uint32Array<ArrayBufferLike> =
      new Uint32Array(0);

  private segmentCommands:
    Uint32Array<ArrayBufferLike> =
      new Uint32Array(0);

  private previewLayer = 1;
  private printedCommand = 0;

  private disposed = false;

  constructor(
    private readonly scene:
      THREE.Scene,

    private readonly requestRender:
      () => void,
  ) {}

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
        layout,
        signal,
        onProgress,
      );

    if (
      signal.aborted ||
      this.disposed
    ) {
      return;
    }

    this.segmentLayers =
      data.layers;

    this.segmentCommands =
      data.commands;

    if (data.count === 0) {
      this.requestRender();
      return;
    }

    const sharedMatrixAttribute =
      new THREE.InstancedBufferAttribute(
        data.matrices,
        16,
      );

    sharedMatrixAttribute.setUsage(
      THREE.StaticDrawUsage,
    );

    sharedMatrixAttribute.needsUpdate =
      true;

    const plannedGeometry =
      new THREE.CylinderGeometry(
        PLANNED_FILAMENT_RADIUS,
        PLANNED_FILAMENT_RADIUS,
        1,
        8,
        1,
        false,
      );

    const printedGeometry =
      new THREE.CylinderGeometry(
        PRINTED_FILAMENT_RADIUS,
        PRINTED_FILAMENT_RADIUS,
        1,
        8,
        1,
        false,
      );

    const plannedMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x2563eb,

        transparent: true,
        opacity: 0.38,

        roughness: 0.65,
        metalness: 0.02,

        depthWrite: false,
      });

    const printedMaterial =
      new THREE.MeshStandardMaterial({
        color: 0xff6a00,

        roughness: 0.45,
        metalness: 0.02,

        emissive: 0x3b1200,
        emissiveIntensity: 0.45,
      });

    const plannedToolpath =
      new THREE.InstancedMesh(
        plannedGeometry,
        plannedMaterial,
        data.count,
      );

    const printedToolpath =
      new THREE.InstancedMesh(
        printedGeometry,
        printedMaterial,
        data.count,
      );

    this.assignInstanceMatrix(
      plannedToolpath,
      sharedMatrixAttribute,
    );

    this.assignInstanceMatrix(
      printedToolpath,
      sharedMatrixAttribute,
    );

    plannedToolpath.position.y =
      PLANNED_FILAMENT_RADIUS -
      PRINTED_FILAMENT_RADIUS;

    plannedToolpath.frustumCulled =
      false;

    printedToolpath.frustumCulled =
      false;

    plannedToolpath.renderOrder = 1;
    printedToolpath.renderOrder = 2;

    plannedToolpath.count = 0;
    printedToolpath.count = 0;

    this.plannedToolpath =
      plannedToolpath;

    this.printedToolpath =
      printedToolpath;

    this.scene.add(
      plannedToolpath,
      printedToolpath,
    );

    this.updateCounts();
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

    if (this.updateCounts()) {
      this.requestRender();
    }
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

    if (this.updateCounts()) {
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

  private updateCounts(): boolean {
    if (
      !this.plannedToolpath ||
      !this.printedToolpath
    ) {
      return false;
    }

    const visibleCount =
      upperBound(
        this.segmentLayers,
        this.previewLayer,
      );

    const completedCount =
      Math.min(
        visibleCount,

        upperBound(
          this.segmentCommands,
          this.printedCommand,
        ),
      );

    const changed =
      this.plannedToolpath.count !==
        visibleCount ||
      this.printedToolpath.count !==
        completedCount;

    this.plannedToolpath.count =
      visibleCount;

    this.printedToolpath.count =
      completedCount;

    return changed;
  }

  private assignInstanceMatrix(
    mesh: THREE.InstancedMesh,
    attribute:
      THREE.InstancedBufferAttribute,
  ): void {
    /*
     * Some Three.js type versions mark
     * instanceMatrix as readonly even though
     * replacing the attribute is supported.
     */
    const mutableMesh =
      mesh as unknown as {
        instanceMatrix:
          THREE.InstancedBufferAttribute;
      };

    mutableMesh.instanceMatrix =
      attribute;
  }

  private disposeToolpaths(): void {
    if (this.plannedToolpath) {
      this.disposeInstancedMesh(
        this.plannedToolpath,
      );
    }

    if (this.printedToolpath) {
      this.disposeInstancedMesh(
        this.printedToolpath,
      );
    }

    this.plannedToolpath = null;
    this.printedToolpath = null;

    this.segmentLayers =
      new Uint32Array(0);

    this.segmentCommands =
      new Uint32Array(0);
  }

  private disposeInstancedMesh(
    mesh: THREE.InstancedMesh,
  ): void {
    mesh.removeFromParent();

    (
      mesh as THREE.InstancedMesh & {
        dispose?: () => void;
      }
    ).dispose?.();

    mesh.geometry.dispose();

    const material =
      mesh.material;

    if (Array.isArray(material)) {
      for (const item of material) {
        item.dispose();
      }
    } else {
      material.dispose();
    }
  }

  private disposeEnvironment(): void {
    if (this.bed) {
      disposeObject(this.bed);
      this.bed = null;
    }

    if (this.grid) {
      disposeObject(this.grid);
      this.grid = null;
    }
  }
}