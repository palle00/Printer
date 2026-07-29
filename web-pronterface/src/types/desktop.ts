import type {
  PrinterApi,
} from "./printer-ipc";

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
}