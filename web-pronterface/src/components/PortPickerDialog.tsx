import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  NativeSerialPortInfo,
} from "../types/printer-ipc";

interface PortPickerDialogProps {
  open: boolean;
  onClose(): void;
  onConnect(path: string): Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function getPortDescription(
  port: NativeSerialPortInfo,
): string {
  return port.manufacturer?.trim() ||
    "USB serial device";
}

function getUsbIdentifier(
  port: NativeSerialPortInfo,
): string | null {
  if (port.vendorId && port.productId) {
    return `VID ${port.vendorId} / PID ${port.productId}`;
  }

  return port.serialNumber
    ? `Serial ${port.serialNumber}`
    : null;
}

export default function PortPickerDialog({
  open,
  onClose,
  onConnect,
}: PortPickerDialogProps) {
  const dialogRef =
    useRef<HTMLElement>(null);
  const [ports, setPorts] =
    useState<NativeSerialPortInfo[]>([]);
  const [selectedPath, setSelectedPath] =
    useState<string | null>(null);
  const [isLoading, setIsLoading] =
    useState(false);
  const [isConnecting, setIsConnecting] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const refreshPorts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextPorts =
        await window.desktop.printer.listPorts();

      setPorts(nextPorts);
      setSelectedPath((currentPath) => {
        if (
          currentPath &&
          nextPorts.some(
            (port) => port.path === currentPath,
          )
        ) {
          return currentPath;
        }

        return nextPorts[0]?.path ?? null;
      });
    } catch (loadError) {
      setPorts([]);
      setSelectedPath(null);
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsConnecting(false);
    void refreshPorts();
    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
  }, [open, refreshPorts]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isConnecting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConnecting, onClose, open]);

  if (!open) {
    return null;
  }

  const connect = async (): Promise<void> => {
    if (!selectedPath || isConnecting) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      await onConnect(selectedPath);
      onClose();
    } catch (connectionError) {
      setError(getErrorMessage(connectionError));
      setIsConnecting(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-[95] grid place-items-center bg-black/75 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !isConnecting
        ) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="port-picker-title"
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-gray-700 bg-[#121620] shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2
              id="port-picker-title"
              className="text-sm font-bold text-white"
            >
              Connect USB printer
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Select a detected serial port
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-gray-500">
              115200 baud
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={isConnecting}
              aria-label="Close port picker"
              className="h-7 w-7 text-lg text-gray-500 hover:text-white disabled:cursor-not-allowed disabled:text-gray-700"
            >
              x
            </button>
          </div>
        </header>

        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-400">
              Serial ports
            </span>
            <button
              type="button"
              onClick={() => void refreshPorts()}
              disabled={isLoading || isConnecting}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 disabled:cursor-not-allowed disabled:text-gray-600"
            >
              {isLoading ? "Scanning..." : "Refresh"}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-800">
            {isLoading && ports.length === 0 ? (
              <div className="grid min-h-32 place-items-center text-xs text-gray-500">
                Scanning serial ports...
              </div>
            ) : ports.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-6 text-center">
                <span className="text-sm font-semibold text-gray-300">
                  No serial ports found
                </span>
                <span className="text-xs text-gray-500">
                  Connect the printer by USB and refresh.
                </span>
              </div>
            ) : (
              ports.map((port) => {
                const selected =
                  port.path === selectedPath;
                const usbIdentifier =
                  getUsbIdentifier(port);

                return (
                  <label
                    key={port.path}
                    className={`flex cursor-pointer items-center gap-4 border-b border-gray-800 px-4 py-3 last:border-b-0 ${
                      selected
                        ? "bg-blue-950/50"
                        : "bg-[#0f131d] hover:bg-[#181d2c]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="serial-port"
                      value={port.path}
                      checked={selected}
                      onChange={() =>
                        setSelectedPath(port.path)
                      }
                      className="accent-blue-500"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-bold text-gray-100">
                        {port.path}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-gray-400">
                        {getPortDescription(port)}
                      </span>
                    </span>

                    {usbIdentifier && (
                      <span className="hidden shrink-0 font-mono text-[11px] text-gray-500 sm:block">
                        {usbIdentifier}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 text-xs text-red-400"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-800 bg-[#0f131d] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isConnecting}
            className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white disabled:cursor-not-allowed disabled:text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={
              !selectedPath ||
              isLoading ||
              isConnecting
            }
            className="min-w-28 rounded bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        </footer>
      </section>
    </div>
  );
}
