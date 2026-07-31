import { Box, CircleCheck, CircleOff } from "lucide-react";
import type { PrinterProfile } from "../types/operations";
import type { PrinterPosition, PrinterStatus } from "../types/printer";

interface Props { profile: PrinterProfile; connected: boolean; status: PrinterStatus; position: PrinterPosition }
const LABELS: Record<PrinterStatus, string> = { disconnected: "Disconnected", idle: "Ready", printing: "Printing", pausing: "Pausing", paused: "Paused", stopping: "Stopping" };

export default function PrinterStatusPanel({ profile, connected, status, position }: Props) {
  return <section className="panel-surface shrink-0 overflow-hidden p-3"><div className="flex items-start justify-between"><div className="min-w-0"><h2 className="text-[10px] font-bold uppercase text-slate-300">Printer Status</h2><div className="mt-3 flex items-center gap-2 text-sm">{connected ? <CircleCheck size={15} className="text-emerald-400" /> : <CircleOff size={15} className="text-rose-400" />}<span className={connected ? "font-semibold text-emerald-400" : "text-slate-500"}>{LABELS[status]}</span></div><p className="mt-2 truncate text-xs text-slate-500">{profile.name}</p></div><Box size={42} strokeWidth={1.2} className="text-blue-500" /></div><div className="mt-4 grid grid-cols-3 border-t border-[#263548] pt-3 font-mono text-[9px]"><Position label="X" value={position.x} /><Position label="Y" value={position.y} /><Position label="Z" value={position.z} /></div></section>;
}

function Position({ label, value }: { label: string; value: number }) { return <div><span className="text-slate-600">{label}</span><strong className="ml-2 text-slate-200">{value.toFixed(1)}</strong></div>; }
