import * as THREE from "three";
import {
  GCODE_FEATURES,
  PRINTED_PATH_COLOR,
  type GcodeFeatureCategory,
} from "../../gcode/features";
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

const CATEGORY_COLOR_SHADER =
  GCODE_FEATURES.map(
    (_feature, index) =>
      `if (category < ${index + 0.5}) return categoryColor${index};`,
  ).join("\n");
const CATEGORY_VISIBILITY_SHADER =
  GCODE_FEATURES.map(
    (_feature, index) =>
      `if (category < ${index + 0.5}) return categoryVisible${index};`,
  ).join("\n");

const VERTEX_SHADER = `
  attribute float commandIndex;
  attribute float categoryIndex;
  varying float vPrinted;
  varying float vCategory;
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
    vCategory = categoryIndex;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePosition, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  varying float vPrinted;
  varying float vCategory;
  uniform vec3 printedColor;
  ${GCODE_FEATURES.map(
    (_feature, index) =>
      `uniform vec3 categoryColor${index};`,
  ).join("\n")}
  ${GCODE_FEATURES.map(
    (_feature, index) =>
      `uniform float categoryVisible${index};`,
  ).join("\n")}

  vec3 getCategoryColor(float category) {
    ${CATEGORY_COLOR_SHADER}
    return categoryColor${GCODE_FEATURES.length - 1};
  }

  float getCategoryVisibility(float category) {
    ${CATEGORY_VISIBILITY_SHADER}
    return categoryVisible${GCODE_FEATURES.length - 1};
  }

  void main() {
    if (getCategoryVisibility(vCategory) < 0.5) {
      discard;
    }

    vec3 color = mix(
      getCategoryColor(vCategory),
      printedColor,
      vPrinted
    );
    float alpha = mix(0.72, 1.0, vPrinted);
    gl_FragColor = vec4(color, alpha);
  }
`;

type FeatureVisibility =
  Readonly<
    Record<
      GcodeFeatureCategory,
      boolean
    >
  >;

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
  private layerIndexOffsets:
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

    this.layerIndexOffsets =
      data.layerIndexOffsets;

    if (data.indices.length > 0) {
      const geometry =
        new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          data.positions,
          3,
        ),
      );
      geometry.setIndex(
        new THREE.BufferAttribute(
          data.indices,
          1,
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

      const uniforms:
        Record<
          string,
          THREE.IUniform
        > = {
        printedCommand: {
          value:
            this.printedCommand,
        },
        modelCenter: {
          value: new THREE.Vector2(
            layout.centerX,
            layout.centerY,
          ),
        },
        minimumZ: {
          value: layout.minZ,
        },
        printedColor: {
          value:
            new THREE.Color(
              PRINTED_PATH_COLOR,
            ),
        },
      };

      GCODE_FEATURES.forEach(
        (feature, index) => {
          uniforms[
            `categoryColor${index}`
          ] = {
            value:
              new THREE.Color(
                feature.color,
              ),
          };
          uniforms[
            `categoryVisible${index}`
          ] = {
            value:
              this
                .featureVisibility[
                feature.id
              ]
                ? 1
                : 0,
          };
        },
      );

      const material =
        new THREE.ShaderMaterial({
          vertexShader:
            VERTEX_SHADER,
          fragmentShader:
            FRAGMENT_SHADER,
          uniforms,
          transparent: true,
          depthWrite: true,
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

    GCODE_FEATURES.forEach(
      (feature, index) => {
        this.toolpathMaterial!
          .uniforms[
            `categoryVisible${index}`
          ].value =
          visibility[feature.id]
            ? 1
            : 0;
      },
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
      this.layerIndexOffsets
        .length - 1,
    );
    const count =
      layer >= 0
        ? this.layerIndexOffsets[
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
    this.layerIndexOffsets =
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
