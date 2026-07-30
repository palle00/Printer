import {
  memo,
} from "react";

import type {
  ParsedGcode,
} from "../types/gcode";
import type {
  RecentFileEntry,
} from "../types/settings";
import {
  Panel,
  Stat,
} from "./common/Panel";

interface FilePanelProps {
  gcode: ParsedGcode | null;
  recentFiles: RecentFileEntry[];
  staleRecentPath: string | null;
  isLoading: boolean;
  hasActivePrint: boolean;
  onChooseFile(): void;
  onOpenRecent(path: string): void;
  onRemoveRecent(path: string): void;
  onClearRecent(): void;
  onClearFile(): void;
}

function formatFileSize(
  bytes: number,
): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(
      1,
      Math.round(bytes / 1024),
    )} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function FilePanel({
  gcode,
  recentFiles,
  staleRecentPath,
  isLoading,
  hasActivePrint,
  onChooseFile,
  onOpenRecent,
  onRemoveRecent,
  onClearRecent,
  onClearFile,
}: FilePanelProps) {
  return (
    <Panel title="File">
      <div className="space-y-3">
        <button
          type="button"
          onClick={onChooseFile}
          disabled={isLoading}
          className="w-full border-2 border-dashed border-gray-800 hover:border-blue-500/50 bg-[#181d2c]/50 rounded-lg px-4 py-4 flex items-center justify-center gap-2 text-xs text-gray-400 disabled:cursor-wait"
        >
          <span aria-hidden="true">
            ...
          </span>
          {isLoading
            ? "Reading G-code..."
            : gcode
              ? "Open another file"
              : "Open G-code file"}
        </button>

        {gcode && (
          <div className="space-y-3">
            <div className="bg-[#181d2c] rounded p-3 border border-gray-800 font-mono">
              <div className="flex items-center gap-2 text-xs text-blue-400 font-bold">
                <span className="truncate">
                  {gcode.fileName}
                </span>
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

        {recentFiles.length > 0 && (
          <section className="border-t border-gray-800 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase text-gray-500">
                Recent files
              </h3>
              <button
                type="button"
                onClick={onClearRecent}
                title="Clear recent files"
                className="p-1 text-gray-500 hover:text-gray-200"
              >
                <span aria-hidden="true">
                  Clear
                </span>
              </button>
            </div>

            <div className="space-y-1">
              {recentFiles.map(
                (file) => (
                  <div
                    key={file.path}
                    className={`group flex items-center gap-1 rounded border px-2 py-1.5 ${
                      staleRecentPath ===
                      file.path
                        ? "border-red-500/50 bg-red-950/20"
                        : "border-gray-800 bg-[#181d2c]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onOpenRecent(
                          file.path,
                        )
                      }
                      disabled={isLoading}
                      title={file.path}
                      className="min-w-0 flex-1 text-left disabled:opacity-50"
                    >
                      <span className="block truncate text-[11px] text-gray-300">
                        {file.name}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] text-gray-600">
                        {new Date(
                          file.lastOpenedAt,
                        ).toLocaleString()}
                        {" · "}
                        {formatFileSize(
                          file.size,
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRemoveRecent(
                          file.path,
                        )
                      }
                      title="Remove from recent files"
                      className="shrink-0 p-1 text-gray-600 hover:text-gray-200"
                    >
                      <span aria-hidden="true">
                        ×
                      </span>
                    </button>
                  </div>
                ),
              )}
            </div>
          </section>
        )}
      </div>
    </Panel>
  );
}

export default memo(FilePanel);
