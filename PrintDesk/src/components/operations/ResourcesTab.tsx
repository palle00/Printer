import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";

import type {
  FilamentSpool,
  MaintenanceTask,
  OperationsSettings,
} from "../../types/operations";

interface ResourcesTabProps {
  settings: OperationsSettings;
  onChange(create: (current: OperationsSettings) => OperationsSettings): void;
}

interface SpoolCardProps {
  spool: FilamentSpool;
  active: boolean;
  pendingDelete: boolean;
  onChange(update: Partial<FilamentSpool>): void;
  onUse(): void;
  onDelete(): void;
  onCancelDelete(): void;
}

function SpoolCard({
  spool,
  active,
  pendingDelete,
  onChange,
  onUse,
  onDelete,
  onCancelDelete,
}: SpoolCardProps) {
  return (
    <article className={`border p-3 ${active ? "border-blue-500" : "border-gray-800"}`}>
      <div className="flex items-start gap-3">
        <input
          type="color"
          aria-label={`${spool.name} color`}
          value={spool.color}
          onChange={(event) => onChange({ color: event.target.value })}
          className="h-9 w-9 shrink-0 bg-transparent"
        />
        <div className="min-w-0 flex-1">
          <input
            value={spool.name}
            aria-label="Spool name"
            onChange={(event) => onChange({ name: event.target.value })}
            className="w-full bg-transparent text-sm font-bold text-white outline-none"
          />
          <input
            value={spool.material}
            aria-label="Filament material"
            onChange={(event) => onChange({ material: event.target.value })}
            className="mt-0.5 w-full bg-transparent text-xs text-gray-500 outline-none"
          />
        </div>
        {!active && !pendingDelete && (
          <button type="button" onClick={onUse} className="text-xs text-blue-400">
            Use
          </button>
        )}
        {pendingDelete ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Confirm deleting ${spool.name}`}
              title="Confirm delete"
              className="grid h-7 w-7 place-items-center text-red-400 hover:bg-red-950/40"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              aria-label="Cancel deletion"
              title="Cancel"
              className="grid h-7 w-7 place-items-center text-gray-500 hover:bg-gray-800"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${spool.name}`}
            title="Delete filament"
            className="grid h-7 w-7 place-items-center text-gray-600 hover:bg-red-950/30 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <label className="mt-3 block text-[10px] text-gray-500">
        Remaining grams
        <input
          type="number"
          min="0"
          value={Number.isFinite(spool.remainingGrams) ? spool.remainingGrams : ""}
          onChange={(event) => {
            if (Number.isFinite(event.target.valueAsNumber)) {
              onChange({ remainingGrams: Math.max(0, event.target.valueAsNumber) });
            }
          }}
          className="mt-1 w-full border border-gray-800 bg-black px-2 py-1.5 font-mono text-gray-200"
        />
      </label>
    </article>
  );
}

interface MaintenanceItemProps {
  task: MaintenanceTask;
  pendingDelete: boolean;
  onComplete(): void;
  onDelete(): void;
  onCancelDelete(): void;
}

function MaintenanceItem({
  task,
  pendingDelete,
  onComplete,
  onDelete,
  onCancelDelete,
}: MaintenanceItemProps) {
  const due = task.completedPrintHours >= task.intervalHours;
  return (
    <article className="flex items-center gap-4 border border-gray-800 bg-[#181d2c] p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-200">{task.name}</p>
        <p className={`text-[10px] ${due ? "text-yellow-400" : "text-gray-600"}`}>
          {task.completedPrintHours.toFixed(1)} / {task.intervalHours} print hours
        </p>
      </div>
      <button type="button" onClick={onComplete} className="text-xs text-blue-400">
        Mark complete
      </button>
      {pendingDelete ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Confirm deleting ${task.name}`}
            title="Confirm delete"
            className="grid h-7 w-7 place-items-center text-red-400 hover:bg-red-950/40"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            aria-label="Cancel deletion"
            title="Cancel"
            className="grid h-7 w-7 place-items-center text-gray-500 hover:bg-gray-800"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${task.name}`}
          title="Delete maintenance item"
          className="grid h-7 w-7 place-items-center text-gray-600 hover:bg-red-950/30 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      )}
    </article>
  );
}

interface AddMaintenanceFormProps {
  onAdd(name: string, intervalHours: number): void;
  onCancel(): void;
}

