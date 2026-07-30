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
  printer: printerApi
});
electron.contextBridge.exposeInMainWorld(
  "desktop",
  desktopApi
);
