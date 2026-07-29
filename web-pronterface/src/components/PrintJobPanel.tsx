import type {
  ParsedGcode,
} from "../types/gcode";

import type {
  PrintProgress,
  PrinterStatus,
} from "../types/printer";

import {
  formatDuration,
} from "../utils/time";

import {
  Panel,
  Stat,
} from "./common/Panel";

interface PrintJobPanelProps {
  gcode: ParsedGcode | null;

  progress: PrintProgress;

  connected: boolean;

  status: PrinterStatus;
  isTestMode: boolean;

  canStartPrint: boolean;
  canStartTestPrint: boolean;

  onStartPrint: () => void;
  onStartTestPrint: () => void;

  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
}

export default function PrintJobPanel({
  gcode,
  progress,
  connected,
  status,
  isTestMode,
  canStartPrint,
  canStartTestPrint,
  onStartPrint,
  onStartTestPrint,
  onPause,
  onResume,
  onStop,
  onReset,
}: PrintJobPanelProps) {
  return (
    <Panel title="Print Job">
      {isTestMode && (
        <div className="mb-3 px-2 py-1.5 rounded bg-purple-950/50 border border-purple-800 text-purple-300 text-[10px] font-mono uppercase tracking-wider">
          Simulation mode
        </div>
      )}

      <div className="text-3xl font-black font-mono text-white mb-3">
        {progress.percent.toFixed(1)}%
      </div>

      <div className="h-2 bg-black rounded overflow-hidden mb-4">
        <div
          className={`h-full transition-all duration-200 ${
            isTestMode
              ? "bg-purple-600"
              : "bg-blue-600"
          }`}
          style={{
            width: `${Math.min(
              100,
              Math.max(
                0,
                progress.percent,
              ),
            )}%`,
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3 mb-3 text-[10px] font-mono text-gray-400">
        <Stat
          label="Elapsed"
          value={formatDuration(
            progress.elapsedSeconds,
          )}
        />

        <Stat
          label="ETA"
          value={
            progress.currentLine > 0
              ? formatDuration(
                  progress.etaSeconds,
                )
              : "--:--"
          }
        />

        <Stat
          label="Layer"
          value={`${
            progress.currentLayer
          } / ${
            progress.totalLayers ||
            gcode?.totalLayers ||
            0
          }`}
        />
      </div>

      <div className="text-[10px] font-mono text-gray-500 mb-3">
        {progress.currentLine.toLocaleString()}{" "}
        /{" "}
        {progress.totalLines.toLocaleString()}{" "}
        commands
      </div>

      {!connected &&
        !isTestMode &&
        (
          <button
            type="button"
            onClick={
              onStartTestPrint
            }
            disabled={
              !canStartTestPrint
            }
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-[#181d2c] disabled:text-gray-600 text-white py-2 rounded text-xs font-bold uppercase disabled:cursor-not-allowed"
          >
            Test Print
          </button>
        )}

      {connected &&
        !isTestMode &&
        status === "idle" &&
        (
          <button
            type="button"
            onClick={onStartPrint}
            disabled={!canStartPrint}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-[#181d2c] disabled:text-gray-600 text-white py-2 rounded text-xs font-bold uppercase disabled:cursor-not-allowed"
          >
            Start Print
          </button>
        )}

      {isTestMode &&
        status === "idle" &&
        (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={
                onStartTestPrint
              }
              disabled={!gcode}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white py-2 rounded text-xs font-bold uppercase"
            >
              Restart Test
            </button>

            <button
              type="button"
              onClick={onReset}
              className="bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-xs font-bold uppercase"
            >
              Clear Test
            </button>
          </div>
        )}

      {status === "printing" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPause}
            className="bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            {isTestMode
              ? "Pause Test"
              : "Pause"}
          </button>

          <button
            type="button"
            onClick={onStop}
            className="bg-red-600 hover:bg-red-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            {isTestMode
              ? "Stop Test"
              : "Stop"}
          </button>
        </div>
      )}

      {status === "paused" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onResume}
            className="bg-green-600 hover:bg-green-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            {isTestMode
              ? "Resume Test"
              : "Resume"}
          </button>

          <button
            type="button"
            onClick={onStop}
            className="bg-red-600 hover:bg-red-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            {isTestMode
              ? "Stop Test"
              : "Stop"}
          </button>
        </div>
      )}

      {(status === "pausing" ||
        status === "stopping") && (
        <button
          type="button"
          disabled
          className="w-full bg-gray-800 text-gray-500 py-2 rounded text-xs font-bold uppercase"
        >
          {status === "pausing"
            ? "Pausing..."
            : isTestMode
              ? "Stopping test..."
              : "Safe stopping..."}
        </button>
      )}
    </Panel>
  );
}