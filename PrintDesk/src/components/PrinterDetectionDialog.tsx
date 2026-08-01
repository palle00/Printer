import { useEffect, useState } from "react";

import type { DetectedPrinter } from "../printer/firmwareDetection";
import type { PrinterProfile } from "../types/operations";
import { useModalDialog } from "../hooks/useModalDialog";

export interface PrinterDetectionReview {
  detected: DetectedPrinter;
  path: string;
  baudRate: number;
}

interface PrinterDetectionDialogProps {
  review: PrinterDetectionReview | null;
  onSave(profile: PrinterProfile): void;
  onDismiss(identityKey: string): void;
}

interface DimensionFieldProps {
  label: string;
  value: number;
  onChange(value: number): void;
}

function DimensionField({ label, value, onChange }: DimensionFieldProps) {
  return (
    <label className="text-xs text-gray-400">
      {label} (mm)
      <input
        type="number"
        min="1"
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className="mt-1 w-full border border-gray-700 bg-black px-3 py-2 font-mono text-white"
      />
    </label>
  );
}

function isValidDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export default function PrinterDetectionDialog({
  review,
  onSave,
  onDismiss,
}: PrinterDetectionDialogProps) {
  const dialogRef = useModalDialog<HTMLElement>(review !== null, () => {
    if (review) onDismiss(review.detected.identityKey);
  });
  const [name, setName] = useState("");
  const [width, setWidth] = useState(220);
  const [depth, setDepth] = useState(220);
  const [height, setHeight] = useState(250);

  useEffect(() => {
    if (!review) return;
    setName(review.detected.displayName);
    setWidth(review.detected.suggestedBedWidthMm);
    setDepth(review.detected.suggestedBedDepthMm);
    setHeight(review.detected.suggestedMaximumHeightMm);
  }, [review]);

  if (!review) return null;

  const { detected } = review;
  const dimensionsAreValid = [width, depth, height].every(isValidDimension);
  const save = (): void => {
    if (!dimensionsAreValid) return;
    onSave({
      id: crypto.randomUUID(),
      name: name.trim() || detected.displayName,
      firmware: detected.firmware,
      bedWidthMm: width,
      bedDepthMm: depth,
      maximumHeightMm: height,
      maximumHotendCelsius: 300,
      maximumBedCelsius: 120,
      baudRate: review.baudRate,
      preferredPort: review.path,
      usbSerialNumber: detected.usbSerialNumber,
      identityKey: detected.identityKey,
    });
  };

  return (
    <div className="absolute inset-0 z-[98] grid place-items-center bg-black/80 p-4">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detected-printer-title"
        className="w-full max-w-xl border border-gray-700 bg-[#121620] shadow-2xl"
      >
        <header className="border-b border-gray-800 px-5 py-4">
          <h2 id="detected-printer-title" className="text-sm font-bold text-white">
            New printer detected
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Review the detected information before creating a profile.
          </p>
        </header>
        <div className="space-y-4 p-5">
          <div className="grid gap-2 border border-gray-800 bg-[#0f131d] p-3 text-xs sm:grid-cols-2">
            <span className="text-gray-500">Firmware</span>
            <span className="font-mono text-gray-200">
              {detected.firmwareName}
              {detected.firmwareVersion ? ` ${detected.firmwareVersion}` : ""}
            </span>
            <span className="text-gray-500">Machine</span>
            <span className="font-mono text-gray-200">
              {detected.machineType ?? "Not reported"}
            </span>
            <span className="text-gray-500">USB identity</span>
            <span className="truncate font-mono text-gray-200">
              {detected.usbSerialNumber ?? "Not reported"}
            </span>
          </div>
          <label className="block text-xs text-gray-400">
            Profile name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full border border-gray-700 bg-black px-3 py-2 text-white"
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <DimensionField label="Bed width" value={width} onChange={setWidth} />
            <DimensionField label="Bed depth" value={depth} onChange={setDepth} />
            <DimensionField label="Build height" value={height} onChange={setHeight} />
          </div>
          {detected.dimensionsSource === "default" && (
            <p className="border border-yellow-900 bg-yellow-950/20 p-3 text-xs text-yellow-300">
              This firmware does not report bed dimensions. Check these defaults against
              the printer before printing.
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t border-gray-800 bg-[#0f131d] px-5 py-4">
          <button
            type="button"
            onClick={() => onDismiss(detected.identityKey)}
            className="px-4 py-2 text-xs text-gray-400"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dimensionsAreValid}
            className="bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:bg-gray-800"
          >
            Add printer profile
          </button>
        </footer>
      </section>
    </div>
  );
}
