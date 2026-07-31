import { useEffect, useState } from "react";
import { Box, Route, RotateCcw } from "lucide-react";
import { createDefaultFeatureVisibility, GCODE_FEATURES, PRINTED_PATH_COLOR, type GcodeFeatureCategory } from "../gcode/features";
import type { ParsedGcode } from "../types/gcode";
import type { PrintProgress, PrinterPosition } from "../types/printer";
import GcodeViewer from "./GcodeViewer";
import PreviewLegend from "./PreviewLegend";
import PreviewStatistics from "./PreviewStatistics";

interface Props { gcode: ParsedGcode | null; progress: PrintProgress; position: PrinterPosition; connected: boolean; isTestMode: boolean; hasActivePrint: boolean }
const SHELL: GcodeFeatureCategory[] = ["outer-wall", "inner-wall"];
const INFILL: GcodeFeatureCategory[] = ["infill", "solid-infill", "top-surface", "bottom-surface"];
const SUPPORT: GcodeFeatureCategory[] = ["support", "support-interface"];

export default function PreviewPanel({ gcode, progress, position, connected, isTestMode, hasActivePrint }: Props) {
  const [previewLayer, setPreviewLayer] = useState(1);
  const [followPrinterLayer, setFollowPrinterLayer] = useState(true);
  const [featureVisibility, setFeatureVisibility] = useState<Record<GcodeFeatureCategory, boolean>>(createDefaultFeatureVisibility);
  const [viewPreset, setViewPreset] = useState<"all" | "extrusion" | "default" | null>("default");
  useEffect(() => setPreviewLayer(gcode?.totalLayers ?? 1), [gcode]);
  useEffect(() => { if (followPrinterLayer && hasActivePrint && gcode) setPreviewLayer(Math.min(gcode.totalLayers, Math.max(1, progress.currentLayer))); }, [followPrinterLayer, hasActivePrint, gcode, progress.currentLayer]);
  const setGroup = (categories: GcodeFeatureCategory[], visible: boolean) => { setViewPreset(null); setFeatureVisibility((current) => ({ ...current, ...Object.fromEntries(categories.map((category) => [category, visible])) })); };
  const groupVisible = (categories: GcodeFeatureCategory[]) => categories.every((category) => featureVisibility[category]);
  const setPreset = (mode: "all" | "extrusion" | "default") => { setViewPreset(mode); setFeatureVisibility(Object.fromEntries(GCODE_FEATURES.map((feature) => [feature.id, mode === "all" ? true : mode === "extrusion" ? feature.extrusion : feature.defaultVisible])) as Record<GcodeFeatureCategory, boolean>); };

  return <section className="panel-surface flex h-full min-h-0 flex-col overflow-visible"><header className="flex h-11 shrink-0 items-center gap-3 border-b border-[#1d2a3a] px-3"><h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{gcode?.fileName ?? "G-code Preview"}</h2>{gcode && <><PreviewStatistics statistics={gcode.statistics} layerCount={gcode.totalLayers} /><div className="flex rounded border border-[#263548] bg-[#111d29] p-0.5"><ViewPresetButton active={viewPreset === "all"} title="Show all paths, including travel" onClick={() => setPreset("all")} icon={Route} /><ViewPresetButton active={viewPreset === "extrusion"} title="Show extrusion paths only" onClick={() => setPreset("extrusion")} icon={Box} /><ViewPresetButton active={viewPreset === "default"} title="Reset path visibility" onClick={() => setPreset("default")} icon={RotateCcw} /></div><span className="rounded border border-[#263548] bg-[#111d29] px-3 py-2 text-[10px] text-slate-300">Layer view</span></>}</header>
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#09111a]"><GcodeViewer gcode={gcode} previewLayer={previewLayer} printedCommand={progress.currentLine} position={position} showNozzle={connected || isTestMode} featureVisibility={featureVisibility} />
      {!gcode && <div className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[10px] text-slate-600">Load a G-code file to display the 3D preview</div>}
      {gcode && <><div className="pointer-events-none absolute bottom-3 left-3 rounded border border-[#263548] bg-[#0a121c]/90 px-3 py-2 font-mono text-[9px] text-slate-400"><div>Layer: {previewLayer} / {gcode.totalLayers}</div><div className="mt-1">Z: {(hasActivePrint ? position.z : gcode.maxZ).toFixed(2)} mm</div></div><div className="absolute bottom-3 right-3 top-3 flex w-8 flex-col items-center"><span className="rounded border border-[#263548] bg-[#0a121c] px-1.5 py-1 font-mono text-[9px] text-slate-200">{gcode.totalLayers}</span><input type="range" min={1} max={Math.max(1, gcode.totalLayers)} value={previewLayer} onChange={(event) => { setFollowPrinterLayer(false); setPreviewLayer(Number(event.target.value)); }} className="my-2 min-h-0 flex-1 accent-blue-500 [direction:rtl] [writing-mode:vertical-lr]" /><span className="rounded border border-[#263548] bg-[#0a121c] px-2 py-1 font-mono text-[9px] text-slate-200">1</span></div></>}
      {isTestMode && <div className="pointer-events-none absolute left-3 top-3 rounded border border-violet-700 bg-violet-950/80 px-3 py-1.5 text-[9px] uppercase text-violet-300">Test simulation</div>}
    </div>
    <footer className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#1d2a3a] bg-[#0d1722] px-3 py-2"><span className="flex items-center gap-2 text-[9px] font-semibold text-slate-300"><Box size={13} /> Solid</span>{gcode && <><QuickToggle label="Show travels" checked={featureVisibility.travel} onChange={(value) => setGroup(["travel"], value)} /><QuickToggle label="Show shell" checked={groupVisible(SHELL)} onChange={(value) => setGroup(SHELL, value)} /><QuickToggle label="Show infill" checked={groupVisible(INFILL)} onChange={(value) => setGroup(INFILL, value)} /><QuickToggle label="Show supports" checked={groupVisible(SUPPORT)} onChange={(value) => setGroup(SUPPORT, value)} /><PreviewLegend statistics={gcode.statistics.featureBreakdown} visibility={featureVisibility} onChange={setFeatureVisibility} /><label className="ml-auto flex items-center gap-2 text-[9px] text-slate-400"><input type="checkbox" checked={followPrinterLayer} onChange={(event) => setFollowPrinterLayer(event.target.checked)} className="accent-blue-500" /> Follow print</label></>}<span className="ml-auto font-mono text-[8px]" style={{ color: PRINTED_PATH_COLOR }}>● PRINTED</span></footer>
  </section>;
}

function QuickToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) { return <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-slate-400"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-blue-500" />{label}</label>; }
function ViewPresetButton({ active, title, onClick, icon: Icon }: { active: boolean; title: string; onClick(): void; icon: typeof Box }) { return <button type="button" title={title} aria-label={title} aria-pressed={active} onClick={onClick} className={`grid h-7 w-7 place-items-center rounded ${active ? "bg-blue-600/25 text-blue-400" : "text-slate-500 hover:bg-[#1b2a3b] hover:text-slate-200"}`}><Icon size={14} /></button>; }
