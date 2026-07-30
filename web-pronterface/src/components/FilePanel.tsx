import type {
  ChangeEventHandler,
} from "react";
import { memo } from "react";
import type { ParsedGcode } from "../types/gcode";
import {
  Panel,
  Stat,
} from "./common/Panel";

interface FilePanelProps {
  gcode: ParsedGcode | null;
  isLoading: boolean;
  hasActivePrint: boolean;
  onFileChange:
    ChangeEventHandler<HTMLInputElement>;
  onClearFile: () => void;
}

function FilePanel({
  gcode,
  isLoading,
  hasActivePrint,
  onFileChange,
  onClearFile,
}: FilePanelProps) {
  return (
    <Panel title="File">
      {!gcode ? (
        <label className="border-2 border-dashed border-gray-800 hover:border-blue-500/50 bg-[#181d2c]/50 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer">
          <span className="text-xs text-gray-400">
            {isLoading
              ? "Reading file..."
              : "Select a .gcode file"}
          </span>

          <input
            type="file"
            accept=".gcode,.g"
            onChange={onFileChange}
            disabled={
              isLoading || hasActivePrint
            }
            className="hidden"
          />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="bg-[#181d2c] rounded p-3 border border-gray-800 font-mono">
            <div className="text-xs text-blue-400 font-bold truncate">
              {gcode.fileName}
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3 mt-3 text-[10px] text-gray-400">
              <Stat
                label="Lines"
                value={gcode.totalLines.toLocaleString()}
              />

              <Stat
                label="Layers"
                value={gcode.totalLayers.toString()}
              />

              <Stat
                label="Paths"
                value={gcode.segments.length.toLocaleString()}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onClearFile}
            disabled={hasActivePrint}
            className="w-full bg-[#181d2c] border border-gray-800 rounded py-2 text-xs hover:bg-gray-800 disabled:text-gray-700 disabled:cursor-not-allowed"
          >
            Remove file
          </button>
        </div>
      )}
    </Panel>
  );
}

export default memo(FilePanel);
