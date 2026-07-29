import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TemperatureSample } from "../types/printer";
import TemperatureGraph from "./TemperatureGraph";
import { Panel } from "./common/Panel";

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

export default function TemperaturePanel({
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
    setHotendInput(temperature);

    sendGcode(
      `M104 S${temperature}`,
    );
  };

  const setBedTemperature = (
    temperature: number,
  ) => {
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
        presets={[
          180,
          200,
          210,
          220,
          240,
          0,
        ]}
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
        presets={[
          50,
          60,
          70,
          80,
          100,
          0,
        ]}
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
  presets: number[];
  onSet: (
    temperature: number,
  ) => void;
  accentClass: string;
}) {
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
          value={inputValue}
          onChange={(event) =>
            setInputValue(
              Number(
                event.target.value,
              ),
            )
          }
          disabled={!enabled}
          className="w-20 bg-black border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-white disabled:text-gray-700"
        />

        <button
          type="button"
          onClick={() =>
            onSet(inputValue)
          }
          disabled={!enabled}
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