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
import {
  getErrorMessage,
} from "../utils/errors";
import {
  parseGcodeInWorker,
  type GcodeParseJob,
} from "./parseGcodeInWorker";

export const ACTIVE_PRINT_FILE_ERROR =
  "Stop the active print before loading or removing a G-code file.";

interface UseParsedGcodeOptions {
  hasActivePrint: boolean;
  onFileOpened(
    filePath: string,
  ): Promise<void>;
  onLoadStarted(): void;
}

export function useParsedGcode({
  hasActivePrint,
  onFileOpened,
  onLoadStarted,
}: UseParsedGcodeOptions) {
  const loadGeneration =
    useRef(0);
  const parseJob =
    useRef<GcodeParseJob | null>(
      null,
    );
  const hasActivePrintRef =
    useRef(hasActivePrint);
  const [gcode, setGcode] =
    useState<ParsedGcode | null>(
      null,
    );
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  hasActivePrintRef.current =
    hasActivePrint;

  useEffect(
    () => () => {
      parseJob.current?.cancel();
    },
    [],
  );

  const loadFile =
    useCallback(
      async (
        file: GcodeFileData,
      ): Promise<void> => {
        if (
          hasActivePrintRef.current
        ) {
          setError(
            ACTIVE_PRINT_FILE_ERROR,
          );
          return;
        }

        const generation =
          ++loadGeneration.current;
        setIsLoading(true);
        setError(null);
        onLoadStarted();

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
              file.sha256,
            );
          parseJob.current = job;
          const parsed =
            await job.promise;

          if (
            parseJob.current === job
          ) {
            parseJob.current = null;
          }

          if (
            generation !==
              loadGeneration.current ||
            hasActivePrintRef.current
          ) {
            if (
              generation ===
                loadGeneration.current &&
              hasActivePrintRef.current
            ) {
              setError(
                ACTIVE_PRINT_FILE_ERROR,
              );
            }

            return;
          }

          setGcode(parsed);
          await onFileOpened(
            file.path,
          );
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
      [
        onFileOpened,
        onLoadStarted,
      ],
    );

  const clearFile =
    useCallback((): void => {
      if (
        hasActivePrintRef.current
      ) {
        setError(
          ACTIVE_PRINT_FILE_ERROR,
        );
        return;
      }

      loadGeneration.current++;
      parseJob.current?.cancel();
      parseJob.current = null;
      setGcode(null);
      setIsLoading(false);
      setError(null);
    }, []);

  const clearError =
    useCallback((): void => {
      setError(null);
    }, []);

  return {
    gcode,
    isLoading,
    error,
    loadFile,
    clearFile,
    clearError,
  };
}
