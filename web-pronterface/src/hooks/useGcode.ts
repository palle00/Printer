import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  GcodeFileData,
} from "../types/desktop-files";
import type {
  ParsedGcode,
} from "../types/gcode";
import type {
  RecentFileEntry,
} from "../types/settings";
import {
  parseGcodeInWorker,
  type GcodeParseJob,
} from "./parseGcodeInWorker";

const SUPPORTED_FILE_PATTERN =
  /\.(?:gcode|gco|gc|g)$/i;

interface UseGcodeOptions {
  hasActivePrint: boolean;
}

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

export function useGcode({
  hasActivePrint,
}: UseGcodeOptions) {
  const loadGeneration =
    useRef(0);
  const parseJob =
    useRef<GcodeParseJob | null>(
      null,
    );
  const [gcode, setGcode] =
    useState<ParsedGcode | null>(
      null,
    );
  const [recentFiles, setRecentFiles] =
    useState<RecentFileEntry[]>([]);
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [
    staleRecentPath,
    setStaleRecentPath,
  ] = useState<string | null>(null);

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

  useEffect(
    () => () => {
      parseJob.current?.cancel();
    },
    [],
  );

  const confirmReplacement =
    useCallback((): boolean => {
      if (!gcode && !hasActivePrint) {
        return true;
      }

      return window.confirm(
        hasActivePrint
          ? "A print is active. Loading another file will replace the current preview. Continue?"
          : "Loading another file will replace the current preview and its controls. Continue?",
      );
    }, [
      gcode,
      hasActivePrint,
    ]);

  const acceptFile =
    useCallback(
      async (
        file: GcodeFileData,
      ): Promise<void> => {
        const generation =
          ++loadGeneration.current;

        setIsLoading(true);
        setError(null);
        setStaleRecentPath(null);

        try {
          if (!file.text.trim()) {
            throw new Error(
              "The selected G-code file is empty.",
            );
          }

          await new Promise<void>(
            (resolve) => {
              window.setTimeout(
                resolve,
                0,
              );
            },
          );

          parseJob.current?.cancel();
          const job =
            parseGcodeInWorker(
              file.name,
              file.text,
              file.path,
              file.size,
            );
          parseJob.current = job;
          const parsed =
            await job.promise;
          parseJob.current = null;

          if (
            generation !==
            loadGeneration.current
          ) {
            return;
          }

          setGcode(parsed);
          const updated =
            await window.desktop.files
              .markOpened(file.path);

          if (
            generation ===
            loadGeneration.current
          ) {
            setRecentFiles(updated);
          }
        } catch (loadError) {
          if (
            generation ===
            loadGeneration.current
          ) {
            setError(
              getErrorMessage(
                loadError,
              ),
            );
          }
        } finally {
          if (
            generation ===
            loadGeneration.current
          ) {
            setIsLoading(false);
          }
        }
      },
      [],
    );

  const chooseFile =
    useCallback(async () => {
      if (!confirmReplacement()) {
        return;
      }

      setError(null);

      try {
        const file =
          await window.desktop.files
            .chooseGcodeFile();

        if (file) {
          await acceptFile(file);
        }
      } catch (loadError) {
        setError(
          getErrorMessage(loadError),
        );
      }
    }, [
      acceptFile,
      confirmReplacement,
    ]);

  const loadDroppedFile =
    useCallback(
      async (
        file: File,
      ): Promise<void> => {
        if (
          !SUPPORTED_FILE_PATTERN.test(
            file.name,
          )
        ) {
          setError(
            "Drop a G-code, GCO, GC, or G file.",
          );
          return;
        }

        if (!confirmReplacement()) {
          return;
        }

        try {
          const data =
            await window.desktop.files
              .readDroppedFile(file);
          await acceptFile(data);
        } catch (loadError) {
          setError(
            getErrorMessage(
              loadError,
            ),
          );
        }
      },
      [
        acceptFile,
        confirmReplacement,
      ],
    );

  const openRecentFile =
    useCallback(
      async (
        filePath: string,
      ): Promise<void> => {
        if (!confirmReplacement()) {
          return;
        }

        try {
          const data =
            await window.desktop.files
              .openRecentFile(
                filePath,
              );
          await acceptFile(data);
        } catch (loadError) {
          setStaleRecentPath(
            filePath,
          );
          setError(
            getErrorMessage(
              loadError,
            ),
          );
        }
      },
      [
        acceptFile,
        confirmReplacement,
      ],
    );

  const removeRecentFile =
    useCallback(
      async (
        filePath: string,
      ): Promise<void> => {
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
      },
      [],
    );

  const clearRecentFiles =
    useCallback(async () => {
      setRecentFiles(
        await window.desktop.files
          .clearRecent(),
      );
      setStaleRecentPath(null);
    }, []);

  const clearFile =
    useCallback(() => {
      loadGeneration.current++;
      parseJob.current?.cancel();
      parseJob.current = null;
      setGcode(null);
      setIsLoading(false);
      setError(null);
    }, []);

  const clearError =
    useCallback(() => {
      setError(null);
    }, []);

  return {
    gcode,
    recentFiles,
    staleRecentPath,
    isLoading,
    error,
    chooseFile,
    loadDroppedFile,
    openRecentFile,
    removeRecentFile,
    clearRecentFiles,
    clearFile,
    clearError,
  };
}
