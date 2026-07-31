import { memo, useEffect, useMemo, useState } from "react";
import { Bed, Settings2, Thermometer } from "lucide-react";
import type { TemperatureSample } from "../types/printer";

interface Props { hotend: number; targetHotend: number; bed: number; targetBed: number; history: TemperatureSample[]; connected: boolean; hasActivePrint: boolean; sendGcode(gcode: string): void }
const HOTEND_PRESETS = [180, 200, 210, 220, 240, 0];
const BED_PRESETS = [50, 60, 70, 80, 100, 0];

function TemperaturePanel({ hotend, targetHotend, bed, targetBed, history, connected, hasActivePrint, sendGcode }: Props) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hotendInput, setHotendInput] = useState(0);
  const [bedInput, setBedInput] = useState(0);
  const samples = useMemo(() => history.slice(-60), [history]);
  const enabled = connected && !hasActivePrint;
  useEffect(() => setHotendInput(targetHotend), [targetHotend]);
  useEffect(() => setBedInput(targetBed), [targetBed]);
  return <section className="panel-surface shrink-0 overflow-hidden"><header className="flex items-center justify-between border-b border-[#1d2a3a] px-3 py-2.5"><h2 className="text-xs font-semibold text-slate-200">Temperatures</h2><div className="flex items-center gap-2 text-[10px] text-slate-400"><span>C</span><button type="button" title="Temperature controls" aria-label="Temperature controls" onClick={() => setControlsOpen((open) => !open)} className={`grid h-6 w-6 place-items-center rounded ${controlsOpen ? "bg-blue-600 text-white" : "bg-[#172333] hover:text-white"}`}><Settings2 size={13} /></button></div></header>
    <TemperatureRow icon={Thermometer} label="Extruder" current={hotend} target={targetHotend} samples={samples.map((sample) => sample.hotend)} />
    <TemperatureRow icon={Bed} label="Heated Bed" current={bed} target={targetBed} samples={samples.map((sample) => sample.bed)} />
    {controlsOpen && <div className="grid gap-2 border-t border-[#1d2a3a] bg-[#0b141e] p-3"><TemperatureControls label="Extruder" value={hotendInput} maximum={300} presets={HOTEND_PRESETS} enabled={enabled} onValue={setHotendInput} onSet={(value) => sendGcode(`M104 S${value}`)} /><TemperatureControls label="Bed" value={bedInput} maximum={120} presets={BED_PRESETS} enabled={enabled} onValue={setBedInput} onSet={(value) => sendGcode(`M140 S${value}`)} /></div>}
  </section>;
}

function TemperatureRow({ icon: Icon, label, current, target, samples }: { icon: typeof Thermometer; label: string; current: number; target: number; samples: number[] }) {
  return <div className="border-b border-[#1d2a3a] px-3 py-2.5 last:border-b-0"><div className="flex items-center gap-2"><Icon size={17} className="text-slate-400" /><span className="text-xs font-medium text-slate-200">{label}</span><span className="ml-auto font-mono text-lg text-blue-400">{current.toFixed(1)}<small className="text-xs"> C</small></span><span className="ml-3 text-right text-[9px] leading-tight text-slate-500">Target<br /><strong className="font-mono text-[10px] text-slate-200">{target.toFixed(0)} C</strong></span></div><MiniTemperatureGraph samples={samples} /></div>;
}

function MiniTemperatureGraph({ samples }: { samples: number[] }) {
  const values = samples.length > 1 ? samples : [0, 0];
  const minimum = Math.max(0, Math.floor((Math.min(...values) - 20) / 20) * 20);
  const maximum = Math.max(minimum + 40, Math.ceil((Math.max(...values) + 20) / 20) * 20);
  const points = values.map((value, index) => `${24 + (index / Math.max(1, values.length - 1)) * 276},${5 + (1 - (value - minimum) / (maximum - minimum)) * 42}`).join(" ");
  return <div className="mt-1.5"><svg viewBox="0 0 304 52" className="h-12 w-full" preserveAspectRatio="none"><line x1="24" y1="8" x2="300" y2="8" stroke="#1e2d3f" /><line x1="24" y1="27" x2="300" y2="27" stroke="#1e2d3f" /><line x1="24" y1="46" x2="300" y2="46" stroke="#1e2d3f" /><text x="0" y="11" fill="#64748b" fontSize="8">{maximum}</text><text x="0" y="30" fill="#64748b" fontSize="8">{Math.round((minimum + maximum) / 2)}</text><text x="0" y="49" fill="#64748b" fontSize="8">{minimum}</text><polyline points={points} fill="none" stroke="#2296f3" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><div className="ml-6 flex justify-between font-mono text-[8px] text-slate-600"><span>-15m</span><span>-10m</span><span>-5m</span><span>Now</span></div></div>;
}

function TemperatureControls({ label, value, maximum, presets, enabled, onValue, onSet }: { label: string; value: number; maximum: number; presets: number[]; enabled: boolean; onValue(value: number): void; onSet(value: number): void }) {
  const valid = Number.isFinite(value) && value >= 0 && value <= maximum;
  return <div className="grid grid-cols-[4.5rem_1fr_auto_auto] items-center gap-2"><span className="text-[10px] text-slate-500">{label}</span><input type="number" min="0" max={maximum} value={value} disabled={!enabled} onChange={(event) => onValue(Number(event.target.value))} className="min-w-0 border border-[#263548] bg-black px-2 py-1.5 font-mono text-[10px] text-white disabled:text-slate-700" /><button type="button" disabled={!enabled || !valid} onClick={() => onSet(value)} className="rounded bg-blue-600 px-2 py-1.5 text-[10px] text-white disabled:bg-slate-800">Set</button><button type="button" disabled={!enabled} onClick={() => onSet(0)} className="px-2 py-1.5 text-[10px] text-rose-400 disabled:text-slate-700">Off</button><div className="col-start-2 col-span-3 grid grid-cols-6 gap-1">{presets.map((preset) => <button type="button" key={preset} disabled={!enabled} onClick={() => { onValue(preset); onSet(preset); }} className="bg-[#172333] py-1 font-mono text-[8px] text-slate-400 disabled:text-slate-700">{preset}</button>)}</div></div>;
}

export default memo(TemperaturePanel);
