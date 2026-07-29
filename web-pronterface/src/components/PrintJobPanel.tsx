import type { ParsedGcode } from "../types/gcode";
import type {
  PrintProgress,
  PrinterStatus,
} from "../types/printer";
import { formatDuration } from "../utils/time";
import {
  Panel,
  Stat,
} from "./common/Panel";

interface PrintJobPanelProps {
  gcode: ParsedGcode | null;
  progress: PrintProgress;

  connected: boolean;
  printerStatus: PrinterStatus;
  testStatus: PrinterStatus;
  isTestMode: boolean;

  canStartPrint: boolean;
  canStartTestPrint: boolean;

  onStartPrint: () => void;
  onStartTestPrint: () => void;

  onPausePrint: () => void;
  onResumePrint: () => void;
  onStopPrint: () => void;

  onPauseTest: () => void;
  onResumeTest: () => void;
  onStopTest: () => void;
  onResetTest: () => void;
}

export default function PrintJobPanel({
  gcode,
  progress,
  connected,
  printerStatus,
  testStatus,
  isTestMode,
  canStartPrint,
  canStartTestPrint,
  onStartPrint,
  onStartTestPrint,
  onPausePrint,
  onResumePrint,
  onStopPrint,
  onPauseTest,
  onResumeTest,
  onStopTest,
  onResetTest,
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
          value={`${progress.currentLayer} / ${
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

      {!connected && !isTestMode && (
        <button
          type="button"
          onClick={onStartTestPrint}
          disabled={!canStartTestPrint}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-[#181d2c] disabled:text-gray-600 text-white py-2 rounded text-xs font-bold uppercase disabled:cursor-not-allowed"
        >
          Test Print
        </button>
      )}

      {connected &&
        printerStatus === "idle" && (
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
        testStatus === "idle" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onStartTestPrint}
              disabled={!gcode}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white py-2 rounded text-xs font-bold uppercase"
            >
              Restart Test
            </button>

            <button
              type="button"
              onClick={onResetTest}
              className="bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-xs font-bold uppercase"
            >
              Clear Test
            </button>
          </div>
        )}

      {testStatus === "printing" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPauseTest}
            className="bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Pause Test
          </button>

          <button
            type="button"
            onClick={onStopTest}
            className="bg-red-600 hover:bg-red-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Stop Test
          </button>
        </div>
      )}

      {testStatus === "paused" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onResumeTest}
            className="bg-green-600 hover:bg-green-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Resume Test
          </button>

          <button
            type="button"
            onClick={onStopTest}
            className="bg-red-600 hover:bg-red-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Stop Test
          </button>
        </div>
      )}

      {testStatus === "stopping" && (
        <button
          type="button"
          disabled
          className="w-full bg-gray-800 text-gray-500 py-2 rounded text-xs font-bold uppercase"
        >
          Stopping test...
        </button>
      )}

      {printerStatus === "printing" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPausePrint}
            className="bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Pause
          </button>

          <button
            type="button"
            onClick={onStopPrint}
            className="bg-red-600 hover:bg-red-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Stop
          </button>
        </div>
      )}

      {printerStatus === "paused" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onResumePrint}
            className="bg-green-600 hover:bg-green-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Resume
          </button>

          <button
            type="button"
            onClick={onStopPrint}
            className="bg-red-600 hover:bg-red-500 text-white py-2 rounded text-xs font-bold uppercase"
          >
            Stop
          </button>
        </div>
      )}

      {(printerStatus === "pausing" ||
        printerStatus === "stopping") && (
        <button
          type="button"
          disabled
          className="w-full bg-gray-800 text-gray-500 py-2 rounded text-xs font-bold uppercase"
        >
          {printerStatus === "pausing"
            ? "Pausing..."
            : "Safe stopping..."}
        </button>
      )}
    </Panel>
  );
}