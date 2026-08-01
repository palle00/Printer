import { useEffect, useState } from "react";
import type { OperationsSettings } from "../../types/operations";
import ProfilesTab from "./ProfilesTab";
import ResourcesTab from "./ResourcesTab";
import ActivityTab from "./ActivityTab";
import ToolsTab from "./ToolsTab";
import ComparisonTab from "./ComparisonTab";
import type { ParsedGcode } from "../../types/gcode";
import { useModalDialog } from "../../hooks/useModalDialog";

export type OperationsTab = "profiles" | "resources" | "activity" | "compare" | "tools";

interface Props {
  open: boolean;
  settings: OperationsSettings;
  connected: boolean;
  hasActivePrint: boolean;
  onClose(): void;
  onChange(create: (current: OperationsSettings) => OperationsSettings): void;
  onSendMacro(commands: string): void;
  onOpenQueued(path: string): void;
  onExportDiagnostics(): Promise<string | null>;
  onExportFailureReport(reportId: string): Promise<string | null>;
  gcode: ParsedGcode | null;
  initialTab: OperationsTab;
}

export default function OperationsDialog(props: Props) {
  const [tab, setTab] = useState<OperationsTab>(props.initialTab);
  const dialogRef = useModalDialog<HTMLElement>(props.open, props.onClose);
  useEffect(() => { if (props.open) setTab(props.initialTab); }, [props.initialTab, props.open]);
  if (!props.open) return null;
  const tabs: Array<[OperationsTab, string]> = [["profiles", "Printers"], ["resources", "Materials"], ["activity", "Jobs"], ["compare", "Compare"], ["tools", "Tools"]];
  return (
    <div className="absolute inset-0 z-[96] grid place-items-center bg-black/80 p-4" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Operations" className="flex h-[min(760px,92vh)] w-[min(1000px,96vw)] flex-col overflow-hidden border border-gray-700 bg-[#121620] shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div><h2 className="text-sm font-bold text-white">Operations</h2><p className="mt-1 text-xs text-gray-500">Printers, materials, jobs and service tools</p></div>
          <button type="button" aria-label="Close operations" onClick={props.onClose} className="h-8 w-8 text-xl text-gray-500 hover:text-white">x</button>
        </header>
        <nav className="flex border-b border-gray-800 bg-[#0f131d] px-4">
          {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-3 text-xs font-bold ${tab === id ? "border-b-2 border-blue-500 text-white" : "text-gray-500 hover:text-gray-300"}`}>{label}</button>)}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "profiles" && <ProfilesTab settings={props.settings} onChange={props.onChange} />}
          {tab === "resources" && <ResourcesTab settings={props.settings} onChange={props.onChange} />}
          {tab === "activity" && <ActivityTab settings={props.settings} onChange={props.onChange} onOpenQueued={props.onOpenQueued} onExportFailureReport={props.onExportFailureReport} />}
          {tab === "compare" && <ComparisonTab current={props.gcode} />}
          {tab === "tools" && <ToolsTab settings={props.settings} connected={props.connected} hasActivePrint={props.hasActivePrint} onChange={props.onChange} onSendMacro={props.onSendMacro} onExportDiagnostics={props.onExportDiagnostics} />}
        </div>
      </section>
    </div>
  );
}
