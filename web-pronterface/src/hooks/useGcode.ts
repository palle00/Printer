import {
  useCallback,
  useState,
  type ChangeEvent,
} from "react";
import type { ParsedGcode } from "../types/gcode";

import { parseGcode } from "../utils/gcodeParser";

export function useGcode() {
  const [gcode, setGcode] =
    useState<ParsedGcode | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(
    async (file: File): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const text = await file.text();

        if (!text.trim()) {
          throw new Error("The selected file is empty.");
        }

        const parsed = parseGcode(file.name, text);
        setGcode(parsed);
      } catch (loadError) {
        setGcode(null);

        setError(
          loadError instanceof Error
            ? loadError.message
            : String(loadError),
        );
      } finally {
        setIsLoading(false);
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
    setGcode(null);
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