import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Check, MoreVertical, Send } from "lucide-react";

import {
  classifyConsoleLine,
  shouldShowConsoleLine,
  type ConsoleDetailLevel,
  type ConsoleLineKind,
} from "../utils/terminalLines";

interface TerminalPanelProps {
  lines: string[];
  connected: boolean;
  hasActivePrint: boolean;
  sendGcode: (gcode: string) => void;
  clearTerminal: () => void;
}

const DETAIL_LEVELS: Array<{
  value: ConsoleDetailLevel;
  label: string;
  description: string;
}> = [
  { value: "essential", label: "Essential", description: "Status, warnings, and errors" },
  { value: "standard", label: "Standard", description: "Commands and useful responses" },
  { value: "all", label: "All messages", description: "Include acknowledgements and telemetry" },
];

const LINE_COLORS: Record<ConsoleLineKind, string> = {
  command: "text-slate-200",
  error: "text-red-400",
  response: "text-slate-400",
  routine: "text-slate-600",
  system: "text-emerald-400",
  warning: "text-amber-400",
};

const DETAIL_STORAGE_KEY = "printdeck.consoleDetailLevel";

function getInitialDetailLevel(): ConsoleDetailLevel {
  const saved = window.localStorage.getItem(DETAIL_STORAGE_KEY);
  return saved === "essential" || saved === "all" ? saved : "standard";
}

function TerminalPanel({
  lines,
  connected,
  hasActivePrint,
  sendGcode,
  clearTerminal,
}: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [command, setCommand] = useState("");
  const [detailLevel, setDetailLevel] =
    useState<ConsoleDetailLevel>(getInitialDetailLevel);
  const [menuOpen, setMenuOpen] = useState(false);
  const disabled = !connected || hasActivePrint;
  const visibleLines = useMemo(
    () =>
      lines
        .map(classifyConsoleLine)
        .filter((line) => shouldShowConsoleLine(line, detailLevel)),
    [detailLevel, lines],
  );

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) terminal.scrollTop = terminal.scrollHeight;
  }, [visibleLines]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", closeMenu);
    return () => window.removeEventListener("mousedown", closeMenu);
  }, [menuOpen]);

  const selectDetailLevel = (value: ConsoleDetailLevel): void => {
    setDetailLevel(value);
    window.localStorage.setItem(DETAIL_STORAGE_KEY, value);
    setMenuOpen(false);
  };

  const submitCommand = (event: FormEvent): void => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    sendGcode(value);
    setCommand("");
  };

  return (
    <section className="panel-surface shrink-0 overflow-visible">
      <header className="flex items-center border-b border-[#1d2a3a] px-3 py-2.5">
        <h2 className="text-xs font-semibold text-slate-200">Console</h2>
        <span className="ml-2 text-[9px] text-slate-600">
          {DETAIL_LEVELS.find((option) => option.value === detailLevel)?.label}
        </span>
        <button
          type="button"
          onClick={clearTerminal}
          className="ml-auto text-[10px] text-slate-500 hover:text-white"
        >
          Clear
        </button>
        <div ref={menuRef} className="relative ml-1">
          <button
            type="button"
            aria-label="Console display options"
            title="Console display options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-[#172332] hover:text-white"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-30 w-56 overflow-hidden rounded border border-[#263548] bg-[#101923] py-1 shadow-xl">
              <div className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase text-slate-500">
                Message detail
              </div>
              {DETAIL_LEVELS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectDetailLevel(option.value)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#172332]"
                >
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center text-blue-400">
                    {detailLevel === option.value && <Check size={13} />}
                  </span>
                  <span>
                    <span className="block text-[10px] text-slate-200">{option.label}</span>
                    <span className="block text-[9px] text-slate-500">{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div
        ref={terminalRef}
        className="h-[clamp(9rem,25vh,16rem)] overflow-y-auto bg-[#081018] p-3 font-mono text-[10px] leading-relaxed"
      >
        {visibleLines.length === 0 ? (
          <span className="text-gray-700">
            {lines.length === 0 ? "// no messages" : "// no messages at this detail level"}
          </span>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {visibleLines.map((line, index) => (
              <div key={`${lines.length - visibleLines.length + index}-${line.text}`} className={LINE_COLORS[line.kind]}>
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submitCommand} className="flex gap-2 border-t border-[#1d2a3a] p-2">
        <input
          type="text"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          disabled={disabled}
          placeholder="Send code..."
          className="min-w-0 flex-1 rounded border border-[#263548] bg-[#111d29] px-3 py-2 font-mono text-[10px] text-white disabled:text-gray-700"
        />
        <button
          type="submit"
          disabled={disabled}
          aria-label="Send G-code"
          title="Send G-code"
          className="grid w-9 place-items-center rounded bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600"
        >
          <Send size={14} />
        </button>
      </form>
    </section>
  );
}

export default memo(TerminalPanel);
