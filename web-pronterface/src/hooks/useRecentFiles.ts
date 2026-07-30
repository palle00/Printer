import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  RecentFileEntry,
} from "../types/settings";
import {
  getErrorMessage,
} from "../utils/errors";

export function useRecentFiles() {
  const [recentFiles, setRecentFiles] =
    useState<RecentFileEntry[]>([]);
  const [
    staleRecentPath,
    setStaleRecentPath,
  ] = useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void window.desktop.settings
      .get()
      .then((settings) => {
        if (active) {
          setRecentFiles(
            settings.recentFiles,
          );
        }
      })
      .catch((settingsError) => {
        if (active) {
          setError(
            getErrorMessage(
              settingsError,
            ),
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const markOpened =
    useCallback(
      async (
        filePath: string,
      ): Promise<void> => {
        try {
          const updated =
            await window.desktop.files
              .markOpened(filePath);
          setRecentFiles(updated);
          setStaleRecentPath(null);
          setError(null);
        } catch (markError) {
          setError(
            getErrorMessage(markError),
          );
        }
      },
      [],
    );

  const reportOpenError =
    useCallback(
      (
        filePath: string,
        openError: unknown,
      ): void => {
        setStaleRecentPath(filePath);
        setError(
          getErrorMessage(openError),
        );
      },
      [],
    );

  const removeRecentFile =
    useCallback(
      async (
        filePath: string,
      ): Promise<void> => {
        setError(null);

        try {
          const updated =
            await window.desktop.files
              .removeRecent(filePath);
          setRecentFiles(updated);
          setStaleRecentPath(
            (current) =>
              current === filePath
                ? null
                : current,
          );
        } catch (removeError) {
          setError(
            getErrorMessage(
              removeError,
            ),
          );
        }
      },
      [],
    );

  const clearRecentFiles =
    useCallback(async (): Promise<void> => {
      setError(null);

      try {
        const updated =
          await window.desktop.files
            .clearRecent();
        setRecentFiles(updated);
        setStaleRecentPath(null);
      } catch (clearError) {
        setError(
          getErrorMessage(clearError),
        );
      }
    }, []);

  const clearStalePath =
    useCallback((): void => {
      setStaleRecentPath(null);
    }, []);

  const clearError =
    useCallback((): void => {
      setError(null);
    }, []);

  return {
    recentFiles,
    staleRecentPath,
    error,
    markOpened,
    reportOpenError,
    removeRecentFile,
    clearRecentFiles,
    clearStalePath,
    clearError,
  };
}
