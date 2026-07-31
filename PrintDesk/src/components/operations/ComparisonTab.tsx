import { useMemo, useState } from "react";
import { parseGcodeSummaryInWorker } from "../../hooks/parseGcodeInWorker";
import { createComparisonSummary, type GcodeComparisonSummary } from "../../types/gcode-comparison";
import type { ParsedGcode } from "../../types/gcode";
import { formatDuration } from "../../utils/time";
import { getErrorMessage } from "../../utils/errors";

interface Props { current: ParsedGcode | null }
interface Row { label: string; first: string; second: string; delta: string }
const number = (value: number, suffix = "") => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;

export default function ComparisonTab({ current }: Props) {
  const [other, setOther] = useState<GcodeComparisonSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useMemo(() => current ? createComparisonSummary(current) : null, [current]);
  const choose = async () => {
    setError(null);
    const file = await window.desktop.files.chooseGcodeFile();
    if (!file) return;
    setLoading(true);
    try { setOther(await parseGcodeSummaryInWorker(file.name, file.text, file.path, file.size, file.sha256)); }
    catch (loadError) { setError(getErrorMessage(loadError)); }
    finally { setLoading(false); }
  };
  const rows: Row[] = first && other ? [
    { label: "Layers", first: number(first.totalLayers), second: number(other.totalLayers), delta: number(other.totalLayers - first.totalLayers) },
    { label: "Commands", first: number(first.printableLines), second: number(other.printableLines), delta: number(other.printableLines - first.printableLines) },
    { label: "Paths", first: number(first.pathCount), second: number(other.pathCount), delta: number(other.pathCount - first.pathCount) },
    { label: "Duration", first: formatDuration(first.statistics.estimatedDurationSeconds ?? 0), second: formatDuration(other.statistics.estimatedDurationSeconds ?? 0), delta: number((other.statistics.estimatedDurationSeconds ?? 0) - (first.statistics.estimatedDurationSeconds ?? 0), " s") },
    { label: "Filament", first: number(first.statistics.filamentWeightGrams, " g"), second: number(other.statistics.filamentWeightGrams, " g"), delta: number(other.statistics.filamentWeightGrams - first.statistics.filamentWeightGrams, " g") },
    { label: "Width", first: number(first.statistics.widthMm ?? 0, " mm"), second: number(other.statistics.widthMm ?? 0, " mm"), delta: number((other.statistics.widthMm ?? 0) - (first.statistics.widthMm ?? 0), " mm") },
    { label: "Depth", first: number(first.statistics.depthMm ?? 0, " mm"), second: number(other.statistics.depthMm ?? 0, " mm"), delta: number((other.statistics.depthMm ?? 0) - (first.statistics.depthMm ?? 0), " mm") },
    { label: "Height", first: number(first.statistics.heightMm ?? 0, " mm"), second: number(other.statistics.heightMm ?? 0, " mm"), delta: number((other.statistics.heightMm ?? 0) - (first.statistics.heightMm ?? 0), " mm") },
  ] : [];
  return <div><div className="mb-5 flex items-center justify-between gap-4"><div><h3 className="text-xs font-bold uppercase text-gray-400">G-code comparison</h3><p className="mt-1 text-xs text-gray-600">The second file is analyzed without retaining preview geometry.</p></div><button type="button" disabled={!current || loading} onClick={() => void choose()} className="border border-blue-700 px-4 py-2 text-xs text-blue-300 disabled:border-gray-800 disabled:text-gray-700">{loading ? "Analyzing..." : "Choose comparison file"}</button></div>
    {!current && <p className="text-xs text-gray-500">Open a primary G-code file first.</p>}{error && <p className="mb-3 text-xs text-red-400">{error}</p>}
    {first && other && <div className="overflow-x-auto border border-gray-800"><table className="w-full text-left text-xs"><thead className="bg-[#0f131d] text-gray-500"><tr><th className="p-3">Metric</th><th className="p-3 text-gray-300">{first.fileName}</th><th className="p-3 text-gray-300">{other.fileName}</th><th className="p-3">Difference</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label} className="border-t border-gray-800"><th className="p-3 text-gray-500">{row.label}</th><td className="p-3 font-mono">{row.first}</td><td className="p-3 font-mono">{row.second}</td><td className="p-3 font-mono text-blue-400">{row.delta}</td></tr>)}</tbody></table></div>}
  </div>;
}
