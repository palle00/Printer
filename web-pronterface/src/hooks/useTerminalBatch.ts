import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  appendTerminalLines,
} from "../state/printerState";
import type {
  PrinterState,
} from "../types/printer";

const TERMINAL_BATCH_DELAY_MS = 100;
const MAX_PENDING_TERMINAL_LINES = 300;

export function useTerminalBatch(
  setState:
    Dispatch<
      SetStateAction<PrinterState>
    >,
) {
  const pendingLines =
    useRef<string[]>([]);
  const flushTimer =
    useRef<number | null>(null);

  const flush =
    useCallback((): void => {
      flushTimer.current = null;
      const lines =
        pendingLines.current;
      pendingLines.current = [];

      if (lines.length > 0) {
        setState((previous) =>
          appendTerminalLines(
            previous,
            lines,
          ),
        );
      }
    }, [setState]);

  const append =
    useCallback(
      (text: string): void => {
        pendingLines.current.push(
          text,
        );

        if (
          pendingLines.current.length >
          MAX_PENDING_TERMINAL_LINES
        ) {
          pendingLines.current.splice(
            0,
            pendingLines.current
              .length -
              MAX_PENDING_TERMINAL_LINES,
          );
        }

        if (
          flushTimer.current ===
          null
        ) {
          flushTimer.current =
            window.setTimeout(
              flush,
              TERMINAL_BATCH_DELAY_MS,
            );
        }
      },
      [flush],
    );

  const clear =
    useCallback((): void => {
      pendingLines.current = [];

      if (
        flushTimer.current !== null
      ) {
        window.clearTimeout(
          flushTimer.current,
        );
        flushTimer.current = null;
      }

      setState((previous) => ({
        ...previous,
        terminal: [],
      }));
    }, [setState]);

  useEffect(
    () => () => {
      if (
        flushTimer.current !== null
      ) {
        window.clearTimeout(
          flushTimer.current,
        );
      }

      flushTimer.current = null;
      pendingLines.current = [];
    },
    [],
  );

  return {
    append,
    clear,
  };
}
