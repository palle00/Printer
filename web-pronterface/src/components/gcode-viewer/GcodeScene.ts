import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ParsedGcode } from "../../types/gcode";
import type { PrinterPosition } from "../../types/printer";
import {
  buildToolpathData,
  getSceneLayout,
  PLANNED_FILAMENT_RADIUS,
  PRINTED_FILAMENT_RADIUS,
  upperBound,
  type SceneLayout,
} from "./toolpath";
import {
  createBed,
  createGrid,
  createNozzle,
  disposeObject,
} from "./sceneObjects";

const MAXIMUM_FPS = 30;
const FRAME_INTERVAL =
  1000 / MAXIMUM_FPS;

const CAMERA_HORIZONTAL_DISTANCE = 0.8;
const CAMERA_VERTICAL_DISTANCE = 0.65;

const CONTROL_SETTLE_FRAMES = 18;
const NOZZLE_LERP_SPEED = 0.32;
const NOZZLE_STOP_DISTANCE_SQUARED = 0.0004;

export class GcodeScene {
  private readonly scene =
    new THREE.Scene();

  private readonly camera:
    THREE.PerspectiveCamera;

  private readonly renderer:
    THREE.WebGLRenderer;

  private readonly controls:
    OrbitControls;

  private readonly resizeObserver:
    ResizeObserver;

  private bed: THREE.Mesh | null =
    null;

  private grid:
    THREE.GridHelper | null = null;

  private plannedToolpath:
    THREE.InstancedMesh | null = null;

  private printedToolpath:
    THREE.InstancedMesh | null = null;

  private readonly nozzle:
    THREE.Group;

  private layout: SceneLayout =
    getSceneLayout(null);

  private hasGcode = false;

  private segmentLayers =
    new Uint32Array();

  private segmentCommands =
    new Uint32Array();

  private previewLayer = 1;
  private printedCommand = 0;

  private readonly nozzleTarget =
    new THREE.Vector3();

  private nozzleMoving = false;
  private controlsActive = false;
  private controlSettleFrames = 0;

  private animationFrame:
    number | null = null;

  private lastFrameTime = 0;
  private renderingAnimationFrame = false;
  private disposed = false;

