import type { ReactNode } from "react";

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="panel-surface p-4">
      <h2 className="panel-title mb-3">
        {title}
      </h2>

      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div>{label}</div>

      <div className="text-white mt-1">
        {value}
      </div>
    </div>
  );
}

export function ControlButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="bg-[#181d2c] border border-gray-800 rounded p-2.5 text-xs font-bold text-gray-300 hover:bg-gray-800 disabled:text-gray-700 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
