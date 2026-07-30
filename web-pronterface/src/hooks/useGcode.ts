import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { ParsedGcode } from "../types/gcode";

import { parseGcode } from "../utils/gcodeParser";

export function useGcode() {
  const loadGeneration =
    useRef(0);

  const [gcode, setGcode] =
    useState<ParsedGcode | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(
    async (file: File): Promise<void> => {
      const generation =
        ++loadGeneration.current;

      setIsLoading(true);
      setError(null);
      setGcode(null);

      try {
        const text = await file.text();

        if (
          generation !==
          loadGeneration.current
        ) {
          return;
        }

        if (!text.trim()) {
          throw new Error("The selected file is empty.");
        }

        const parsed = parseGcode(file.name, text);

        if (
          generation ===
          loadGeneration.current
        ) {
          setGcode(parsed);
        }
      } catch (loadError) {
        if (
          generation !==
          loadGeneration.current
        ) {
          return;
        }

        setGcode(null);

        setError(
          loadError instanceof Error
            ? loadError.message
            : String(loadError),
        );
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

  const handleFileInput = useCallback(
    async (
      event: ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      await loadFile(file);
      event.target.value = "";
    },
    [loadFile],
  );

  const clearFile = useCallback(() => {
    loadGeneration.current++;
    setGcode(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    gcode,
    isLoading,
    error,

    loadFile,
    handleFileInput,
    clearFile,
  };
}
