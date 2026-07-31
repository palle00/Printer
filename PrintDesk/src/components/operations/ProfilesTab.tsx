import type { OperationsSettings, PrinterProfile } from "../../types/operations";

interface Props { settings: OperationsSettings; onChange(create: (current: OperationsSettings) => OperationsSettings): void }
const numericFields: Array<[keyof PrinterProfile, string]> = [["bedWidthMm", "Bed width (mm)"], ["bedDepthMm", "Bed depth (mm)"], ["maximumHeightMm", "Build height (mm)"], ["maximumHotendCelsius", "Max hotend (C)"], ["maximumBedCelsius", "Max bed (C)"], ["baudRate", "Baud rate"]];

export default function ProfilesTab({ settings, onChange }: Props) {
  const profile = settings.profiles.find((item) => item.id === settings.activeProfileId) ?? settings.profiles[0];
  const patch = (update: Partial<PrinterProfile>) => onChange((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === profile.id ? { ...item, ...update } : item) }));
  const add = () => onChange((current) => { const id = crypto.randomUUID(); return { ...current, activeProfileId: id, profiles: [...current.profiles, { ...profile, id, name: `Printer ${current.profiles.length + 1}`, preferredPort: null, usbSerialNumber: null, identityKey: null }] }; });
  return <div className="grid gap-6 md:grid-cols-[240px_1fr]">
    <aside><div className="space-y-2">{settings.profiles.map((item) => <button key={item.id} type="button" onClick={() => onChange((current) => ({ ...current, activeProfileId: item.id }))} className={`w-full border px-3 py-3 text-left text-xs ${item.id === profile.id ? "border-blue-500 bg-blue-950/30 text-white" : "border-gray-800 bg-[#181d2c] text-gray-400"}`}>{item.name}<span className="mt-1 block font-mono text-[10px] text-gray-600">{item.firmware} / {item.baudRate}</span></button>)}</div><button type="button" onClick={add} className="mt-3 w-full border border-gray-700 py-2 text-xs text-blue-400">Add printer</button></aside>
    <div className="grid content-start gap-4 sm:grid-cols-2">
      <label className="text-xs text-gray-400 sm:col-span-2">Profile name<input value={profile.name} onChange={(e) => patch({ name: e.target.value })} className="mt-1 block w-full border border-gray-700 bg-black px-3 py-2 text-white" /></label>
      <label className="text-xs text-gray-400">Firmware<select value={profile.firmware} onChange={(e) => patch({ firmware: e.target.value as PrinterProfile["firmware"] })} className="mt-1 block w-full border border-gray-700 bg-black px-3 py-2 text-white"><option value="marlin">Marlin</option><option value="klipper">Klipper</option><option value="reprap">RepRapFirmware</option><option value="generic">Generic</option></select></label>
      {numericFields.map(([field, label]) => <label key={field} className="text-xs text-gray-400">{label}<input type="number" min="1" value={String(profile[field] ?? "")} onChange={(e) => patch({ [field]: Number(e.target.value) })} className="mt-1 block w-full border border-gray-700 bg-black px-3 py-2 font-mono text-white" /></label>)}
      {settings.profiles.length > 1 && <button type="button" onClick={() => onChange((current) => { const profiles = current.profiles.filter((item) => item.id !== profile.id); return { ...current, profiles, activeProfileId: profiles[0].id }; })} className="text-left text-xs text-red-400">Delete this profile</button>}
    </div>
  </div>;
}
