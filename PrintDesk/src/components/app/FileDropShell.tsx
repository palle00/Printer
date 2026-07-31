import { useRef, useState, type DragEvent, type ReactNode } from "react";

interface FileDropShellProps {
  children: ReactNode;
  disabled: boolean;
  onDropFile: (file: File) => void;
}

export default function FileDropShell({
  children,
  disabled,
  onDropFile,
}: FileDropShellProps) {
  const dragDepth = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (disabled) {
      dragDepth.current = 0;
      setIsDraggingFile(false);
      return;
    }

    dragDepth.current += 1;
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDraggingFile(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(event.dataTransfer.files);
    if (!disabled && files.length === 1) onDropFile(files[0]);
  };

  return (
    <div
      className="app-shell relative flex h-dvh flex-col overflow-hidden bg-[#0b0e14] text-gray-300"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-[100] grid place-items-center border-2 border-blue-500 bg-[#0b0e14]/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-blue-300">
            <span className="text-3xl" aria-hidden="true">
              +
            </span>
            <span className="text-sm font-semibold">Drop one G-code file</span>
            <span className="text-xs text-gray-500">G-code, GCO, GC, or G</span>
          </div>
        </div>
      )}
    </div>
  );
}
