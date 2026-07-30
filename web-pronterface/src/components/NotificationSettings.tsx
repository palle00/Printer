import {
  useEffect,
  useState,
} from "react";

import type {
  NotificationPreferences,
} from "../types/settings";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../types/settings";

interface NotificationSettingsProps {
  open: boolean;
  onClose(): void;
}

const OPTIONS: ReadonlyArray<{
  key:
    Exclude<
      keyof NotificationPreferences,
      "enabled"
    >;
  label: string;
}> = [
  {
    key: "printStarted",
    label: "Print started",
  },
  {
    key: "printPaused",
    label: "Print paused or resumed",
  },
  {
    key: "printCompleted",
    label: "Print completed",
  },
  {
    key: "printStopped",
    label: "Print stopped",
  },
  {
    key: "printerDisconnected",
    label: "Unexpected disconnection",
  },
  {
    key: "printerErrors",
    label: "Printer errors",
  },
  {
    key: "temperatureReached",
    label: "Target temperature reached",
  },
];

export default function NotificationSettings({
  open,
  onClose,
}: NotificationSettingsProps) {
  const [
    preferences,
    setPreferences,
  ] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    void window.desktop.settings
      .get()
      .then((settings) => {
        if (active) {
          setPreferences(
            settings.notifications,
          );
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : String(loadError),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const update = (
    key: keyof NotificationPreferences,
    value: boolean,
  ): void => {
    const previous = preferences;
    setPreferences({
      ...preferences,
      [key]: value,
    });
    setError(null);

    void window.desktop.settings
      .updateNotifications({
        [key]: value,
      })
      .then(setPreferences)
      .catch((saveError) => {
        setPreferences(previous);
        setError(
          saveError instanceof Error
            ? saveError.message
            : String(saveError),
        );
      });
  };

  return (
    <div
      className="absolute inset-0 z-[90] grid place-items-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-settings-title"
        className="w-full max-w-sm rounded-lg border border-gray-700 bg-[#121620] p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="notification-settings-title"
            className="text-xs font-bold uppercase text-gray-300"
          >
            Desktop notifications
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification settings"
            className="px-2 py-1 text-lg text-gray-500 hover:text-white"
          >
            ×
          </button>
        </div>

        <label className="mb-3 flex items-center justify-between border-b border-gray-800 pb-3 text-xs font-semibold text-gray-200">
          Enable notifications
          <input
            type="checkbox"
            checked={preferences.enabled}
            onChange={(event) =>
              update(
                "enabled",
                event.target.checked,
              )
            }
          />
        </label>

        <div className="space-y-2">
          {OPTIONS.map(
            ({ key, label }) => (
              <label
                key={key}
                className="flex items-center justify-between text-xs text-gray-400"
              >
                {label}
                <input
                  type="checkbox"
                  disabled={
                    !preferences.enabled
                  }
                  checked={
                    preferences[key]
                  }
                  onChange={(event) =>
                    update(
                      key,
                      event.target
                        .checked,
                    )
                  }
                />
              </label>
            ),
          )}
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
