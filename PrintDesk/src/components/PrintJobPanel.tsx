import { useEffect, useState } from "react";
import { AlertOctagon, Clock3, Flag, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import type { ParsedGcode } from "../types/gcode";
import type { PrintProgress, PrinterStatus } from "../types/printer";
import { formatDuration } from "../utils/time";
import type { PreflightIssue } from "../print/preflight";
import type { FilamentSpool, PrinterProfile } from "../types/operations";
import ObjectCancellationPanel from "./ObjectCancellationPanel";

interface Props { gcode: ParsedGcode | null; progress: PrintProgress; connected: boolean; status: PrinterStatus; isTestMode: boolean; canStartPrint: boolean; canStartTestPrint: boolean; onStartPrint(): void; onStartTestPrint(): void; onPause(): void; onResume(): void; onStop(): void; onEmergencyStop(): void; onReset(): void; preflightIssues: PreflightIssue[]; activeProfile: PrinterProfile; activeSpool: FilamentSpool | null; cancelledObjectIds: string[]; onCancelObject(protocol: NonNullable<ParsedGcode["objectCancellationProtocol"]>, objectId: string): void }

export default function PrintJobPanel(props: Props) {
  const { gcode, progress, connected, status, isTestMode, canStartPrint, canStartTestPrint, preflightIssues, activeProfile, activeSpool, cancelledObjectIds, onCancelObject } = props;
  const hasSession = progress.fileName !== null;
  const eta = hasSession ? progress.etaSeconds : gcode?.statistics.estimatedDurationSeconds ?? null;
  const percent = Math.min(100, Math.max(0, progress.percent));
  const finish = eta === null ? "--:--" : new Date(Date.now() + eta * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const canCancelObjects = gcode?.objectCancellationProtocol && gcode.cancelableObjects.length > 0 && status !== "idle" && ((gcode.objectCancellationProtocol === "klipper" && activeProfile.firmware === "klipper") || (gcode.objectCancellationProtocol === "marlin-m486" && activeProfile.firmware === "marlin"));
  const start = connected ? props.onStartPrint : props.onStartTestPrint;
  const canStart = connected ? canStartPrint : canStartTestPrint;
  const pauseAction = status === "paused" ? props.onResume : props.onPause;

  return <section className="panel-surface overflow-hidden"><header className="border-b border-[#1d2a3a] px-3 py-2.5"><h2 className="text-xs font-semibold text-slate-200">Print Progress</h2></header>
    <div className="grid grid-cols-[6.5rem_1fr] gap-4 p-3">
      <div className="grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(#238cf5 ${percent * 3.6}deg, #1b2938 0)` }}><div className="grid h-[4.65rem] w-[4.65rem] place-items-center rounded-full bg-[#0e1823] font-mono text-2xl font-bold text-slate-100">{percent.toFixed(0)}%</div></div>
      <div className="min-w-0"><div className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">{progress.fileName ?? gcode?.fileName ?? "No print selected"}</span><strong className="font-mono text-sm text-slate-200">{percent.toFixed(0)}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded bg-[#1a2837]"><div className={`h-full ${isTestMode ? "bg-violet-500" : "bg-blue-500"}`} style={{ width: `${percent}%` }} /></div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-[#263548]"><Metric icon={Clock3} label="Elapsed" value={formatDuration(progress.elapsedSeconds)} /><Metric icon={Clock3} label="Remaining" value={eta === null ? "--:--" : formatDuration(eta)} /><Metric icon={Flag} label="Finish" value={finish} /></div>
      </div>
    </div>
    {progress.isHeating && <div className="mx-3 mb-2 border border-amber-800 bg-amber-950/30 px-3 py-2 text-[9px] uppercase text-amber-300">Heating to target</div>}
    {preflightIssues.length > 0 && <div className="mx-3 mb-2 space-y-1">{preflightIssues.map((issue) => <p key={issue.code} className={`text-[9px] ${issue.severity === "error" ? "text-rose-400" : issue.severity === "warning" ? "text-amber-400" : "text-slate-500"}`}>{issue.message}</p>)}</div>}
    {gcode?.statistics.filamentWeightGrams != null && <div className="mx-3 mb-2 flex gap-4 border border-[#263548] bg-[#0b141e] px-3 py-2 text-[9px] text-slate-500"><span>Required <b className="ml-1 font-mono text-slate-300">{gcode.statistics.filamentWeightGrams.toFixed(1)} g</b></span><span>Selected spool <b className={`ml-1 font-mono ${activeSpool && activeSpool.remainingGrams >= gcode.statistics.filamentWeightGrams ? "text-emerald-400" : "text-amber-400"}`}>{activeSpool ? `${activeSpool.remainingGrams.toFixed(1)} g` : "None"}</b></span><span>After print <b className="ml-1 font-mono text-slate-300">{activeSpool ? `${Math.max(0, activeSpool.remainingGrams - gcode.statistics.filamentWeightGrams).toFixed(1)} g` : "--"}</b></span></div>}
    {canCancelObjects && gcode?.objectCancellationProtocol && <div className="mx-3"><ObjectCancellationPanel objects={gcode.cancelableObjects} protocol={gcode.objectCancellationProtocol} cancelledIds={cancelledObjectIds} disabled={status === "stopping" || isTestMode} onCancel={onCancelObject} /></div>}
    <div className="grid grid-cols-4 gap-2 border-t border-[#1d2a3a] p-3"><Action icon={Play} label={isTestMode && status === "idle" ? "Restart" : connected ? "Start" : "Test Print"} primary onClick={start} disabled={!canStart || (status !== "idle" && status !== "disconnected")} /><Action icon={status === "paused" ? Play : Pause} label={status === "paused" ? "Resume" : "Pause"} onClick={pauseAction} disabled={status !== "printing" && status !== "paused"} /><Action icon={Square} label={status === "stopping" ? "Stopping" : "Stop"} danger onClick={props.onStop} disabled={status !== "printing" && status !== "paused"} /><Action icon={isTestMode ? RotateCcw : X} label={isTestMode ? "Clear" : "Cancel"} onClick={props.onReset} disabled={status === "printing" || status === "paused" || status === "pausing" || status === "stopping" || !hasSession} /></div>
    {connected && <div className="px-3 pb-3"><EmergencyAction onConfirm={props.onEmergencyStop} /></div>}
    <div className="grid grid-cols-4 divide-x divide-[#263548] border-t border-[#1d2a3a] bg-[#0b141e] px-3 py-2 font-mono text-[9px] text-slate-500"><span>Layer <b className="ml-1 text-slate-300">{progress.currentLayer} / {progress.totalLayers || gcode?.totalLayers || 0}</b></span><span className="pl-3">Commands <b className="ml-1 text-slate-300">{progress.currentLine.toLocaleString()}</b></span><span className="pl-3">Mode <b className="ml-1 uppercase text-slate-300">{isTestMode ? "Test" : connected ? "USB" : "Offline"}</b></span><span className="pl-3">Estimate <b className="ml-1 uppercase text-slate-300">{progress.estimateSource ?? gcode?.statistics.estimateSource ?? "--"}</b></span></div>
  </section>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) { return <div className="px-3 first:pl-0"><div className="flex items-center gap-1.5 text-[9px] text-slate-500"><Icon size={12} />{label}</div><div className="mt-1 font-mono text-sm text-slate-200">{value}</div></div>; }
function Action({ icon: Icon, label, disabled, onClick, primary = false, danger = false }: { icon: typeof Play; label: string; disabled: boolean; onClick(): void; primary?: boolean; danger?: boolean }) { return <button type="button" disabled={disabled} onClick={onClick} className={`flex items-center justify-center gap-2 rounded border py-2 text-[10px] font-semibold disabled:border-[#202c3b] disabled:bg-[#131d29] disabled:text-slate-700 ${primary ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-500" : danger ? "border-rose-900 bg-[#17212d] text-rose-400 hover:bg-rose-950/40" : "border-[#263548] bg-[#17212d] text-slate-300 hover:bg-[#1d2a39]"}`}><Icon size={13} fill={danger ? "currentColor" : "none"} />{label}</button>; }

function EmergencyAction({ onConfirm }: { onConfirm(): void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return <button type="button" onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }} className={`flex w-full items-center justify-center gap-2 border py-2 text-[10px] font-bold ${armed ? "border-red-500 bg-red-700 text-white" : "border-red-950 text-red-500 hover:bg-red-950/30"}`}><AlertOctagon size={14} />{armed ? "Confirm emergency stop (M112)" : "Emergency stop"}</button>;
}