function AddMaintenanceForm({ onAdd, onCancel }: AddMaintenanceFormProps) {
  const [name, setName] = useState("");
  const [intervalHours, setIntervalHours] = useState(100);
  const canAdd = name.trim().length > 0 && Number.isFinite(intervalHours) && intervalHours > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canAdd) onAdd(name.trim(), intervalHours);
      }}
      className="mb-3 grid gap-3 border-y border-gray-800 py-3 sm:grid-cols-[1fr_9rem_auto]"
    >
      <label className="text-[10px] text-gray-500">
        Maintenance item
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Clean build plate"
          className="mt-1 w-full border border-gray-800 bg-black px-2 py-1.5 text-xs text-gray-200"
        />
      </label>
      <label className="text-[10px] text-gray-500">
        Interval (print hours)
        <input
          type="number"
          min="1"
          value={Number.isFinite(intervalHours) ? intervalHours : ""}
          onChange={(event) => setIntervalHours(event.target.valueAsNumber)}
          className="mt-1 w-full border border-gray-800 bg-black px-2 py-1.5 font-mono text-xs text-gray-200"
        />
      </label>
      <div className="flex items-end gap-1">
        <button
          type="submit"
          disabled={!canAdd}
          className="grid h-8 w-8 place-items-center bg-blue-600 text-white disabled:bg-gray-800 disabled:text-gray-600"
          aria-label="Add maintenance item"
          title="Add"
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-8 w-8 place-items-center text-gray-500 hover:bg-gray-800"
          aria-label="Cancel adding maintenance item"
          title="Cancel"
        >
          <X size={15} />
        </button>
      </div>
    </form>
  );
}

export default function ResourcesTab({ settings, onChange }: ResourcesTabProps) {
  const [spoolPendingDelete, setSpoolPendingDelete] = useState<string | null>(null);
  const [maintenancePendingDelete, setMaintenancePendingDelete] = useState<string | null>(null);
  const [addingMaintenance, setAddingMaintenance] = useState(false);

  const updateSpool = (spoolId: string, update: Partial<FilamentSpool>): void => {
    onChange((current) => ({
      ...current,
      spools: current.spools.map((spool) =>
        spool.id === spoolId ? { ...spool, ...update } : spool,
      ),
    }));
  };

  const deleteSpool = (spoolId: string): void => {
    if (spoolPendingDelete !== spoolId) {
      setSpoolPendingDelete(spoolId);
      return;
    }
    onChange((current) => ({
      ...current,
      activeSpoolId: current.activeSpoolId === spoolId ? null : current.activeSpoolId,
      spools: current.spools.filter((spool) => spool.id !== spoolId),
    }));
    setSpoolPendingDelete(null);
  };

  const deleteMaintenance = (taskId: string): void => {
    if (maintenancePendingDelete !== taskId) {
      setMaintenancePendingDelete(taskId);
      return;
    }
    onChange((current) => ({
      ...current,
      maintenance: current.maintenance.filter((task) => task.id !== taskId),
    }));
    setMaintenancePendingDelete(null);
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-gray-400">Filament inventory</h3>
          <button
            type="button"
            onClick={() =>
              onChange((current) => {
                const id = crypto.randomUUID();
                return {
                  ...current,
                  activeSpoolId: id,
                  spools: [
                    ...current.spools,
                    {
                      id,
                      name: "New spool",
                      material: "PLA",
                      color: "#38bdf8",
                      remainingGrams: 1000,
                      costPerKilogram: null,
                      driedAt: null,
                    },
                  ],
                };
              })
            }
            className="flex items-center gap-1 text-xs text-blue-400"
          >
            <Plus size={13} /> Add spool
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {settings.spools.map((spool) => (
            <SpoolCard
              key={spool.id}
              spool={spool}
              active={settings.activeSpoolId === spool.id}
              pendingDelete={spoolPendingDelete === spool.id}
              onChange={(update) => updateSpool(spool.id, update)}
              onUse={() => onChange((current) => ({ ...current, activeSpoolId: spool.id }))}
              onDelete={() => deleteSpool(spool.id)}
              onCancelDelete={() => setSpoolPendingDelete(null)}
            />
          ))}
        </div>
        {settings.spools.length === 0 && (
          <p className="text-xs text-gray-600">No spools have been added.</p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-gray-400">Maintenance</h3>
          <button
            type="button"
            onClick={() => setAddingMaintenance(true)}
            disabled={addingMaintenance}
            className="flex items-center gap-1 text-xs text-blue-400 disabled:text-gray-600"
          >
            <Plus size={13} /> Add item
          </button>
        </div>
        {addingMaintenance && (
          <AddMaintenanceForm
            onCancel={() => setAddingMaintenance(false)}
            onAdd={(name, intervalHours) => {
              onChange((current) => ({
                ...current,
                maintenance: [
                  ...current.maintenance,
                  {
                    id: crypto.randomUUID(),
                    name,
                    intervalHours,
                    completedPrintHours: 0,
                    lastCompletedAt: null,
                  },
                ],
              }));
              setAddingMaintenance(false);
            }}
          />
        )}
        <div className="space-y-2">
          {settings.maintenance.map((task) => (
            <MaintenanceItem
              key={task.id}
              task={task}
              pendingDelete={maintenancePendingDelete === task.id}
              onComplete={() =>
                onChange((current) => ({
                  ...current,
                  maintenance: current.maintenance.map((item) =>
                    item.id === task.id
                      ? { ...item, completedPrintHours: 0, lastCompletedAt: Date.now() }
                      : item,
                  ),
                }))
              }
              onDelete={() => deleteMaintenance(task.id)}
              onCancelDelete={() => setMaintenancePendingDelete(null)}
            />
          ))}
        </div>
        {settings.maintenance.length === 0 && !addingMaintenance && (
          <p className="text-xs text-gray-600">No maintenance items have been added.</p>
        )}
      </section>
    </div>
  );
}
