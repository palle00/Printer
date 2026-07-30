import {
  memo,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TemperatureSample } from "../types/printer";
import TemperatureGraph from "./TemperatureGraph";
import { Panel } from "./common/Panel";

const MAX_HOTEND_TEMPERATURE = 300;
const MAX_BED_TEMPERATURE = 120;
const HOTEND_PRESETS = [
  180,
  200,
  210,
  220,
  240,
  0,
] as const;
const BED_PRESETS = [
  50,
  60,
  70,
  80,
  100,
  0,
] as const;

function isValidTemperature(
  temperature: number,
  maximum: number,
): boolean {
  return (
    Number.isFinite(temperature) &&
    temperature >= 0 &&
    temperature <= maximum
  );
}

interface TemperaturePanelProps {
  hotend: number;
  targetHotend: number;
  bed: number;
  targetBed: number;
  history: TemperatureSample[];
  connected: boolean;
  hasActivePrint: boolean;
  sendGcode: (gcode: string) => void;
}

function TemperaturePanel({
  hotend,
  targetHotend,
  bed,
  targetBed,
  history,
  connected,
  hasActivePrint,
  sendGcode,
}: TemperaturePanelProps) {
  const [
    hotendInput,
    setHotendInput,
  ] = useState(0);

  const [
    bedInput,
    setBedInput,
  ] = useState(0);

  const temperatureSamples =
    useMemo(
      () => history.slice(-60),
      [history],
    );

  const controlsEnabled =
    connected && !hasActivePrint;

  useEffect(() => {
    setHotendInput(targetHotend);
  }, [targetHotend]);

  useEffect(() => {
    setBedInput(targetBed);
  }, [targetBed]);

  const setHotendTemperature = (
    temperature: number,
  ) => {
    if (
      !isValidTemperature(
        temperature,
        MAX_HOTEND_TEMPERATURE,
      )
    ) {
      return;
    }

    setHotendInput(temperature);

    sendGcode(
      `M104 S${temperature}`,
    );
  };

  const setBedTemperature = (
    temperature: number,
  ) => {
    if (
      !isValidTemperature(
        temperature,
        MAX_BED_TEMPERATURE,
      )
    ) {
      return;
    }

    setBedInput(temperature);

    sendGcode(
      `M140 S${temperature}`,
    );
  };

  return (
    <Panel title="Temperature">
      <TemperatureControl
        label="Hotend"
        current={hotend}
        target={targetHotend}
        inputValue={hotendInput}
        setInputValue={setHotendInput}
        enabled={controlsEnabled}
        maximum={
          MAX_HOTEND_TEMPERATURE
        }
        presets={HOTEND_PRESETS}
        onSet={setHotendTemperature}
        accentClass="text-red-400"
      />

      <div className="h-3" />

      <TemperatureControl
        label="Bed"
        current={bed}
        target={targetBed}
        inputValue={bedInput}
        setInputValue={setBedInput}
        enabled={controlsEnabled}
        maximum={
          MAX_BED_TEMPERATURE
        }
        presets={BED_PRESETS}
        onSet={setBedTemperature}
        accentClass="text-blue-400"
      />

      <div className="mt-4">
        <TemperatureGraph
          samples={temperatureSamples}
        />
      </div>
    </Panel>
  );
}

function TemperatureControl({
  label,
  current,
  target,
  inputValue,
  setInputValue,
  enabled,
  maximum,
  presets,
  onSet,
  accentClass,
}: {
  label: string;
  current: number;
  target: number;
  inputValue: number;
  setInputValue: (
    value: number,
  ) => void;
  enabled: boolean;
  maximum: number;
  presets: readonly number[];
  onSet: (
    temperature: number,
  ) => void;
  accentClass: string;
}) {
  const inputIsValid =
    isValidTemperature(
      inputValue,
      maximum,
    );

  return (
    <div className="bg-[#181d2c] p-3 rounded border border-gray-800">
      <div className="flex justify-between items-center mb-2">
        <span
          className={`text-xs font-bold uppercase ${accentClass}`}
        >
          {label}
        </span>

        <span className="text-lg font-mono font-black text-white">
          {current.toFixed(1)} °C
        </span>
      </div>

      <div className="text-[10px] font-mono text-gray-400 mb-3">
        TARGET {target.toFixed(0)} °C
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="number"
          min={0}
          max={maximum}
          step={1}
          value={inputValue}
          onChange={(event) =>
            setInputValue(
              Number(
                event.target.value,
              ),
            )
          }
          disabled={!enabled}
          aria-invalid={
            !inputIsValid
          }
          className="w-20 bg-black border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-white disabled:text-gray-700"
        />

        <button
          type="button"
          onClick={() =>
            onSet(inputValue)
          }
          disabled={
            !enabled ||
            !inputIsValid
          }
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 rounded text-xs font-bold"
        >
          Set
        </button>

        <button
          type="button"
          onClick={() => onSet(0)}
          disabled={!enabled}
          className="flex-1 bg-red-950 border border-red-900 text-red-400 disabled:opacity-40 rounded text-xs font-bold"
        >
          Off
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {presets.map(
          (temperature) => (
            <button
              type="button"
              key={temperature}
              onClick={() =>
                onSet(temperature)
              }
              disabled={!enabled}
              className="bg-gray-800 hover:bg-gray-700 disabled:text-gray-600 rounded py-1 text-[10px] font-mono"
            >
              {temperature}°
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export default memo(TemperaturePanel);
