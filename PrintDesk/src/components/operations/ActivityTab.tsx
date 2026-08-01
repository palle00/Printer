import { Download, Trash2 } from "lucide-react";

import type { OperationsSettings } from "../../types/operations";
import { formatDuration } from "../../utils/time";

interface ActivityTabProps {
  settings: OperationsSettings;
  onChange(create: (current: OperationsSettings) => OperationsSettings): void;
  onOpenQueued(path: string): void;
  onExportFailureReport(reportId: string): Promise<string | null>;
}

export default function ActivityTab({
  settings,
  onChange,
  onOpenQueued,
  onExportFailureReport,
}: ActivityTabProps) {
  return (
    <div className="space-y-6">
      {settings.recoveryCheckpoint?.state === "interrupted" && (
        <section className="border border-yellow-800 bg-yellow-950/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase text-yellow-300">Interrupted print checkpoint</h3>
              <p className="mt-2 text-sm text-gray-200">{settings.recoveryCheckpoint.fileName}</p>
              <p className="mt-1 font-mono text-[10px] text-gray-500">
                Layer {settings.recoveryCheckpoint.layer} / {settings.recoveryCheckpoint.totalLayers} - command {settings.recoveryCheckpoint.commandIndex.toLocaleString()}
              </p>
              <p className="mt-2 max-w-2xl text-xs text-gray-500">
                Reloading restores the file and preview. PrintDeck never resumes an interrupted host-streamed print automatically.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onOpenQueued(settings.recoveryCheckpoint!.filePath)} className="border border-yellow-700 px-3 py-2 text-xs text-yellow-300">Reload file</button>
              <button type="button" onClick={() => onChange((current) => ({ ...current, recoveryCheckpoint: null }))} className="px-3 py-2 text-xs text-gray-500">Dismiss</button>
            </div>
          </div>
        </section>
      )}

      {settings.failureReports.length > 0 && (
        <section>
          <div className="mb-3 flex justify-between">
            <h3 className="text-xs font-bold uppercase text-gray-400">Failure reports</h3>
            <button type="button" onClick={() => onChange((current) => ({ ...current, failureReports: [] }))} className="text-xs text-gray-600">Clear</button>
          </div>
          <div className="space-y-2">
            {settings.failureReports.map((report) => (
              <article key={report.id} className="border border-red-950 bg-[#181d2c] p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-3"><span className="truncate text-xs text-gray-200">{report.fileName}</span><span className="text-xs text-red-400">{report.outcome}</span></div>
                    <p className="mt-1 text-[10px] text-gray-500">{report.message ?? "Print ended before completion"}</p>
                    <p className="mt-1 font-mono text-[9px] text-gray-600">Layer {report.layer}, command {report.commandIndex.toLocaleString()} at X{report.position.x.toFixed(2)} Y{report.position.y.toFixed(2)} Z{report.position.z.toFixed(2)}</p>
                  </div>
                  <button type="button" onClick={() => void onExportFailureReport(report.id)} aria-label={`Export failure report for ${report.fileName}`} title="Export report" className="text-blue-400"><Download size={14} /></button>
                  <button type="button" onClick={() => onChange((current) => ({ ...current, failureReports: current.failureReports.filter((item) => item.id !== report.id) }))} aria-label={`Delete failure report for ${report.fileName}`} title="Delete report" className="text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase text-gray-400">Print queue</h3>
          <div className="space-y-2">
            {settings.queue.map((job, index) => (
              <div key={job.id} className="flex items-center gap-3 border border-gray-800 bg-[#181d2c] p-3">
                <span className="font-mono text-xs text-gray-600">{index + 1}</span>
                <button type="button" title={job.path} onClick={() => onOpenQueued(job.path)} className="min-w-0 flex-1 truncate text-left text-xs text-gray-200">{job.name}</button>
                <button type="button" aria-label={`Remove ${job.name}`} onClick={() => onChange((current) => ({ ...current, queue: current.queue.filter((item) => item.id !== job.id) }))} className="text-gray-600 hover:text-red-400">x</button>
              </div>
            ))}
          </div>
          {settings.queue.length === 0 && <p className="text-xs text-gray-600">Add recent files to the queue from the File panel.</p>}
        </section>
        <section>
          <div className="mb-3 flex justify-between"><h3 className="text-xs font-bold uppercase text-gray-400">Print history</h3>{settings.history.length > 0 && <button type="button" onClick={() => onChange((current) => ({ ...current, history: [] }))} className="text-xs text-gray-600">Clear</button>}</div>
          <div className="space-y-2">
            {settings.history.map((entry) => (
              <div key={entry.id} className="border border-gray-800 bg-[#181d2c] p-3">
                <div className="flex justify-between gap-3"><span className="truncate text-xs text-gray-200">{entry.fileName}</span><span className={entry.outcome === "completed" ? "text-xs text-green-400" : "text-xs text-yellow-400"}>{entry.outcome}</span></div>
                <p className="mt-1 font-mono text-[10px] text-gray-600">{new Date(entry.startedAt).toLocaleString()} / {formatDuration(entry.elapsedSeconds)}{entry.filamentUsedGrams !== null ? ` / ${entry.filamentUsedGrams.toFixed(1)} g` : ""}</p>
              </div>
            ))}
          </div>
          {settings.history.length === 0 && <p className="text-xs text-gray-600">Completed and interrupted jobs will appear here.</p>}
        </section>
      </div>
    </div>
  );
}
