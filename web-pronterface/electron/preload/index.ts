import {
  contextBridge,
} from "electron";

import type {
  DesktopApi,
} from "../../src/types/desktop";

const desktopApi:
  DesktopApi = Object.freeze({
  isElectron: true,

  platform:
    process.platform,

  versions: Object.freeze({
    electron:
      process.versions.electron,

    chrome:
      process.versions.chrome,

    node:
      process.versions.node,
  }),
});

contextBridge.exposeInMainWorld(
  "desktop",
  desktopApi,
);