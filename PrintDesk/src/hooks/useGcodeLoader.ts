import {
  useCallback,
  useState,
} from "react";

import {
  getErrorMessage,
} from "../utils/errors";
import {
  ACTIVE_PRINT_FILE_ERROR,
  useParsedGcode,
} from "./useParsedGcode";

const SUPPORTED_FILE_PATTERN =
  /\.(?:gcode|gco|gc|g)$/i;

interface UseGcodeLoaderOptions {
  hasActivePrint: boolean;
  onFileOpened(
    filePath: string,
  ): Promise<void>;
  onRecentFileError(
    filePath: string,
    error: unknown,
  ): void;
  onLoadStarted(): void;
}

export function useGcodeLoader({
  hasActivePrint,
  onFileOpened,
  onRecentFileError,
  onLoadStarted,
}: UseGcodeLoaderOptions) {
  const parser =
    useParsedGcode({
      hasActivePrint,
      onFileOpened,
      onLoadStarted,
    });
  const [error, setError] =
    useState<string | null>(null);

  const canReplaceFile =
    useCallback((): boolean => {
      if (hasActivePrint) {
        setError(
          ACTIVE_PRINT_FILE_ERROR,
        );
        return false;
      }

      if (!parser.gcode) {
        return true;
      }

      return window.confirm(
        "Loading another file will replace the current preview and its controls. Continue?",
      );
    }, [
      hasActivePrint,
      parser.gcode,
    ]);

  const chooseFile =
    useCallback(async (): Promise<void> => {
      if (!canReplaceFile()) {
        return;
      }

      setError(null);

      try {
        const file =
          await window.desktop.files
            .chooseGcodeFile();

        if (file) {
          await parser.loadFile(file);
        }
      } catch (loadError) {
        setError(
          getErrorMessage(loadError),
        );
      }
    }, [
      canReplaceFile,
      parser.loadFile,
    ]);

  const loadDroppedFile =
    useCallback(
      async (
        file: File,
      ): Promise<void> => {
        if (!canReplaceFile()) {
          return;
        }

        setError(null);

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

        try {
          const data =
            await window.desktop.files
              .readDroppedFile(file);
          await parser.loadFile(data);
        } catch (loadError) {
          setError(
            getErrorMessage(
              loadError,
            ),
          );
        }
      },
      [
        canReplaceFile,
        parser.loadFile,
      ],
    );

  const openRecentFile =
    useCallback(
      async (
        filePath: string,
      ): Promise<void> => {
        if (!canReplaceFile()) {
          return;
        }

        setError(null);

        try {
          const data =
            await window.desktop.files
              .openRecentFile(
                filePath,
              );
          await parser.loadFile(data);
        } catch (loadError) {
          onRecentFileError(
            filePath,
            loadError,
          );
        }
      },
      [
        canReplaceFile,
        onRecentFileError,
        parser.loadFile,
      ],
    );

  const clearError =
    useCallback((): void => {
      setError(null);
      parser.clearError();
    }, [parser.clearError]);

  const clearFile =
    useCallback((): void => {
      setError(null);
      parser.clearFile();
    }, [parser.clearFile]);

  return {
    gcode: parser.gcode,
    isLoading: parser.isLoading,
    error:
      error ??
      parser.error,
    chooseFile,
    loadDroppedFile,
    openRecentFile,
    clearFile,
    clearError,
  };
}
