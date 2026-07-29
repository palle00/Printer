import type { PrinterStatus } from "../types/printer";

interface AppHeaderProps {
  status: PrinterStatus;
  isTestMode: boolean;
  connected: boolean;
  hasActivePrint: boolean;
  onToggleConnection: () => void | Promise<void>;
  onStopPrint: () => void;
}

const statusLabels: Record<
  PrinterStatus,
  string
> = {
  disconnected: "OFFLINE",
  idle: "IDLE",
  printing: "PRINTING",
  pausing: "PAUSING",
  paused: "PAUSED",
  stopping: "STOPPING",
};

const statusColors: Record<
  PrinterStatus,
  string
> = {
  disconnected: "bg-red-500",
  idle: "bg-green-500",
  printing: "bg-blue-500",
  pausing: "bg-yellow-500",
  paused: "bg-yellow-500",
  stopping: "bg-red-500",
};

export default function AppHeader({
  status,
  isTestMode,
  connected,
  hasActivePrint,
  onToggleConnection,
  onStopPrint,
}: AppHeaderProps) {
  return (
    <header className="bg-[#121620] border-b border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="font-black tracking-widest text-xs">
          PRINTER CONTROL
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-[#181d2c] px-3 py-1.5 rounded border border-gray-800 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              statusColors[status]
            }`}
          />

          <span className="font-mono font-bold">
            {isTestMode
              ? `TEST ${statusLabels[status]}`
              : statusLabels[status]}
          </span>
        </div>

        <div className="hidden sm:block bg-[#181d2c] px-3 py-1.5 rounded border border-gray-800 font-mono text-xs text-gray-400">
          115200
        </div>

        <button
          type="button"
          onClick={onToggleConnection}
          disabled={hasActivePrint}
          className="px-4 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {connected
            ? "Disconnect"
            : "Connect USB"}
        </button>

        {hasActivePrint && (
          <button
            type="button"
            onClick={onStopPrint}
            disabled={status === "stopping"}
            className="px-4 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-red-600 hover:bg-red-500 disabled:bg-red-950 disabled:text-red-800 disabled:cursor-not-allowed"
          >
            {status === "stopping"
              ? "Stopping..."
              : isTestMode
                ? "Stop Test"
                : "Stop Print"}
          </button>
        )}
      </div>
    </header>
  );
}