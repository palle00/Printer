import { AlertTriangle, X } from "lucide-react";

import type { PrinterFault } from "../types/printer";

interface FirmwareFaultPanelProps {
  faults: readonly PrinterFault[];
  reconnecting: boolean;
  onClear(): void;
}

export default function FirmwareFaultPanel({
  faults,
  reconnecting,
  onClear,
}: FirmwareFaultPanelProps) {
  if (faults.length === 0 && !reconnecting) return null;
  const latest = faults.at(-1);
  return (
    <section className="panel-surface shrink-0 border-amber-900/70 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={15} className={latest?.severity === "critical" ? "text-red-400" : "text-amber-400"} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[10px] font-bold uppercase text-slate-300">
            {reconnecting ? "Reconnecting printer" : "Firmware alert"}
          </h2>
          {latest && (
            <>
              <p className={`mt-1 text-xs ${latest.severity === "critical" ? "text-red-300" : "text-amber-300"}`}>
                {latest.message}
              </p>
              <p className="mt-1 truncate font-mono text-[9px] text-slate-600" title={latest.rawLine}>
                {latest.rawLine}
              </p>
            </>
          )}
        </div>
        {faults.length > 0 && (
          <button type="button" onClick={onClear} aria-label="Dismiss firmware alerts" title="Dismiss" className="text-slate-600 hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>
    </section>
  );
}
