import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  NotificationPreferences,
} from "../types/settings";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../types/settings";
import {
  getErrorMessage,
} from "../utils/errors";

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
  const preferencesRef =
    useRef(preferences);
  const saveQueue =
    useRef<Promise<void>>(
      Promise.resolve(),
    );
  const mutationVersion =
    useRef(0);
  const [error, setError] =
    useState<string | null>(null);
  const [isLoading, setIsLoading] =
    useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const versionAtLoad =
      mutationVersion.current;
    setIsLoading(true);

    void saveQueue.current
      .then(() =>
        window.desktop.settings
          .get(),
      )
      .then((settings) => {
        if (
          active &&
          mutationVersion.current ===
            versionAtLoad
        ) {
          preferencesRef.current =
            settings.notifications;
          setPreferences(
            settings.notifications,
          );
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            getErrorMessage(
              loadError,
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
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
    if (isLoading) {
      return;
    }

    const previous =
      preferencesRef.current;
    const next = {
      ...previous,
      [key]: value,
    };
    const version =
      ++mutationVersion.current;

    preferencesRef.current = next;
    setPreferences(next);
    setError(null);

    const operation =
      saveQueue.current.then(
        () =>
          window.desktop.settings
            .updateNotifications({
              [key]: value,
            }),
      );
    saveQueue.current =
      operation.then(
        () => undefined,
        () => undefined,
      );

    void operation
      .then((savedPreferences) => {
        if (
          version ===
          mutationVersion.current
        ) {
          preferencesRef.current =
            savedPreferences;
          setPreferences(
            savedPreferences,
          );
        }
      })
      .catch((saveError) => {
        if (
          version ===
          mutationVersion.current
        ) {
          preferencesRef.current =
            previous;
          setPreferences(previous);
          setError(
            getErrorMessage(
              saveError,
            ),
          );
        }
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
            disabled={isLoading}
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
                    isLoading ||
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
