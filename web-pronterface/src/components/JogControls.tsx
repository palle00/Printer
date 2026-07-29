import { useState } from "react";
import {
  ControlButton,
  Panel,
} from "./common/Panel";

interface JogControlsProps {
  connected: boolean;
  disabled: boolean;
  sendGcode: (gcode: string) => void;
}

export default function JogControls({
  connected,
  disabled,
  sendGcode,
}: JogControlsProps) {
  const [jogStep, setJogStep] =
    useState(10);

  const controlsDisabled =
    !connected || disabled;

  const jog = (
    axis: "X" | "Y" | "Z",
    distance: number,
  ) => {
    const feedRate =
      axis === "Z" ? 600 : 3000;

    sendGcode(
      [
        "G91",
        `G1 ${axis}${distance} F${feedRate}`,
        "G90",
      ].join("\n"),
    );
  };

  const extrude = (
    distance: number,
  ) => {
    sendGcode(
      [
        "M83",
        `G1 E${distance} F200`,
      ].join("\n"),
    );
  };

  return (
    <Panel title="Jog Controls">
      <div className="grid grid-cols-4 gap-1 bg-[#181d2c] p-1 rounded border border-gray-800 mb-3 text-xs font-mono">
        {[0.1, 1, 10, 50].map(
          (step) => (
            <button
              type="button"
              key={step}
              onClick={() =>
                setJogStep(step)
              }
              disabled={controlsDisabled}
              className={`py-1 rounded ${
                jogStep === step
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800"
              } disabled:text-gray-700 disabled:cursor-not-allowed`}
            >
              {step}mm
            </button>
          ),
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div />

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            jog("Y", jogStep)
          }
        >
          Y+
        </ControlButton>

        <div />

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            jog("X", -jogStep)
          }
        >
          X-
        </ControlButton>

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            sendGcode("G28 X Y")
          }
        >
          Home
        </ControlButton>

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            jog("X", jogStep)
          }
        >
          X+
        </ControlButton>

        <div />

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            jog("Y", -jogStep)
          }
        >
          Y-
        </ControlButton>

        <div />
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            jog("Z", jogStep)
          }
        >
          Z+
        </ControlButton>

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            jog("Z", -jogStep)
          }
        >
          Z-
        </ControlButton>

        <ControlButton
          disabled={controlsDisabled}
          onClick={() => extrude(5)}
        >
          E+
        </ControlButton>

        <ControlButton
          disabled={controlsDisabled}
          onClick={() => extrude(-5)}
        >
          E-
        </ControlButton>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-800">
        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            sendGcode("G28")
          }
        >
          Home All
        </ControlButton>

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            sendGcode("G28 Z")
          }
        >
          Home Z
        </ControlButton>

        <ControlButton
          disabled={controlsDisabled}
          onClick={() =>
            sendGcode("M84")
          }
        >
          Motors Off
        </ControlButton>
      </div>
    </Panel>
  );
}