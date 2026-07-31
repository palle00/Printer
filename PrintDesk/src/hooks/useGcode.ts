import {
  useCallback,
} from "react";

import {
  useGcodeLoader,
} from "./useGcodeLoader";
import {
  useRecentFiles,
} from "./useRecentFiles";

interface UseGcodeOptions {
  hasActivePrint: boolean;
}

export function useGcode({
  hasActivePrint,
}: UseGcodeOptions) {
  const recentFiles =
    useRecentFiles();
  const loader =
    useGcodeLoader({
      hasActivePrint,
      onFileOpened:
        recentFiles.markOpened,
      onRecentFileError:
        recentFiles.reportOpenError,
      onLoadStarted:
        recentFiles.clearStalePath,
    });

  const clearError =
    useCallback((): void => {
      loader.clearError();
      recentFiles.clearError();
    }, [
      loader.clearError,
      recentFiles.clearError,
    ]);

  return {
    gcode: loader.gcode,
    recentFiles:
      recentFiles.recentFiles,
    staleRecentPath:
      recentFiles.staleRecentPath,
    isLoading: loader.isLoading,
    error:
      loader.error ??
      recentFiles.error,
    chooseFile: loader.chooseFile,
    loadDroppedFile:
      loader.loadDroppedFile,
    openRecentFile:
      loader.openRecentFile,
    removeRecentFile:
      recentFiles.removeRecentFile,
    clearRecentFiles:
      recentFiles.clearRecentFiles,
    clearFile: loader.clearFile,
    clearError,
  };
}
