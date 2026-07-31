import { Box, Camera, ChartNoAxesGantt, Disc3, FileCode2, Gauge, Layers3, Network, Settings2, SlidersHorizontal } from "lucide-react";
import type { OperationsTab } from "./operations/OperationsDialog";
import type { PrinterProfile } from "../types/operations";

interface Props { activeProfile: PrinterProfile; queueCount: number; onOpen(tab: OperationsTab): void }
const items: Array<{ label: string; tab?: OperationsTab; icon: typeof Gauge; badge?: "queue" }> = [
  { label: "Dashboard", icon: Gauge }, { label: "Print queue", tab: "activity", icon: ChartNoAxesGantt, badge: "queue" },
  { label: "G-code files", tab: "activity", icon: FileCode2 }, { label: "Compare", tab: "compare", icon: Layers3 },
  { label: "Camera", tab: "tools", icon: Camera }, { label: "Macros", tab: "tools", icon: SlidersHorizontal },
  { label: "Filament", tab: "resources", icon: Disc3 }, { label: "Printer settings", tab: "profiles", icon: Settings2 },
  { label: "Network", tab: "tools", icon: Network },
];

export default function AppSidebar({ activeProfile, queueCount, onOpen }: Props) {
  return <aside className="app-sidebar hidden min-h-0 w-[12.5rem] shrink-0 flex-col border-r border-[#1d2938] bg-[#09111a] xl:flex">
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">{items.map(({ label, tab, icon: Icon, badge }) => <button key={label} type="button" onClick={() => tab && onOpen(tab)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition-colors ${!tab ? "bg-blue-600/20 text-blue-200" : "text-slate-400 hover:bg-[#142131] hover:text-slate-100"}`}><Icon size={17} strokeWidth={1.7} /><span className="flex-1">{label}</span>{badge === "queue" && queueCount > 0 && <span className="rounded bg-[#243246] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{queueCount}</span>}</button>)}</nav>
    <div className="border-t border-[#1d2938] p-3"><div className="flex items-center gap-3 rounded-md bg-[#101b28] p-3"><div className="grid h-9 w-9 place-items-center rounded bg-blue-600/20 text-blue-400"><Box size={18} /></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{activeProfile.name}</p><p className="mt-0.5 font-mono text-[9px] uppercase text-slate-500">{activeProfile.firmware}</p></div></div></div>
  </aside>;
}
