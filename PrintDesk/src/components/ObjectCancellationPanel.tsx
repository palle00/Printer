import type { CancelableGcodeObject, ObjectCancellationProtocol } from "../types/gcode";

interface Props {
  objects: CancelableGcodeObject[];
  protocol: ObjectCancellationProtocol;
  cancelledIds: string[];
  disabled: boolean;
  onCancel(protocol: ObjectCancellationProtocol, objectId: string): void;
}

export default function ObjectCancellationPanel({ objects, protocol, cancelledIds, disabled, onCancel }: Props) {
  return <details className="mb-3 border border-gray-800 bg-[#0f131d]">
    <summary className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase text-gray-400">Objects ({objects.length - cancelledIds.length} active)</summary>
    <div className="max-h-40 space-y-1 overflow-y-auto border-t border-gray-800 p-2">
      {objects.map((object) => { const cancelled = cancelledIds.includes(object.id); return <div key={object.id} className="flex items-center gap-2 px-2 py-1.5 text-xs"><span className={`min-w-0 flex-1 truncate ${cancelled ? "text-gray-700 line-through" : "text-gray-300"}`}>{object.name}</span><button type="button" disabled={disabled || cancelled} onClick={() => { if (window.confirm(`Cancel ${object.name}? This cannot be undone.`)) onCancel(protocol, object.id); }} className="text-[10px] font-bold uppercase text-red-400 disabled:text-gray-700">{cancelled ? "Cancelled" : "Cancel"}</button></div>; })}
    </div>
  </details>;
}
