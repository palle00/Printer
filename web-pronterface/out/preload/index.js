"use strict";
const electron = require("electron");
const PRINTER_IPC = {
  listPorts: "printer:list-ports",
  connect: "printer:connect",
  disconnect: "printer:disconnect",
  sendGcode: "printer:send-gcode",
  startPrint: "printer:start-print",
  startTestPrint: "printer:start-test-print",
  pausePrint: "printer:pause-print",
  resumePrint: "printer:resume-print",
  stopPrint: "printer:stop-print",
  resetPrint: "printer:reset-print",
  event: "printer:event"
};
const DESKTOP_IPC = {
  chooseGcodeFile: "desktop:choose-gcode-file",
  readGcodePath: "desktop:read-gcode-path",
  markGcodeOpened: "desktop:mark-gcode-opened",
  removeRecentFile: "desktop:remove-recent-file",
  clearRecentFiles: "desktop:clear-recent-files",
  getSettings: "desktop:get-settings",
  updateNotifications: "desktop:update-notifications"
};
const fileApi = Object.freeze({
  chooseGcodeFile() {
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.chooseGcodeFile
    );
  },
  readDroppedFile(file) {
    const filePath = electron.webUtils.getPathForFile(file);
    if (!filePath) {
      return Promise.reject(
        new Error(
          "The dropped file has no local path."
        )
      );
    }
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.readGcodePath,
      filePath
    );
  },
  openRecentFile(path) {
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.readGcodePath,
      path
    );
  },
  markOpened(path) {
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.markGcodeOpened,
      path
    );
  },
  removeRecent(path) {
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.removeRecentFile,
      path
    );
  },
  clearRecent() {
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.clearRecentFiles
    );
  }
});
const settingsApi = Object.freeze({
  get() {
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.getSettings
    );
  },
  updateNotifications(preferences) {
    return electron.ipcRenderer.invoke(
      DESKTOP_IPC.updateNotifications,
      preferences
    );
  }
});
const printerApi = Object.freeze({
  listPorts() {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.listPorts
    );
  },
  connect(baudRate = 115200) {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.connect,
      baudRate
    );
  },
  disconnect() {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.disconnect
    );
  },
  sendGcode(gcode) {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.sendGcode,
      gcode
    );
  },
  startPrint(print) {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.startPrint,
      print
    );
  },
  startTestPrint(print) {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.startTestPrint,
      print
    );
  },
  pausePrint() {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.pausePrint
    );
  },
  resumePrint() {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.resumePrint
    );
  },
  stopPrint() {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.stopPrint
    );
  },
  resetPrint() {
    return electron.ipcRenderer.invoke(
      PRINTER_IPC.resetPrint
    );
  },
  onEvent(listener) {
    const handler = (_ipcEvent, printerEvent) => {
      listener(printerEvent);
    };
    electron.ipcRenderer.on(
      PRINTER_IPC.event,
      handler
    );
    return () => {
      electron.ipcRenderer.removeListener(
        PRINTER_IPC.event,
        handler
      );
    };
  }
});
const desktopApi = Object.freeze({
  isElectron: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }),
  printer: printerApi,
  files: fileApi,
  settings: settingsApi
});
electron.contextBridge.exposeInMainWorld(
  "desktop",
  desktopApi
);
