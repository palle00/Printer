"use strict";
const electron = require("electron");
const desktopApi = Object.freeze({
  isElectron: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  })
});
electron.contextBridge.exposeInMainWorld(
  "desktop",
  desktopApi
);
