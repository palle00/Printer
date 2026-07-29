interface ErrorBannerProps {
  error: string | null;
  onClear?: () => void;
}

export default function ErrorBanner({
  error,
  onClear,
}: ErrorBannerProps) {
  if (!error) {
    return null;
  }

  return (
    <div className="mx-4 mt-4 bg-red-950/40 border border-red-900 text-red-300 rounded px-4 py-3 text-sm flex justify-between gap-4">
      <span>{error}</span>

      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-red-400 hover:text-white"
        >
          ×
        </button>
      )}
    </div>
  );
}