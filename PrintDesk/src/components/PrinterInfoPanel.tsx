import { Box, Cable, Flame, Gauge, PanelsTopLeft, Thermometer } from "lucide-react";
import type { PrinterProfile } from "../types/operations";

interface Props { profile: PrinterProfile }
export default function PrinterInfoPanel({ profile }: Props) {
  const rows = [
    { icon: Gauge, label: "Firmware", value: profile.firmware },
    { icon: Cable, label: "Baud", value: profile.baudRate.toLocaleString() },
    { icon: PanelsTopLeft, label: "Build plate", value: `${profile.bedWidthMm} x ${profile.bedDepthMm} mm` },
    { icon: Flame, label: "Max hotend", value: `${profile.maximumHotendCelsius} C` },
    { icon: Thermometer, label: "Max bed", value: `${profile.maximumBedCelsius} C` },
    { icon: Box, label: "Build height", value: `${profile.maximumHeightMm} mm` },
  ];
  return <section className="panel-surface shrink-0 overflow-hidden"><header className="border-b border-[#1d2a3a] px-3 py-2.5"><h2 className="text-xs font-semibold text-slate-200">Printer Info</h2></header><div className="grid grid-cols-2 gap-x-5 gap-y-2.5 p-3">{rows.map(({ icon: Icon, label, value }) => <div key={label} className="flex min-w-0 items-center gap-2 text-[10px]"><Icon size={13} className="shrink-0 text-slate-500" /><span className="text-slate-400">{label}</span><span className="ml-auto truncate font-mono text-slate-200">{value}</span></div>)}</div></section>;
}
