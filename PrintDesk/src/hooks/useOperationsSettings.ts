import { useCallback, useEffect, useState } from "react";
import { DEFAULT_OPERATIONS_SETTINGS, type OperationsSettings } from "../types/operations";
import { getErrorMessage } from "../utils/errors";

export function useOperationsSettings() {
  const [operations, setOperations] = useState<OperationsSettings>(DEFAULT_OPERATIONS_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.desktop.settings.get()
      .then((settings) => setOperations(settings.operations))
      .catch((loadError) => setError(getErrorMessage(loadError)))
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((create: (current: OperationsSettings) => OperationsSettings) => {
    setOperations((current) => {
      const next = create(current);
      void window.desktop.settings.updateOperations(next)
        .then(setOperations)
        .catch((saveError) => setError(getErrorMessage(saveError)));
      return next;
    });
  }, []);

  return { operations, loaded, error, clearError: () => setError(null), update };
}
