import {
  memo,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Panel } from "./common/Panel";

interface TerminalPanelProps {
  lines: string[];
  connected: boolean;
  hasActivePrint: boolean;
  sendGcode: (gcode: string) => void;
  clearTerminal: () => void;
}

function TerminalPanel({
  lines,
  connected,
  hasActivePrint,
  sendGcode,
  clearTerminal,
}: TerminalPanelProps) {
  const terminalRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [command, setCommand] =
    useState("");

  const disabled =
    !connected || hasActivePrint;

  useEffect(() => {
    const terminal =
      terminalRef.current;

    if (terminal) {
      terminal.scrollTop =
        terminal.scrollHeight;
    }
  }, [lines]);

  const submitCommand = (
    event: FormEvent,
  ) => {
    event.preventDefault();

    const value = command.trim();

    if (!value) {
      return;
    }

    sendGcode(value);
    setCommand("");
  };

  return (
    <Panel title="Terminal">
      <div
        ref={terminalRef}
        className="h-[clamp(8rem,28vh,20rem)] bg-black rounded p-3 overflow-y-auto font-mono text-xs text-green-400 mb-3 border border-gray-900"
      >
        {lines.length === 0 ? (
          <span className="text-gray-700">
            // no messages
          </span>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {lines.join("\n")}
          </div>
        )}
      </div>

      <form
        onSubmit={submitCommand}
        className="flex gap-2"
      >
        <input
          type="text"
          value={command}
          onChange={(event) =>
            setCommand(
              event.target.value,
            )
          }
          disabled={disabled}
          placeholder="G-code command"
          className="flex-1 min-w-0 bg-[#181d2c] border border-gray-800 rounded px-3 py-2 text-xs text-white uppercase font-mono disabled:text-gray-700"
        />

        <button
          type="submit"
          disabled={disabled}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 px-4 rounded text-xs font-bold text-white"
        >
          Send
        </button>
      </form>

      <button
        type="button"
        onClick={clearTerminal}
        className="w-full mt-2 py-2 text-[10px] text-gray-500 hover:text-gray-300"
      >
        Clear terminal
      </button>
    </Panel>
  );
}

export default memo(TerminalPanel);