  constructor(
    private readonly mount:
      HTMLDivElement,
  ) {
    const width = Math.max(
      1,
      mount.clientWidth,
    );

    const height = Math.max(
      1,
      mount.clientHeight,
    );

    this.scene.background =
      new THREE.Color(0x0b0e14);

    this.camera =
      new THREE.PerspectiveCamera(
        45,
        width / height,
        0.1,
        5000,
      );

    this.camera.position.set(
      260,
      220,
      260,
    );

    this.renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        powerPreference:
          "high-performance",
      });

    /*
     * Limiting pixel ratio significantly reduces
     * rendering cost on high-DPI displays.
     */
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        1.5,
      ),
    );

    this.renderer.setSize(
      width,
      height,
    );

    this.renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    this.renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    this.renderer.toneMappingExposure =
      1.1;

    this.mount.replaceChildren(
      this.renderer.domElement,
    );

    this.controls =
      new OrbitControls(
        this.camera,
        this.renderer.domElement,
      );

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.controls.screenSpacePanning =
      true;

    this.controls.target.set(
      0,
      20,
      0,
    );

    this.controls.update();

    this.addLights();

    this.nozzle = createNozzle();
    this.nozzle.visible = false;

    this.scene.add(this.nozzle);

    this.controls.addEventListener(
      "start",
      this.handleControlsStart,
    );

    this.controls.addEventListener(
      "end",
      this.handleControlsEnd,
    );

    this.controls.addEventListener(
      "change",
      this.handleControlsChange,
    );

    this.resizeObserver =
      new ResizeObserver(
        this.handleResize,
      );

    this.resizeObserver.observe(
      this.mount,
    );

    this.renderNow();
  }

  async setGcode(
    gcode: ParsedGcode | null,
    signal: AbortSignal,
    onProgress?: (
      percent: number,
    ) => void,
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposeToolpath();
    this.disposeBedAndGrid();

    this.hasGcode = gcode !== null;
    this.layout =
      getSceneLayout(gcode);

    this.bed = createBed(
      this.layout,
    );

    this.grid = createGrid(
      this.layout,
    );

    this.scene.add(
      this.bed,
      this.grid,
    );

    this.fitCamera();
    this.renderNow();

    if (!gcode) {
      this.segmentLayers =
        new Uint32Array();

      this.segmentCommands =
        new Uint32Array();

      this.hideNozzle();

      return;
    }

    const data =
      await buildToolpathData(
        gcode,
        this.layout,
        signal,
        onProgress,
      );

    if (
      signal.aborted ||
      this.disposed
    ) {
      return;
    }

    /*
     * Both meshes share the same transformation
     * data, so the matrices are stored only once.
     */
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

    plannedToolpath.instanceMatrix =
      sharedMatrixAttribute;

    printedToolpath.instanceMatrix =
      sharedMatrixAttribute;

    /*
     * buildToolpathData positions everything using
     * the printed filament radius. Move the smaller
     * planned mesh down slightly so both rest at the
     * correct Z position.
     */
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

    this.segmentLayers =
      data.layers;

    this.segmentCommands =
      data.commands;

    this.plannedToolpath =
      plannedToolpath;

    this.printedToolpath =
      printedToolpath;

    this.scene.add(
      plannedToolpath,
      printedToolpath,
    );

    this.updateToolpathCounts();
    this.renderNow();
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

    if (this.updateToolpathCounts()) {
      this.renderNow();
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

    if (this.updateToolpathCounts()) {
      this.renderNow();
    }
  }

  setNozzle(
    position: PrinterPosition,
    visible: boolean,
  ): void {
    if (
      !visible ||
      !this.hasGcode
    ) {
      this.hideNozzle();
      return;
    }

    const wasVisible =
      this.nozzle.visible;

    this.nozzle.visible = true;

    this.nozzleTarget.set(
      position.x -
        this.layout.centerX,

      Math.max(
        PRINTED_FILAMENT_RADIUS,

        position.z -
          this.layout.minZ +
          PRINTED_FILAMENT_RADIUS,
      ),

      this.layout.centerY -
        position.y,
    );

    if (!wasVisible) {
      this.nozzle.position.copy(
        this.nozzleTarget,
      );

      this.nozzleMoving = false;
      this.renderNow();

      return;
    }

    const distanceSquared =
      this.nozzle.position
        .distanceToSquared(
          this.nozzleTarget,
        );

    if (
      distanceSquared <=
      NOZZLE_STOP_DISTANCE_SQUARED
    ) {
      this.nozzle.position.copy(
        this.nozzleTarget,
      );

      this.nozzleMoving = false;
      this.renderNow();

      return;
    }

    this.nozzleMoving = true;
    this.startAnimation();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (
      this.animationFrame !== null
    ) {
      cancelAnimationFrame(
        this.animationFrame,
      );

      this.animationFrame = null;
    }

    this.resizeObserver.disconnect();

    this.controls.removeEventListener(
      "start",
      this.handleControlsStart,
    );

    this.controls.removeEventListener(
      "end",
      this.handleControlsEnd,
    );

    this.controls.removeEventListener(
      "change",
      this.handleControlsChange,
    );

    this.controls.dispose();

    this.disposeToolpath();
    this.disposeBedAndGrid();

    disposeObject(this.nozzle);

    this.renderer.dispose();

    this.mount.replaceChildren();
  }

  private addLights(): void {
    const hemisphereLight =
      new THREE.HemisphereLight(
        0xffffff,
        0x182030,
        2,
      );

    this.scene.add(
      hemisphereLight,
    );

    const mainLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.2,
      );

    mainLight.position.set(
      180,
      350,
      220,
    );

    this.scene.add(mainLight);

    const fillLight =
      new THREE.DirectionalLight(
        0x7aa2ff,
        0.8,
      );

    fillLight.position.set(
      -180,
      120,
      -100,
    );

    this.scene.add(fillLight);
  }

  private hideNozzle(): void {
    const wasVisible =
      this.nozzle.visible;

    this.nozzle.visible = false;
    this.nozzleMoving = false;

    if (wasVisible) {
      this.renderNow();
    }
  }

  private updateToolpathCounts(): boolean {
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

    const countChanged =
      this.plannedToolpath.count !==
        visibleCount ||
      this.printedToolpath.count !==
        completedCount;

    this.plannedToolpath.count =
      visibleCount;

    this.printedToolpath.count =
      completedCount;

    return countChanged;
  }

  private fitCamera(): void {
    const largestDimension =
      Math.max(
        this.layout.bedWidth,
        this.layout.bedDepth,
        this.layout.modelHeight * 3,
      );

    this.camera.position.set(
      largestDimension *
        CAMERA_HORIZONTAL_DISTANCE,

      largestDimension *
        CAMERA_VERTICAL_DISTANCE,

      largestDimension *
        CAMERA_HORIZONTAL_DISTANCE,
    );

    this.controls.target.set(
      0,
      this.layout.modelHeight / 2,
      0,
    );

    this.camera.lookAt(
      this.controls.target,
    );

    this.controls.update();
  }

  private disposeToolpath(): void {
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
      new Uint32Array();

    this.segmentCommands =
      new Uint32Array();
  }

  private disposeInstancedMesh(
    mesh: THREE.InstancedMesh,
  ): void {
    mesh.removeFromParent();
    mesh.geometry.dispose();

    const material =
      mesh.material;

    if (Array.isArray(material)) {
      material.forEach((item) => {
        item.dispose();
      });
    } else {
      material.dispose();
    }
  }

  private disposeBedAndGrid(): void {
    disposeObject(this.bed);
    disposeObject(this.grid);

    this.bed = null;
    this.grid = null;
  }

  private renderNow(): void {
    if (this.disposed) {
      return;
    }

    this.renderer.render(
      this.scene,
      this.camera,
    );
  }

  private startAnimation(): void {
    if (
      this.disposed ||
      this.animationFrame !== null
    ) {
      return;
    }

    this.animationFrame =
      requestAnimationFrame(
        this.animate,
      );
  }

  private readonly animate = (
    timestamp: number,
  ): void => {
    this.animationFrame = null;

    if (this.disposed) {
      return;
    }

    const elapsed =
      timestamp -
      this.lastFrameTime;

    if (elapsed < FRAME_INTERVAL) {
      this.startAnimation();
      return;
    }

    this.lastFrameTime = timestamp;
    this.renderingAnimationFrame = true;

    if (
      this.nozzle.visible &&
      this.nozzleMoving
    ) {
      this.nozzle.position.lerp(
        this.nozzleTarget,
        NOZZLE_LERP_SPEED,
      );

      const distanceSquared =
        this.nozzle.position
          .distanceToSquared(
            this.nozzleTarget,
          );

      if (
        distanceSquared <
        NOZZLE_STOP_DISTANCE_SQUARED
      ) {
        this.nozzle.position.copy(
          this.nozzleTarget,
        );

        this.nozzleMoving = false;
      }
    }

    if (
      this.controlsActive ||
      this.controlSettleFrames > 0
    ) {
      this.controls.update();

      if (
        !this.controlsActive &&
        this.controlSettleFrames > 0
      ) {
        this.controlSettleFrames--;
      }
    }

    this.renderNow();

    this.renderingAnimationFrame = false;

    if (
      this.nozzleMoving ||
      this.controlsActive ||
      this.controlSettleFrames > 0
    ) {
      this.startAnimation();
    }
  };

  private readonly handleControlsStart =
    (): void => {
      this.controlsActive = true;
      this.controlSettleFrames = 0;

      this.startAnimation();
    };

  private readonly handleControlsEnd =
    (): void => {
      this.controlsActive = false;

      this.controlSettleFrames =
        CONTROL_SETTLE_FRAMES;

      this.startAnimation();
    };

  private readonly handleControlsChange =
    (): void => {
      /*
       * Avoid a second render when the change event
       * was caused by controls.update() inside the
       * animation loop.
       */
      if (
        this.renderingAnimationFrame ||
        this.animationFrame !== null
      ) {
        return;
      }

      this.renderNow();
    };

  private readonly handleResize =
    (): void => {
      if (this.disposed) {
        return;
      }

      const width = Math.max(
        1,
        this.mount.clientWidth,
      );

      const height = Math.max(
        1,
        this.mount.clientHeight,
      );

      this.camera.aspect =
        width / height;

      this.camera.updateProjectionMatrix();

      this.renderer.setSize(
        width,
        height,
      );

      this.renderNow();
    };
}