import { memo } from "react";
import { Bell, Cable, Hexagon, Settings, Unplug, XOctagon } from "lucide-react";

interface AppHeaderProps {
  isTestMode: boolean;
  connected: boolean;
  hasActivePrint: boolean;
  onToggleConnection: () => void | Promise<void>;
  onStopPrint: () => void;
  onOpenNotifications:
    () => void;
  onOpenOperations: () => void;
}

function AppHeader({
  isTestMode,
  connected,
  hasActivePrint,
  onToggleConnection,
  onStopPrint,
  onOpenNotifications,
  onOpenOperations,
}: AppHeaderProps) {
  return (
    <header className="app-header flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#1d2938] bg-[#0c151f] px-4">
      <div className="flex min-w-0 items-center">
        <div className="flex items-center gap-2.5 text-slate-100"><span className="grid h-8 w-8 place-items-center rounded-md bg-blue-600 text-white shadow-lg shadow-blue-950"><Hexagon size={18} fill="currentColor" /></span><span className="text-base font-bold">PrintDeck</span><span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">DESKTOP</span></div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenNotifications}
          title="Notification settings"
          className="header-tool"
        >
          <Bell size={15} /><span className="hidden lg:inline">Alerts</span>
        </button>
        <button type="button" onClick={onOpenOperations} className="header-tool"><Settings size={15} /><span className="hidden lg:inline">Settings</span></button>
        <button
          type="button"
          onClick={onToggleConnection}
          disabled={hasActivePrint}
          className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {connected ? <Unplug size={15} /> : <Cable size={15} />}
          {connected
            ? "Disconnect"
            : "Connect USB"}
        </button>

        {hasActivePrint && (
          <button
            type="button"
            onClick={onStopPrint}
            disabled={status === "stopping"}
            className="flex items-center gap-2 rounded bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:bg-red-950 disabled:text-red-800 disabled:cursor-not-allowed"
          >
            <XOctagon size={15} />
            {status === "stopping"
              ? "Stopping..."
              : isTestMode
                ? "Stop Test"
                : "Stop Print"}
          </button>
        )}
      </div>
    </header>
  );
}

export default memo(AppHeader);
