import type {
  PrinterApi,
} from "./printer-ipc";
import type {
  DesktopFileApi,
  DesktopSettingsApi,
} from "./desktop-files";

export interface DesktopVersions {
  electron: string;
  chrome: string;
  node: string;
}

export interface DesktopApi {
  readonly isElectron: true;

  readonly platform: string;

  readonly versions:
    DesktopVersions;

  readonly printer:
    PrinterApi;
  readonly files:
    DesktopFileApi;
  readonly settings:
    DesktopSettingsApi;
}
