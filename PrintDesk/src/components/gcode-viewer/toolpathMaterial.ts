import * as THREE from "three";

import {
  GCODE_FEATURES,
  PRINTED_PATH_COLOR,
  type GcodeFeatureCategory,
} from "../../gcode/features";
import type {
  SceneLayout,
} from "./toolpath";

export type FeatureVisibility =
  Readonly<
    Record<
      GcodeFeatureCategory,
      boolean
    >
  >;

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

interface CreateToolpathMaterialOptions {
  layout: SceneLayout;
  printedCommand: number;
  visibility: FeatureVisibility;
}

export function createToolpathMaterial({
  layout,
  printedCommand,
  visibility,
}: CreateToolpathMaterialOptions):
  THREE.ShaderMaterial {
  const uniforms:
    Record<
      string,
      THREE.IUniform
    > = {
    printedCommand: {
      value: printedCommand,
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
          visibility[feature.id]
            ? 1
            : 0,
      };
    },
  );

  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader:
      FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite: true,
  });
}

export function setMaterialFeatureVisibility(
  material: THREE.ShaderMaterial,
  visibility: FeatureVisibility,
): void {
  GCODE_FEATURES.forEach(
    (feature, index) => {
      material.uniforms[
        `categoryVisible${index}`
      ].value =
        visibility[feature.id]
          ? 1
          : 0;
    },
  );
}
