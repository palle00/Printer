"use strict";
const electron = require("electron");
const path = require("node:path");
const node_fs = require("node:fs");
const parserReadline = require("@serialport/parser-readline");
const serialport = require("serialport");
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
const SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".gcode",
  ".gco",
  ".gc",
  ".g"
]);
const MAXIMUM_FILE_SIZE = 2 * 1024 * 1024 * 1024;
function isSupportedGcodePath(filePath) {
  return SUPPORTED_EXTENSIONS.has(
    path.extname(filePath).toLowerCase()
  );
}
function assertGcodePath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || !isSupportedGcodePath(value)) {
    throw new Error(
      "Choose a G-code, GCO, GC, or G file."
    );
  }
  return path.normalize(value);
}
async function readGcodeFile(requestedPath) {
  const details = await inspectGcodeFile(
    requestedPath
  );
  return {
    path: details.path,
    name: details.name,
    size: details.size,
    text: await node_fs.promises.readFile(
      details.path,
      "utf8"
    )
  };
}
async function inspectGcodeFile(requestedPath) {
  const filePath = assertGcodePath(requestedPath);
  let details;
  try {
    details = await node_fs.promises.stat(
      filePath
    );
  } catch {
    throw new Error(
      "The G-code file no longer exists."
    );
  }
  if (!details.isFile()) {
    throw new Error(
      "The selected path is not a file."
    );
  }
  if (details.size <= 0 || details.size > MAXIMUM_FILE_SIZE) {
    throw new Error(
      details.size <= 0 ? "The selected G-code file is empty." : "The selected G-code file is too large."
    );
  }
  return {
    path: filePath,
    name: path.basename(filePath),
    size: details.size,
    lastOpenedAt: Date.now()
  };
}
async function chooseGcodeFile(window) {
  const result = await electron.dialog.showOpenDialog(
    window,
    {
      title: "Open G-code file",
      properties: [
        "openFile"
      ],
      filters: [
        {
          name: "G-code files",
          extensions: [
            "gcode",
            "gco",
            "gc",
            "g"
          ]
        }
      ]
    }
  );
  if (result.canceled || result.filePaths.length !== 1) {
    return null;
  }
  return readGcodeFile(
    result.filePaths[0]
  );
}
function assertTrustedSender(event, window) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents) {
    throw new Error(
      "Unauthorized desktop request."
    );
  }
  return window;
}
const NOTIFICATION_KEYS = /* @__PURE__ */ new Set([
  "enabled",
  "printStarted",
  "printPaused",
  "printCompleted",
  "printStopped",
  "printerDisconnected",
  "printerErrors",
  "temperatureReached"
]);
function assertNotificationUpdate(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "Invalid notification settings."
    );
  }
  const update = {};
  for (const [
    key,
    setting
  ] of Object.entries(value)) {
    if (!NOTIFICATION_KEYS.has(
      key
    ) || typeof setting !== "boolean") {
      throw new Error(
        "Invalid notification settings."
      );
    }
    update[key] = setting;
  }
  return update;
}
function registerDesktopIpc({
  getWindow,
  settings
}) {
  const channels = Object.values(DESKTOP_IPC);
  for (const channel of channels) {
    electron.ipcMain.removeHandler(channel);
  }
  electron.ipcMain.handle(
    DESKTOP_IPC.chooseGcodeFile,
    (event) => {
      const window = assertTrustedSender(
        event,
        getWindow()
      );
      return chooseGcodeFile(window);
    }
  );
  electron.ipcMain.handle(
    DESKTOP_IPC.readGcodePath,
    (event, filePath) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      return readGcodeFile(filePath);
    }
  );
  electron.ipcMain.handle(
    DESKTOP_IPC.markGcodeOpened,
    async (event, filePath) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      const entry = await inspectGcodeFile(
        filePath
      );
      return settings.addRecentFile(
        entry
      );
    }
  );
  electron.ipcMain.handle(
    DESKTOP_IPC.removeRecentFile,
    (event, filePath) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      if (typeof filePath !== "string") {
        throw new Error(
          "Invalid recent file path."
        );
      }
      return settings.removeRecentFile(
        filePath
      );
    }
  );
  electron.ipcMain.handle(
    DESKTOP_IPC.clearRecentFiles,
    (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      return settings.clearRecentFiles();
    }
  );
  electron.ipcMain.handle(
    DESKTOP_IPC.getSettings,
    (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      return settings.getSnapshot();
    }
  );
  electron.ipcMain.handle(
    DESKTOP_IPC.updateNotifications,
    (event, value) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      return settings.updateNotifications(
        assertNotificationUpdate(
          value
        )
      );
    }
  );
  return () => {
    for (const channel of channels) {
      electron.ipcMain.removeHandler(channel);
    }
  };
}
class PrintSleepBlocker {
  blockerId = null;
  get active() {
    return this.blockerId !== null && electron.powerSaveBlocker.isStarted(
      this.blockerId
    );
  }
  setPrintingActive(active) {
    if (active) {
      this.start();
    } else {
      this.stop();
    }
  }
  start() {
    if (this.active) {
      return;
    }
    this.blockerId = electron.powerSaveBlocker.start(
      "prevent-app-suspension"
    );
    console.log(
      "[Power] Sleep prevention enabled."
    );
  }
  stop() {
    if (this.blockerId === null) {
      return;
    }
    if (electron.powerSaveBlocker.isStarted(
      this.blockerId
    )) {
      electron.powerSaveBlocker.stop(
        this.blockerId
      );
    }
    this.blockerId = null;
    console.log(
      "[Power] Sleep prevention disabled."
    );
  }
  dispose() {
    this.stop();
  }
}
class PrinterEvents {
  constructor(target) {
    this.target = target;
  }
  target;
  post(event) {
    this.target.postMessage(event);
  }
  error(error) {
    this.post({
      type: "ERROR",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  connected() {
    this.post({
      type: "CONNECTED"
    });
  }
  disconnected(unexpected = false) {
    this.post({
      type: "DISCONNECTED",
      unexpected
    });
  }
  status(status) {
    this.post({
      type: "STATUS",
      status
    });
  }
  terminalIn(text) {
    this.post({
      type: "TERMINAL_IN",
      text
    });
  }
  terminalOut(text) {
    this.post({
      type: "TERMINAL_OUT",
      text
    });
  }
  temperature(data) {
    this.post({
      type: "TEMPERATURE",
      ...data
    });
  }
  position(position) {
    this.post({
      type: "POSITION",
      position: {
        ...position
      }
    });
  }
  progress(progress) {
    this.post({
      type: "PROGRESS",
      progress
    });
  }
  printStarted(mode, fileName, totalLines, totalLayers) {
    this.post({
      type: "PRINT_STARTED",
      mode,
      fileName,
      totalLines,
      totalLayers
    });
  }
  printFinished(mode, elapsedSeconds, metrics) {
    this.post({
      type: "PRINT_FINISHED",
      mode,
      elapsedSeconds,
      metrics
    });
  }
  printStopped(mode, status, clearSession) {
    this.post({
      type: "PRINT_STOPPED",
      mode,
      status,
      clearSession
    });
  }
  printReset(status) {
    this.post({
      type: "PRINT_RESET",
      status
    });
  }
}
function parseValue(command, axis) {
  const match = command.match(
    new RegExp(
      `${axis}([-+]?\\d*\\.?\\d+)`,
      "i"
    )
  );
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
function commandContainsAxis(command, axis) {
  return new RegExp(
    `${axis}(?:[-+\\d.]|\\s|$)`,
    "i"
  ).test(command);
}
class PositionTracker {
  constructor(events) {
    this.events = events;
  }
  events;
  absolutePositioning = true;
  absoluteExtrusion = true;
  position = {
    x: 0,
    y: 0,
    z: 0,
    e: 0
  };
  get current() {
    return {
      ...this.position
    };
  }
  set(position) {
    this.position = {
      ...position
    };
    this.events.position(
      this.position
    );
  }
  reset() {
    this.absolutePositioning = true;
    this.absoluteExtrusion = true;
    this.set({
      x: 0,
      y: 0,
      z: 0,
      e: 0
    });
  }
  trackAcknowledgedCommand(command) {
    const upper = command.trim().toUpperCase();
    const code = upper.match(
      /^([GMT]\d+)/
    )?.[1];
    if (!code) {
      return;
    }
    if (code === "G90") {
      this.absolutePositioning = true;
      return;
    }
    if (code === "G91") {
      this.absolutePositioning = false;
      return;
    }
    if (code === "M82") {
      this.absoluteExtrusion = true;
      return;
    }
    if (code === "M83") {
      this.absoluteExtrusion = false;
      return;
    }
    if (code === "G28") {
      this.trackHomeCommand(
        upper
      );
      return;
    }
    if (code === "G92") {
      this.trackSetPositionCommand(
        upper
      );
      return;
    }
    if (code !== "G0" && code !== "G1" && code !== "G2" && code !== "G3") {
      return;
    }
    this.trackMovementCommand(
      upper
    );
  }
  trackHomeCommand(command) {
    const hasX = commandContainsAxis(
      command,
      "X"
    );
    const hasY = commandContainsAxis(
      command,
      "Y"
    );
    const hasZ = commandContainsAxis(
      command,
      "Z"
    );
    if (!hasX && !hasY && !hasZ) {
      this.position = {
        ...this.position,
        x: 0,
        y: 0,
        z: 0
      };
    } else {
      if (hasX) {
        this.position.x = 0;
      }
      if (hasY) {
        this.position.y = 0;
      }
      if (hasZ) {
        this.position.z = 0;
      }
    }
    this.events.position(
      this.position
    );
  }
  trackSetPositionCommand(command) {
    const x = parseValue(
      command,
      "X"
    );
    const y = parseValue(
      command,
      "Y"
    );
    const z = parseValue(
      command,
      "Z"
    );
    const e = parseValue(
      command,
      "E"
    );
    if (x !== null) {
      this.position.x = x;
    }
    if (y !== null) {
      this.position.y = y;
    }
    if (z !== null) {
      this.position.z = z;
    }
    if (e !== null) {
      this.position.e = e;
    }
    this.events.position(
      this.position
    );
  }
  trackMovementCommand(command) {
    const x = parseValue(
      command,
      "X"
    );
    const y = parseValue(
      command,
      "Y"
    );
    const z = parseValue(
      command,
      "Z"
    );
    const e = parseValue(
      command,
      "E"
    );
    if (x !== null) {
      this.position.x = this.absolutePositioning ? x : this.position.x + x;
    }
    if (y !== null) {
      this.position.y = this.absolutePositioning ? y : this.position.y + y;
    }
    if (z !== null) {
      this.position.z = this.absolutePositioning ? z : this.position.z + z;
    }
    if (e !== null) {
      this.position.e = this.absoluteExtrusion ? e : this.position.e + e;
    }
    this.events.position(
      this.position
    );
  }
}
const MIN_TEST_DURATION_SECONDS = 20;
const MAX_TEST_DURATION_SECONDS = 120;
const SEGMENTS_PER_SECOND = 250;
function clamp$1(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}
function estimateTestDurationSeconds(segmentCount) {
  const estimated = segmentCount / SEGMENTS_PER_SECOND;
  return clamp$1(
    estimated,
    MIN_TEST_DURATION_SECONDS,
    MAX_TEST_DURATION_SECONDS
  );
}
function createPrintProgress({
  fileName,
  currentLine,
  totalLines,
  currentLayer,
  totalLayers,
  elapsedSeconds,
  estimatedDurationSeconds,
  percentOverride,
  etaSecondsOverride,
  estimatedTotalSeconds,
  estimateSource = null,
  estimateConfidence = null,
  isHeating = false
}) {
  const safeTotalLines = Math.max(
    0,
    totalLines
  );
  const safeCurrentLine = clamp$1(
    currentLine,
    0,
    safeTotalLines
  );
  const calculatedPercent = safeTotalLines === 0 ? 100 : safeCurrentLine / safeTotalLines * 100;
  const percent = clamp$1(
    percentOverride ?? calculatedPercent,
    0,
    100
  );
  let etaSeconds = etaSecondsOverride ?? 0;
  if (estimatedDurationSeconds !== void 0) {
    etaSeconds = Math.max(
      0,
      estimatedDurationSeconds - elapsedSeconds
    );
  }
  return {
    fileName,
    currentLine: safeCurrentLine,
    totalLines: safeTotalLines,
    currentLayer: clamp$1(
      currentLayer,
      totalLayers > 0 ? 1 : 0,
      Math.max(0, totalLayers)
    ),
    totalLayers: Math.max(
      0,
      totalLayers
    ),
    percent,
    elapsedSeconds: Math.max(
      0,
      elapsedSeconds
    ),
    etaSeconds: Math.max(
      0,
      etaSeconds
    ),
    estimatedTotalSeconds: estimatedTotalSeconds ?? estimatedDurationSeconds ?? null,
    estimateSource,
    estimateConfidence,
    isHeating
  };
}
function calculateTestFrame(path2, printableLines, totalLayers, elapsedMilliseconds, durationMilliseconds) {
  const safeDuration = Math.max(
    1,
    durationMilliseconds
  );
  const ratio = clamp$1(
    elapsedMilliseconds / safeDuration,
    0,
    1
  );
  const segmentCount = path2.commandIndexes.length;
  if (segmentCount === 0) {
    return {
      finished: true,
      ratio: 1,
      currentLine: printableLines,
      currentLayer: totalLayers,
      position: {
        x: 0,
        y: 0,
        z: 0,
        e: 0
      }
    };
  }
  const segmentProgress = ratio * segmentCount;
  const segmentIndex = Math.min(
    segmentCount - 1,
    Math.floor(segmentProgress)
  );
  const coordinateOffset = segmentIndex * 6;
  const localRatio = ratio >= 1 ? 1 : segmentProgress - segmentIndex;
  const position = {
    x: path2.coordinates[coordinateOffset] + (path2.coordinates[coordinateOffset + 3] - path2.coordinates[coordinateOffset]) * localRatio,
    y: path2.coordinates[coordinateOffset + 1] + (path2.coordinates[coordinateOffset + 4] - path2.coordinates[coordinateOffset + 1]) * localRatio,
    z: path2.coordinates[coordinateOffset + 2] + (path2.coordinates[coordinateOffset + 5] - path2.coordinates[coordinateOffset + 2]) * localRatio,
    e: path2.extruding[segmentIndex] !== 0 ? localRatio : 0
  };
  return {
    finished: ratio >= 1,
    ratio,
    currentLine: ratio >= 1 ? printableLines : Math.max(
      0,
      path2.commandIndexes[segmentIndex] - 1
    ),
    currentLayer: ratio >= 1 ? totalLayers : path2.layers[segmentIndex],
    position
  };
}
const LIVE_ETA_DEFAULTS = {
  minimumActiveSeconds: 180,
  minimumPredictedProgress: 0.03,
  smoothingFactor: 0.08,
  minimumCalibrationFactor: 0.5,
  maximumCalibrationFactor: 3,
  highConfidenceActiveSeconds: 1200,
  highConfidenceProgress: 0.3
};
function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}
function createLiveCalibrationState() {
  return {
    factor: 1,
    sampleCount: 0
  };
}
function updateLiveEta({
  state,
  actualPrintSeconds,
  predictedPrintElapsedSeconds,
  predictedPrintTotalSeconds,
  baseSource,
  baseConfidence
}) {
  const safeTotal = Math.max(
    0,
    predictedPrintTotalSeconds
  );
  const safePredictedElapsed = clamp(
    predictedPrintElapsedSeconds,
    0,
    safeTotal
  );
  const progress = safeTotal > 0 ? safePredictedElapsed / safeTotal : 0;
  const canCalibrate = actualPrintSeconds >= LIVE_ETA_DEFAULTS.minimumActiveSeconds && progress >= LIVE_ETA_DEFAULTS.minimumPredictedProgress && safePredictedElapsed > 0;
  let nextState = state;
  if (canCalibrate) {
    const observedFactor = clamp(
      actualPrintSeconds / safePredictedElapsed,
      LIVE_ETA_DEFAULTS.minimumCalibrationFactor,
      LIVE_ETA_DEFAULTS.maximumCalibrationFactor
    );
    const nextFactor = state.sampleCount === 0 ? 1 + (observedFactor - 1) * LIVE_ETA_DEFAULTS.smoothingFactor : state.factor + (observedFactor - state.factor) * LIVE_ETA_DEFAULTS.smoothingFactor;
    nextState = {
      factor: clamp(
        nextFactor,
        LIVE_ETA_DEFAULTS.minimumCalibrationFactor,
        LIVE_ETA_DEFAULTS.maximumCalibrationFactor
      ),
      sampleCount: state.sampleCount + 1
    };
  }
  const isLive = nextState.sampleCount > 0;
  const confidence = !isLive ? baseConfidence : actualPrintSeconds >= LIVE_ETA_DEFAULTS.highConfidenceActiveSeconds && progress >= LIVE_ETA_DEFAULTS.highConfidenceProgress ? "high" : "medium";
  return {
    state: nextState,
    remainingSeconds: Math.max(
      0,
      (safeTotal - safePredictedElapsed) * nextState.factor
    ),
    source: isLive ? "live" : baseSource,
    confidence,
    calibratedTotalPrintSeconds: safeTotal * nextState.factor
  };
}
function stripGcodeLine(rawLine) {
  const semicolonIndex = rawLine.indexOf(";");
  const withoutComment = semicolonIndex >= 0 ? rawLine.slice(0, semicolonIndex) : rawLine;
  const checksumIndex = withoutComment.indexOf("*");
  const withoutChecksum = checksumIndex >= 0 ? withoutComment.slice(0, checksumIndex) : withoutComment;
  return withoutChecksum.replace(/\([^)]*\)/g, "").replace(
    /^\s*N\d+\s+/i,
    ""
  ).trim();
}
const NUMBERED_LAYER_PATTERN = /^\s*;\s*LAYER:\s*(-?\d+)/i;
const LAYER_CHANGE_PATTERN = /^\s*;\s*LAYER_CHANGE\b/i;
const Z_COMMENT_PATTERN = /^\s*;\s*Z:\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)/i;
function detectLayerMarkerMode(lines) {
  let hasLayerChange = false;
  let hasZComment = false;
  for (const line of lines) {
    if (NUMBERED_LAYER_PATTERN.test(line)) {
      return "numbered";
    }
    hasLayerChange ||= LAYER_CHANGE_PATTERN.test(line);
    hasZComment ||= Z_COMMENT_PATTERN.test(line);
  }
  if (hasLayerChange) {
    return "layer-change";
  }
  return hasZComment ? "z-comment" : "none";
}
function getNumberedLayer(line) {
  const match = line.match(NUMBERED_LAYER_PATTERN);
  return match ? Number(match[1]) + 1 : null;
}
function isLayerChangeMarker(line) {
  return LAYER_CHANGE_PATTERN.test(line);
}
function isZCommentMarker(line) {
  return Z_COMMENT_PATTERN.test(line);
}
function clampLayer(layer, totalLayers) {
  return Math.min(
    Math.max(1, layer),
    Math.max(
      1,
      totalLayers
    )
  );
}
function prepareCommands(lines, totalLayers) {
  const markerMode = detectLayerMarkerMode(lines);
  const texts = [];
  const layers = new Uint32Array(lines.length);
  let commandIndex = 0;
  let currentLayer = 1;
  let sequentialLayer = 0;
  for (const rawLine of lines) {
    if (markerMode === "numbered") {
      const numberedLayer = getNumberedLayer(rawLine);
      if (numberedLayer !== null) {
        currentLayer = numberedLayer;
      }
    } else if (markerMode === "layer-change" && isLayerChangeMarker(rawLine)) {
      sequentialLayer++;
      currentLayer = Math.max(
        1,
        sequentialLayer
      );
    } else if (markerMode === "z-comment" && isZCommentMarker(rawLine)) {
      sequentialLayer++;
      currentLayer = Math.max(
        1,
        sequentialLayer
      );
    }
    const command = stripGcodeLine(rawLine);
    if (!command || command === "%") {
      continue;
    }
    texts.push(command);
    layers[commandIndex] = clampLayer(
      currentLayer,
      totalLayers
    );
    commandIndex++;
  }
  return {
    texts,
    layers: layers.subarray(0, commandIndex)
  };
}
function isActiveStatus(status) {
  return status === "printing" || status === "pausing" || status === "paused" || status === "stopping";
}
function getElapsedMilliseconds(session) {
  const clockIsRunning = session.status === "printing" || session.status === "pausing" || session.status === "stopping";
  return session.elapsedBeforeRunMs + (clockIsRunning ? performance.now() - session.runStartedAtMs : 0);
}
function pauseSessionClock(session) {
  session.elapsedBeforeRunMs = getElapsedMilliseconds(
    session
  );
}
function createBaseSession(mode, fileName, totalLines, totalLayers) {
  return {
    mode,
    status: "printing",
    fileName,
    totalLines,
    totalLayers,
    currentLine: 0,
    currentLayer: totalLayers > 0 ? 1 : 0,
    elapsedBeforeRunMs: 0,
    runStartedAtMs: performance.now(),
    pauseRequested: false,
    stopRequested: false,
    resumeResolver: null
  };
}
const SAFE_STOP_COMMANDS = [
  "M400",
  "G91",
  "G1 Z10 F1200",
  "G90",
  "G28 X Y",
  "M104 S0",
  "M140 S0",
  "M107",
  "M84"
];
async function safeStopPrinter(queue) {
  for (const command of SAFE_STOP_COMMANDS) {
    try {
      await queue.queue(command);
    } catch {
    }
  }
}
class RealPrintRunner {
  constructor(queue, context) {
    this.queue = queue;
    this.context = context;
  }
  queue;
  context;
  async run(session) {
    try {
      for (let index = 0; index < session.commands.texts.length; index++) {
        if (!this.context.isCurrent(
          session
        ) || session.stopRequested) {
          break;
        }
        await this.waitWhilePaused(
          session
        );
        if (!this.context.isCurrent(
          session
        ) || session.stopRequested) {
          break;
        }
        const command = session.commands.texts[index];
        await this.queue.queue(
          command
        );
        if (!this.context.isCurrent(
          session
        )) {
          return;
        }
        session.currentLine = index + 1;
        session.currentLayer = session.commands.layers[index];
        this.context.emitProgress(
          session
        );
      }
      if (!this.context.isCurrent(
        session
      )) {
        return;
      }
      if (session.stopRequested) {
        await safeStopPrinter(
          this.queue
        );
        if (this.context.isCurrent(
          session
        )) {
          this.context.stop(
            session,
            false
          );
        }
        return;
      }
      this.context.finish(
        session
      );
    } catch (error) {
      if (!this.context.isCurrent(
        session
      )) {
        return;
      }
      this.context.error(error);
      this.context.stop(
        session,
        false
      );
    }
  }
  async waitWhilePaused(session) {
    if (!session.pauseRequested) {
      return;
    }
    pauseSessionClock(
      session
    );
    this.context.setStatus(
      session,
      "paused"
    );
    await new Promise(
      (resolve) => {
        session.resumeResolver = resolve;
      }
    );
    session.resumeResolver = null;
    if (!this.context.isCurrent(
      session
    ) || session.stopRequested) {
      return;
    }
    session.runStartedAtMs = performance.now();
    this.context.setStatus(
      session,
      "printing"
    );
  }
}
const TEST_FRAME_INTERVAL_MS = 32;
class TestPrintRunner {
  constructor(context) {
    this.context = context;
  }
  context;
  start(session) {
    this.scheduleFrame(session);
  }
  clearTimer(session) {
    if (session.timer === null) {
      return;
    }
    clearTimeout(
      session.timer
    );
    session.timer = null;
  }
  scheduleFrame(session) {
    this.clearTimer(session);
    session.timer = setTimeout(
      () => {
        this.runFrame(session);
      },
      TEST_FRAME_INTERVAL_MS
    );
  }
  runFrame(session) {
    session.timer = null;
    if (!this.context.isCurrent(
      session
    ) || session.status !== "printing") {
      return;
    }
    const elapsedMilliseconds = getElapsedMilliseconds(
      session
    );
    const frame = calculateTestFrame(
      session.path,
      session.totalLines,
      session.totalLayers,
      elapsedMilliseconds,
      session.durationMs
    );
    session.currentLine = frame.currentLine;
    session.currentLayer = frame.currentLayer;
    this.context.emitPosition(
      frame.position
    );
    this.context.emitProgress(
      session,
      {
        percentOverride: frame.ratio * 100,
        estimatedDurationSeconds: session.durationMs / 1e3
      }
    );
    if (frame.finished) {
      this.context.finish(
        session
      );
      return;
    }
    this.scheduleFrame(
      session
    );
  }
}
const TEST_STOP_DELAY_MS = 300;
class PrintSessionManager {
  constructor(options) {
    this.options = options;
    const context = {
      isCurrent: (session) => this.session === session,
      setStatus: (session, status) => {
        this.setSessionStatus(
          session,
          status
        );
      },
      emitProgress: (session, progressOptions) => {
        this.emitProgress(
          session,
          progressOptions
        );
      },
      emitPosition: (position) => {
        this.emitPosition(
          position
        );
      },
      finish: (session) => {
        this.finishSession(
          session
        );
      },
      stop: (session, clearSession) => {
        this.completeStop(
          session,
          clearSession
        );
      },
      error: (error) => {
        this.options.events.error(
          error
        );
      }
    };
    this.realRunner = new RealPrintRunner(
      this.options.serialQueue,
      context
    );
    this.testRunner = new TestPrintRunner(
      context
    );
  }
  options;
  session = null;
  realRunner;
  testRunner;
  testStopTimer = null;
  get isActive() {
    return this.session !== null && isActiveStatus(
      this.session.status
    );
  }
  startReal(payload) {
    if (!this.options.isConnected()) {
      this.options.events.error(
        new Error(
          "Connect the printer before starting a real print."
        )
      );
      return;
    }
    if (this.isActive) {
      return;
    }
    this.clearPendingTestStop();
    const commands = prepareCommands(
      payload.lines,
      payload.totalLayers
    );
    if (payload.timing.cumulativeSeconds.length !== commands.texts.length + 1) {
      this.options.events.error(
        new Error(
          "The print timing model does not match the G-code commands."
        )
      );
      return;
    }
    const session = {
      ...createBaseSession(
        "real",
        payload.fileName,
        commands.texts.length,
        payload.totalLayers
      ),
      mode: "real",
      commands,
      timing: payload.timing,
      calibration: createLiveCalibrationState(),
      heatingCompletedAtActiveSeconds: null,
      lastProgressEmitAtMs: 0,
      lastCalibratedTotalSeconds: payload.timing.totalSeconds,
      progressTimer: null
    };
    this.session = session;
    this.options.events.printStarted(
      "real",
      payload.fileName,
      commands.texts.length,
      payload.totalLayers
    );
    this.emitProgress(
      session,
      {
        force: true
      }
    );
    session.progressTimer = setInterval(
      () => {
        this.emitProgress(
          session
        );
      },
      250
    );
    void this.realRunner.run(
      session
    );
  }
  startTest(payload) {
    if (this.isActive) {
      return;
    }
    this.clearPendingTestStop();
    const durationSeconds = estimateTestDurationSeconds(
      payload.path.commandIndexes.length
    );
    const session = {
      ...createBaseSession(
        "test",
        payload.fileName,
        payload.printableLines,
        payload.totalLayers
      ),
      mode: "test",
      path: payload.path,
      durationMs: durationSeconds * 1e3,
      timer: null
    };
    this.session = session;
    this.options.events.printStarted(
      "test",
      payload.fileName,
      payload.printableLines,
      payload.totalLayers
    );
    this.emitProgress(
      session,
      {
        percentOverride: 0,
        estimatedDurationSeconds: durationSeconds
      }
    );
    const hasFirstSegment = payload.path.commandIndexes.length > 0;
    if (hasFirstSegment) {
      this.emitPosition({
        x: payload.path.coordinates[0],
        y: payload.path.coordinates[1],
        z: payload.path.coordinates[2],
        e: 0
      });
    } else {
      this.options.positionTracker.reset();
    }
    this.testRunner.start(
      session
    );
  }
  pause() {
    const session = this.session;
    if (!session || session.status !== "printing") {
      return;
    }
    session.pauseRequested = true;
    if (session.mode === "test") {
      this.testRunner.clearTimer(
        session
      );
      pauseSessionClock(
        session
      );
      this.setSessionStatus(
        session,
        "paused"
      );
      return;
    }
    this.setSessionStatus(
      session,
      "pausing"
    );
  }
  resume() {
    const session = this.session;
    if (!session || session.status !== "paused") {
      return;
    }
    session.pauseRequested = false;
    if (session.mode === "test") {
      session.runStartedAtMs = performance.now();
      this.setSessionStatus(
        session,
        "printing"
      );
      this.testRunner.start(
        session
      );
      return;
    }
    session.resumeResolver?.();
  }
  stop() {
    const session = this.session;
    if (!session || !isActiveStatus(
      session.status
    )) {
      return;
    }
    session.stopRequested = true;
    this.setSessionStatus(
      session,
      "stopping"
    );
    if (session.mode === "test") {
      this.testRunner.clearTimer(
        session
      );
      this.clearPendingTestStop();
      this.testStopTimer = setTimeout(() => {
        this.testStopTimer = null;
        if (this.session !== session) {
          return;
        }
        this.completeStop(
          session,
          true
        );
      }, TEST_STOP_DELAY_MS);
      return;
    }
    session.resumeResolver?.();
  }
  reset() {
    if (this.isActive) {
      return;
    }
    this.clearPendingTestStop();
    if (this.session?.mode === "test") {
      this.testRunner.clearTimer(
        this.session
      );
    }
    this.session = null;
    this.options.positionTracker.reset();
    this.options.events.printReset(
      this.getIdleStatus()
    );
  }
  handleDisconnect() {
    this.clearPendingTestStop();
    const session = this.session;
    if (!session) {
      return;
    }
    if (session.mode === "test") {
      this.testRunner.clearTimer(
        session
      );
    } else {
      this.clearRealProgressTimer(
        session
      );
      session.stopRequested = true;
      session.resumeResolver?.();
    }
    this.session = null;
  }
  emitPosition(position) {
    this.options.positionTracker.set(
      position
    );
  }
  emitProgress(session, progressOptions) {
    if (this.session !== session) {
      return;
    }
    const now = performance.now();
    if (session.mode === "real" && !progressOptions?.force && now - session.lastProgressEmitAtMs < 1e3) {
      return;
    }
    if (session.mode === "real") {
      session.lastProgressEmitAtMs = now;
    }
    const elapsedSeconds = getElapsedMilliseconds(
      session
    ) / 1e3;
    let realTiming;
    if (session.mode === "real") {
      const timing = session.timing;
      const predictedElapsed = timing.cumulativeSeconds[Math.min(
        session.currentLine,
        timing.cumulativeSeconds.length - 1
      )];
      const totalSeconds = Math.max(
        0,
        timing.totalSeconds
      );
      const heatingSeconds = Math.min(
        totalSeconds,
        Math.max(
          0,
          timing.heatingSeconds
        )
      );
      const isHeating = heatingSeconds > 0 && predictedElapsed < heatingSeconds;
      if (!isHeating && session.heatingCompletedAtActiveSeconds === null) {
        session.heatingCompletedAtActiveSeconds = elapsedSeconds;
      }
      if (isHeating) {
        realTiming = {
          percentOverride: totalSeconds > 0 ? predictedElapsed / totalSeconds * 100 : 0,
          etaSecondsOverride: Math.max(
            0,
            totalSeconds - heatingSeconds + Math.max(
              0,
              heatingSeconds - elapsedSeconds
            )
          ),
          estimatedTotalSeconds: totalSeconds,
          estimateSource: timing.source,
          estimateConfidence: "low",
          isHeating: true
        };
      } else {
        const actualHeatingSeconds = session.heatingCompletedAtActiveSeconds ?? 0;
        const live = updateLiveEta({
          state: session.calibration,
          actualPrintSeconds: Math.max(
            0,
            elapsedSeconds - actualHeatingSeconds
          ),
          predictedPrintElapsedSeconds: Math.max(
            0,
            predictedElapsed - heatingSeconds
          ),
          predictedPrintTotalSeconds: Math.max(
            0,
            totalSeconds - heatingSeconds
          ),
          baseSource: timing.source,
          baseConfidence: session.currentLine === 0 ? "low" : timing.confidence
        });
        session.calibration = live.state;
        session.lastCalibratedTotalSeconds = actualHeatingSeconds + live.calibratedTotalPrintSeconds;
        realTiming = {
          percentOverride: totalSeconds > 0 ? predictedElapsed / totalSeconds * 100 : 100,
          etaSecondsOverride: live.remainingSeconds,
          estimatedTotalSeconds: session.lastCalibratedTotalSeconds,
          estimateSource: live.source,
          estimateConfidence: live.confidence,
          isHeating: false
        };
      }
    }
    const progress = createPrintProgress({
      fileName: session.fileName,
      currentLine: session.currentLine,
      totalLines: session.totalLines,
      currentLayer: session.currentLayer,
      totalLayers: session.totalLayers,
      elapsedSeconds,
      percentOverride: progressOptions?.percentOverride,
      estimatedDurationSeconds: progressOptions?.estimatedDurationSeconds,
      ...realTiming
    });
    this.options.events.progress(
      progress
    );
  }
  finishSession(session) {
    if (this.session !== session) {
      return;
    }
    pauseSessionClock(session);
    if (session.mode === "real") {
      this.clearRealProgressTimer(
        session
      );
    }
    session.currentLine = session.totalLines;
    session.currentLayer = session.totalLayers;
    session.status = "idle";
    this.emitProgress(
      session,
      session.mode === "test" ? {
        percentOverride: 100,
        estimatedDurationSeconds: session.durationMs / 1e3
      } : {
        percentOverride: 100,
        force: true
      }
    );
    const actualSeconds = session.elapsedBeforeRunMs / 1e3;
    const originalEstimate = session.mode === "real" ? session.timing.totalSeconds : session.durationMs / 1e3;
    const finalEstimate = session.mode === "real" ? session.lastCalibratedTotalSeconds : originalEstimate;
    const absoluteError = Math.abs(
      originalEstimate - actualSeconds
    );
    this.options.events.printFinished(
      session.mode,
      actualSeconds,
      {
        originalEstimateSeconds: originalEstimate,
        finalCalibratedEstimateSeconds: finalEstimate,
        actualActiveSeconds: actualSeconds,
        absoluteErrorSeconds: absoluteError,
        percentageError: actualSeconds > 0 ? absoluteError / actualSeconds * 100 : null,
        estimateSource: session.mode === "real" ? session.calibration.sampleCount > 0 ? "live" : session.timing.source : null
      }
    );
  }
  completeStop(session, clearSession) {
    if (this.session !== session) {
      return;
    }
    if (session.mode === "real") {
      this.clearRealProgressTimer(
        session
      );
    }
    session.status = "idle";
    const mode = clearSession ? null : session.mode;
    if (clearSession) {
      this.session = null;
      this.options.positionTracker.reset();
    }
    this.options.events.printStopped(
      mode,
      this.getIdleStatus(),
      clearSession
    );
  }
  setSessionStatus(session, status) {
    if (this.session !== session) {
      return;
    }
    session.status = status;
    this.options.events.status(
      status
    );
  }
  getIdleStatus() {
    return this.options.isConnected() ? "idle" : "disconnected";
  }
  clearPendingTestStop() {
    if (this.testStopTimer === null) {
      return;
    }
    clearTimeout(
      this.testStopTimer
    );
    this.testStopTimer = null;
  }
  clearRealProgressTimer(session) {
    if (session.progressTimer === null) {
      return;
    }
    clearInterval(
      session.progressTimer
    );
    session.progressTimer = null;
  }
}
function parseAxisValue(text, axis) {
  const match = text.match(
    new RegExp(
      `(?:^|\\s)${axis}:\\s*([-+]?\\d*\\.?\\d+)`,
      "i"
    )
  );
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
function parseTemperature(line) {
  const hotendMatch = line.match(
    /(?:^|\s)T:([-+]?\d*\.?\d+)\s*\/\s*([-+]?\d*\.?\d+)/i
  );
  const bedMatch = line.match(
    /(?:^|\s)B:([-+]?\d*\.?\d+)\s*\/\s*([-+]?\d*\.?\d+)/i
  );
  if (!hotendMatch && !bedMatch) {
    return null;
  }
  return {
    timestamp: Date.now(),
    hotend: hotendMatch ? Number(hotendMatch[1]) : void 0,
    targetHotend: hotendMatch ? Number(hotendMatch[2]) : void 0,
    bed: bedMatch ? Number(bedMatch[1]) : void 0,
    targetBed: bedMatch ? Number(bedMatch[2]) : void 0
  };
}
function parsePosition(line, currentExtrusion) {
  const x = parseAxisValue(
    line,
    "X"
  );
  const y = parseAxisValue(
    line,
    "Y"
  );
  const z = parseAxisValue(
    line,
    "Z"
  );
  if (x === null || y === null || z === null) {
    return null;
  }
  const e = parseAxisValue(
    line,
    "E"
  );
  return {
    x,
    y,
    z,
    e: e ?? currentExtrusion
  };
}
function parsePrinterResponse(rawLine, currentExtrusion) {
  const line = rawLine.trim();
  return {
    acknowledge: /^ok\b/i.test(line),
    error: /^(?:error|!!)/i.test(line) ? new Error(line) : null,
    temperature: parseTemperature(line),
    position: parsePosition(
      line,
      currentExtrusion
    )
  };
}
const COMMAND_TIMEOUT_MS = 15 * 60 * 1e3;
class SerialQueue {
  constructor(connection, events, onAcknowledgedCommand) {
    this.connection = connection;
    this.events = events;
    this.onAcknowledgedCommand = onAcknowledgedCommand;
  }
  connection;
  events;
  onAcknowledgedCommand;
  pending = null;
  chain = Promise.resolve();
  generation = 0;
  get isWaiting() {
    return this.pending !== null;
  }
  queue(command) {
    const normalized = command.trim();
    if (!normalized) {
      return Promise.resolve();
    }
    const generation = this.generation;
    const task = this.chain.then(async () => {
      if (generation !== this.generation) {
        throw new Error(
          "Serial command queue was reset."
        );
      }
      await this.writeAndWaitForOk(
        normalized
      );
      this.onAcknowledgedCommand(
        normalized
      );
    });
    this.chain = task.catch(
      () => void 0
    );
    return task;
  }
  async sendMany(gcode) {
    const lines = gcode.split(/\r?\n/);
    for (const line of lines) {
      const command = stripGcodeLine(line);
      if (command) {
        await this.queue(command);
      }
    }
  }
  resolveAcknowledgement() {
    const pending = this.pending;
    if (!pending) {
      return;
    }
    this.pending = null;
    clearTimeout(
      pending.timeout
    );
    pending.resolve();
  }
  rejectAcknowledgement(error) {
    const pending = this.pending;
    if (!pending) {
      return;
    }
    this.pending = null;
    clearTimeout(
      pending.timeout
    );
    pending.reject(error);
  }
  reset(error = new Error(
    "Serial command queue reset."
  )) {
    this.generation++;
    this.rejectAcknowledgement(
      error
    );
    this.chain = Promise.resolve();
  }
  async writeAndWaitForOk(command) {
    if (!this.connection.connected) {
      throw new Error(
        "Printer is not connected."
      );
    }
    if (this.pending) {
      throw new Error(
        "Another printer command is awaiting acknowledgement."
      );
    }
    this.events.terminalOut(
      `> ${command}`
    );
    await new Promise(
      (resolve, reject) => {
        const pending = {
          resolve,
          reject,
          timeout: setTimeout(
            () => {
              if (this.pending === pending) {
                this.pending = null;
              }
              reject(
                new Error(
                  `Printer did not acknowledge: ${command}`
                )
              );
            },
            COMMAND_TIMEOUT_MS
          )
        };
        this.pending = pending;
        void this.connection.write(command).catch(
          (error) => {
            if (this.pending === pending) {
              this.pending = null;
            }
            clearTimeout(
              pending.timeout
            );
            reject(
              error instanceof Error ? error : new Error(
                String(error)
              )
            );
          }
        );
      }
    );
  }
}
const TEMPERATURE_INTERVAL_MS = 2e3;
class TemperaturePoller {
  constructor(options) {
    this.options = options;
    this.interval = setInterval(
      () => {
        this.poll();
      },
      TEMPERATURE_INTERVAL_MS
    );
  }
  options;
  interval;
  dispose() {
    clearInterval(
      this.interval
    );
  }
  poll() {
    if (!this.options.connection.connected || this.options.queue.isWaiting || this.options.isPrintActive()) {
      return;
    }
    void this.options.queue.queue("M105").catch(() => void 0);
  }
}
class NativeSerialTransport {
  port = null;
  parser = null;
  lineHandler = () => void 0;
  errorHandler = () => void 0;
  disconnectHandler = () => void 0;
  closing = false;
  get connected() {
    return this.port?.isOpen === true;
  }
  static async listPorts() {
    const ports = await serialport.SerialPort.list();
    return ports.map(
      (port) => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        vendorId: port.vendorId,
        productId: port.productId,
        pnpId: port.pnpId,
        locationId: port.locationId
      })
    );
  }
  setLineHandler(handler) {
    this.lineHandler = handler;
  }
  setErrorHandler(handler) {
    this.errorHandler = handler;
  }
  setDisconnectHandler(handler) {
    this.disconnectHandler = handler;
  }
  async connect(options) {
    if (this.connected) {
      throw new Error(
        "A printer is already connected."
      );
    }
    if (this.port) {
      await this.disconnect();
    }
    this.closing = false;
    const port = new serialport.SerialPort({
      path: options.path,
      baudRate: options.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      rtscts: false,
      autoOpen: false
    });
    const parser = port.pipe(
      new parserReadline.ReadlineParser({
        delimiter: "\n",
        encoding: "utf8"
      })
    );
    this.port = port;
    this.parser = parser;
    parser.on(
      "data",
      (line) => {
        const cleaned = line.replace(
          /\r$/,
          ""
        );
        this.lineHandler(
          cleaned
        );
      }
    );
    port.on(
      "error",
      (error) => {
        this.errorHandler(
          error
        );
      }
    );
    port.on(
      "close",
      (error) => {
        this.handleClose(
          port,
          error
        );
      }
    );
    try {
      await new Promise(
        (resolve, reject) => {
          port.open((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }
      );
    } catch (error) {
      await this.cleanupPort(
        port,
        parser
      );
      throw error;
    }
  }
  async disconnect() {
    const port = this.port;
    const parser = this.parser;
    if (!port) {
      return;
    }
    this.closing = true;
    try {
      if (port.isOpen) {
        await new Promise(
          (resolve, reject) => {
            port.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          }
        );
      }
    } finally {
      await this.cleanupPort(
        port,
        parser
      );
      this.closing = false;
    }
  }
  async write(command) {
    const port = this.port;
    if (!port || !port.isOpen) {
      throw new Error(
        "Printer is not connected."
      );
    }
    await new Promise(
      (resolve, reject) => {
        port.write(
          `${command}
`,
          (writeError) => {
            if (writeError) {
              reject(writeError);
              return;
            }
            port.drain(
              (drainError) => {
                if (drainError) {
                  reject(
                    drainError
                  );
                  return;
                }
                resolve();
              }
            );
          }
        );
      }
    );
  }
  handleClose(port, error) {
    if (this.port !== port) {
      return;
    }
    const wasExpected = this.closing;
    this.port = null;
    this.parser = null;
    if (!wasExpected) {
      this.disconnectHandler(
        error ?? new Error(
          "The printer connection was closed."
        )
      );
    }
  }
  async cleanupPort(port, parser) {
    if (this.port === port) {
      this.port = null;
    }
    if (this.parser === parser) {
      this.parser = null;
    }
    if (parser) {
      parser.removeAllListeners();
      try {
        port.unpipe(parser);
      } catch {
      }
      parser.destroy();
    }
    port.removeAllListeners();
  }
}
function statusRequiresAwakeComputer(status) {
  return status === "printing" || status === "pausing" || status === "paused" || status === "stopping";
}
class PrinterRuntime {
  constructor(options) {
    this.options = options;
    this.events = new PrinterEvents({
      postMessage: (event) => {
        this.handlePowerState(
          event
        );
        this.options.emit(
          event
        );
      }
    });
    this.connection = new NativeSerialTransport();
    this.positionTracker = new PositionTracker(
      this.events
    );
    this.serialQueue = new SerialQueue(
      this.connection,
      this.events,
      (command) => {
        this.positionTracker.trackAcknowledgedCommand(
          command
        );
      }
    );
    this.prints = new PrintSessionManager({
      events: this.events,
      serialQueue: this.serialQueue,
      positionTracker: this.positionTracker,
      isConnected: () => this.connection.connected
    });
    this.temperaturePoller = new TemperaturePoller({
      connection: this.connection,
      queue: this.serialQueue,
      isPrintActive: () => this.prints.isActive
    });
    this.configureTransport();
  }
  options;
  events;
  connection;
  positionTracker;
  serialQueue;
  prints;
  temperaturePoller;
  disposed = false;
  async listPorts() {
    return NativeSerialTransport.listPorts();
  }
  async connect(path2, baudRate) {
    if (this.disposed) {
      throw new Error(
        "Printer runtime has been disposed."
      );
    }
    if (this.connection.connected) {
      throw new Error(
        "A printer is already connected."
      );
    }
    await this.connection.connect({
      path: path2,
      baudRate
    });
    this.events.connected();
    await this.serialQueue.queue("M114").catch(() => void 0);
  }
  async disconnect() {
    this.prints.handleDisconnect();
    this.serialQueue.reset(
      new Error(
        "Printer disconnected."
      )
    );
    await this.connection.disconnect();
    this.events.disconnected(
      false
    );
  }
  async sendGcode(gcode) {
    try {
      await this.serialQueue.sendMany(gcode);
    } catch (error) {
      this.events.error(error);
      throw error;
    }
  }
  startPrint(print) {
    this.prints.startReal(print);
  }
  startTestPrint(print) {
    this.prints.startTest({
      fileName: print.fileName,
      printableLines: print.printableLines,
      totalLayers: print.totalLayers,
      path: print.path
    });
  }
  pausePrint() {
    this.prints.pause();
  }
  resumePrint() {
    this.prints.resume();
  }
  stopPrint() {
    this.prints.stop();
  }
  resetPrint() {
    this.prints.reset();
  }
  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.temperaturePoller.dispose();
    this.prints.handleDisconnect();
    this.serialQueue.reset(
      new Error(
        "Printer runtime disposed."
      )
    );
    await this.connection.disconnect().catch(() => void 0);
    this.options.setPrintingActive(
      false
    );
  }
  configureTransport() {
    this.connection.setLineHandler(
      (rawLine) => {
        const line = rawLine.trim();
        if (!line) {
          return;
        }
        this.events.terminalIn(
          line
        );
        const response = parsePrinterResponse(
          line,
          this.positionTracker.current.e
        );
        if (response.temperature) {
          this.events.temperature(
            response.temperature
          );
        }
        if (response.position) {
          this.positionTracker.set(
            response.position
          );
        }
        if (response.error) {
          this.serialQueue.rejectAcknowledgement(
            response.error
          );
        }
        if (response.acknowledge) {
          this.serialQueue.resolveAcknowledgement();
        }
      }
    );
    this.connection.setErrorHandler(
      (error) => {
        this.events.error(
          error
        );
      }
    );
    this.connection.setDisconnectHandler(
      (error) => {
        this.prints.handleDisconnect();
        this.serialQueue.reset(
          error ?? new Error(
            "Printer disconnected."
          )
        );
        if (error) {
          this.events.error(
            error
          );
        }
        this.events.disconnected(
          true
        );
      }
    );
  }
  handlePowerState(event) {
    switch (event.type) {
      case "PRINT_STARTED": {
        this.options.setPrintingActive(
          true
        );
        break;
      }
      case "STATUS": {
        this.options.setPrintingActive(
          statusRequiresAwakeComputer(
            event.status
          )
        );
        break;
      }
      case "PRINT_FINISHED":
      case "PRINT_STOPPED":
      case "PRINT_RESET":
      case "DISCONNECTED": {
        this.options.setPrintingActive(
          false
        );
        break;
      }
    }
  }
}
function formatPortLabel(port) {
  const description = [
    port.manufacturer,
    port.vendorId && port.productId ? `VID ${port.vendorId} / PID ${port.productId}` : null
  ].filter((value) => Boolean(value));
  return description.length > 0 ? `${port.path} - ${description.join(" - ")}` : port.path;
}
async function choosePrinterPort(window, ports) {
  if (ports.length === 0) {
    await electron.dialog.showMessageBox(window, {
      type: "warning",
      title: "No serial ports found",
      message: "No serial devices were detected.",
      detail: "Connect the printer through USB, verify its driver is installed, and try again.",
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    return null;
  }
  const labels = ports.map(formatPortLabel);
  const cancelIndex = labels.length;
  const result = await electron.dialog.showMessageBox(window, {
    type: "question",
    title: "Select printer port",
    message: "Choose the USB serial port used by your 3D printer.",
    detail: "On Windows, the printer normally appears as COM3, COM4, or another COM port.",
    buttons: [...labels, "Cancel"],
    defaultId: 0,
    cancelId: cancelIndex,
    noLink: true
  });
  return ports[result.response] ?? null;
}
function assertBaudRate(value) {
  const baudRate = value === void 0 ? 115200 : Number(value);
  if (!Number.isInteger(baudRate) || baudRate < 1200 || baudRate > 2e6) {
    throw new Error("Invalid serial baud rate.");
  }
  return baudRate;
}
function assertRealPrintPayload(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid real-print payload.");
  }
  const print = value;
  if (typeof print.fileName !== "string" || print.fileName.trim().length === 0) {
    throw new Error("Print file name is missing.");
  }
  if (!Array.isArray(print.lines) || !print.lines.every((line) => typeof line === "string")) {
    throw new Error("Print payload contains invalid G-code lines.");
  }
  if (!Number.isInteger(print.totalLayers) || (print.totalLayers ?? -1) < 0) {
    throw new Error("Print payload contains an invalid layer count.");
  }
  const timing = print.timing;
  if (!timing || !(timing.cumulativeSeconds instanceof Float32Array) || timing.cumulativeSeconds.length < 1 || typeof timing.totalSeconds !== "number" || !Number.isFinite(timing.totalSeconds) || timing.totalSeconds < 0 || typeof timing.heatingSeconds !== "number" || !Number.isFinite(timing.heatingSeconds) || timing.heatingSeconds < 0 || timing.heatingSeconds > timing.totalSeconds || timing.source !== "slicer" && timing.source !== "motion" || timing.confidence !== "low" && timing.confidence !== "medium" && timing.confidence !== "high") {
    throw new Error(
      "Print payload contains an invalid timing model."
    );
  }
}
function assertTestPrintPayload(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid test-print payload.");
  }
  const print = value;
  const path2 = print.path;
  if (typeof print.fileName !== "string" || print.fileName.trim().length === 0 || !Number.isInteger(print.totalLayers) || (print.totalLayers ?? -1) < 0 || !Number.isInteger(print.printableLines) || (print.printableLines ?? -1) < 0 || !path2 || !(path2.coordinates instanceof Float32Array) || !(path2.commandIndexes instanceof Uint32Array) || !(path2.layers instanceof Uint32Array) || !(path2.extruding instanceof Uint8Array) || path2.coordinates.length !== path2.commandIndexes.length * 6 || path2.layers.length !== path2.commandIndexes.length || path2.extruding.length !== path2.commandIndexes.length) {
    throw new Error("Invalid test-print payload.");
  }
}
function registerPrinterIpc({
  getWindow,
  runtime
}) {
  const channels = [
    PRINTER_IPC.listPorts,
    PRINTER_IPC.connect,
    PRINTER_IPC.disconnect,
    PRINTER_IPC.sendGcode,
    PRINTER_IPC.startPrint,
    PRINTER_IPC.startTestPrint,
    PRINTER_IPC.pausePrint,
    PRINTER_IPC.resumePrint,
    PRINTER_IPC.stopPrint,
    PRINTER_IPC.resetPrint
  ];
  for (const channel of channels) {
    electron.ipcMain.removeHandler(channel);
  }
  electron.ipcMain.handle(PRINTER_IPC.listPorts, (event) => {
    assertTrustedSender(event, getWindow());
    return runtime.listPorts();
  });
  electron.ipcMain.handle(
    PRINTER_IPC.connect,
    async (event, requestedBaudRate) => {
      const window = assertTrustedSender(event, getWindow());
      const baudRate = assertBaudRate(requestedBaudRate);
      const selectedPort = await choosePrinterPort(
        window,
        await runtime.listPorts()
      );
      if (!selectedPort) {
        return null;
      }
      await runtime.connect(selectedPort.path, baudRate);
      return {
        path: selectedPort.path,
        baudRate
      };
    }
  );
  electron.ipcMain.handle(PRINTER_IPC.disconnect, async (event) => {
    assertTrustedSender(event, getWindow());
    await runtime.disconnect();
  });
  electron.ipcMain.handle(
    PRINTER_IPC.sendGcode,
    async (event, value) => {
      assertTrustedSender(event, getWindow());
      if (typeof value !== "string") {
        throw new Error("G-code must be a string.");
      }
      await runtime.sendGcode(value);
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.startPrint,
    (event, value) => {
      assertTrustedSender(event, getWindow());
      assertRealPrintPayload(value);
      runtime.startPrint(value);
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.startTestPrint,
    (event, value) => {
      assertTrustedSender(event, getWindow());
      assertTestPrintPayload(value);
      runtime.startTestPrint(value);
    }
  );
  electron.ipcMain.handle(PRINTER_IPC.pausePrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.pausePrint();
  });
  electron.ipcMain.handle(PRINTER_IPC.resumePrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.resumePrint();
  });
  electron.ipcMain.handle(PRINTER_IPC.stopPrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.stopPrint();
  });
  electron.ipcMain.handle(PRINTER_IPC.resetPrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.resetPrint();
  });
  return () => {
    for (const channel of channels) {
      electron.ipcMain.removeHandler(channel);
    }
  };
}
function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function openExternalUrl(value) {
  if (isSafeExternalUrl(value)) {
    void electron.shell.openExternal(value);
  }
}
function isDevelopmentNavigationAllowed(url, developmentUrl) {
  if (electron.app.isPackaged || !developmentUrl) {
    return false;
  }
  try {
    return new URL(url).origin === new URL(developmentUrl).origin;
  } catch {
    return false;
  }
}
function createMainWindow$1(icon) {
  const window = new electron.BrowserWindow({
    title: "PrintInterface",
    icon,
    width: 1500,
    height: 950,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#0b0e14",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  });
  window.once("ready-to-show", () => {
    window.show();
  });
  window.on("minimize", () => {
    setTimeout(() => {
      if (!window.isDestroyed()) {
        window.hide();
        window.setSkipTaskbar(true);
      }
    }, 0);
  });
  window.on("show", () => {
    window.setSkipTaskbar(false);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url === window.webContents.getURL() || isDevelopmentNavigationAllowed(
      url,
      process.env["ELECTRON_RENDERER_URL"]
    )) {
      return;
    }
    event.preventDefault();
    openExternalUrl(url);
  });
  const developmentUrl = process.env["ELECTRON_RENDERER_URL"];
  if (!electron.app.isPackaged && developmentUrl) {
    void window.loadURL(developmentUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(
      path.join(__dirname, "../renderer/index.html")
    );
  }
  return window;
}
function createTray(icon, showMainWindow2) {
  const tray2 = new electron.Tray(
    icon.resize({
      width: 32,
      height: 32,
      quality: "best"
    })
  );
  tray2.setToolTip("PrintInterface");
  tray2.setContextMenu(
    electron.Menu.buildFromTemplate([
      {
        label: "Open PrintInterface",
        click: showMainWindow2
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => electron.app.quit()
      }
    ])
  );
  tray2.on("click", showMainWindow2);
  tray2.on("double-click", showMainWindow2);
  return tray2;
}
const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: true,
  printStarted: true,
  printPaused: true,
  printCompleted: true,
  printStopped: true,
  printerDisconnected: true,
  printerErrors: true,
  temperatureReached: false
};
const MAXIMUM_RECENT_FILES = 10;
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseRecentFiles(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry) => {
      if (!isRecord(entry)) {
        return false;
      }
      return typeof entry.path === "string" && path.isAbsolute(
        entry.path
      ) && typeof entry.name === "string" && entry.name.length > 0 && typeof entry.size === "number" && Number.isFinite(
        entry.size
      ) && entry.size >= 0 && typeof entry.lastOpenedAt === "number" && Number.isFinite(
        entry.lastOpenedAt
      );
    }
  ).slice(0, MAXIMUM_RECENT_FILES);
}
function parseNotificationPreferences(value) {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES
    };
  }
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  return Object.fromEntries(
    Object.entries(defaults).map(
      ([key, fallback]) => [
        key,
        typeof value[key] === "boolean" ? value[key] : fallback
      ]
    )
  );
}
class AppSettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  snapshot = {
    recentFiles: [],
    notifications: {
      ...DEFAULT_NOTIFICATION_PREFERENCES
    }
  };
  writeChain = Promise.resolve();
  async load() {
    try {
      const text = await node_fs.promises.readFile(
        this.filePath,
        "utf8"
      );
      const value = JSON.parse(text);
      if (!isRecord(value)) {
        return;
      }
      this.snapshot = {
        recentFiles: parseRecentFiles(
          value.recentFiles
        ),
        notifications: parseNotificationPreferences(
          value.notifications
        )
      };
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT") {
        console.error(
          "Unable to load application settings.",
          error
        );
      }
    }
  }
  getSnapshot() {
    return {
      recentFiles: this.snapshot.recentFiles.map(
        (entry) => ({
          ...entry
        })
      ),
      notifications: {
        ...this.snapshot.notifications
      }
    };
  }
  async addRecentFile(entry) {
    const normalizedPath = path.normalize(entry.path);
    const remaining = this.snapshot.recentFiles.filter(
      (item) => path.normalize(
        item.path
      ).toLowerCase() !== normalizedPath.toLowerCase()
    );
    this.snapshot.recentFiles = [
      {
        ...entry,
        path: normalizedPath
      },
      ...remaining
    ].slice(0, MAXIMUM_RECENT_FILES);
    await this.persist();
    return this.getSnapshot().recentFiles;
  }
  async removeRecentFile(filePath) {
    const normalized = path.normalize(
      filePath
    ).toLowerCase();
    this.snapshot.recentFiles = this.snapshot.recentFiles.filter(
      (entry) => path.normalize(entry.path).toLowerCase() !== normalized
    );
    await this.persist();
    return this.getSnapshot().recentFiles;
  }
  async clearRecentFiles() {
    this.snapshot.recentFiles = [];
    await this.persist();
    return [];
  }
  async updateNotifications(update) {
    this.snapshot.notifications = {
      ...this.snapshot.notifications,
      ...update
    };
    await this.persist();
    return {
      ...this.snapshot.notifications
    };
  }
  persist() {
    const snapshot = JSON.stringify(
      this.snapshot,
      null,
      2
    );
    const directory = path.dirname(
      this.filePath
    );
    const temporaryPath = `${this.filePath}.tmp`;
    this.writeChain = this.writeChain.catch(
      () => void 0
    ).then(
      async () => {
        await node_fs.promises.mkdir(
          directory,
          {
            recursive: true
          }
        );
        await node_fs.promises.writeFile(
          temporaryPath,
          snapshot,
          "utf8"
        );
        await node_fs.promises.rename(
          temporaryPath,
          this.filePath
        );
      }
    );
    return this.writeChain;
  }
}
const TARGET_TOLERANCE_CELSIUS = 2;
class NotificationService {
  constructor(options) {
    this.options = options;
  }
  options;
  fileName = null;
  activePrint = false;
  lastStatus = null;
  hotend = {
    current: 0,
    target: 0,
    notifiedTarget: null
  };
  bed = {
    current: 0,
    target: 0,
    notifiedTarget: null
  };
  handle(event) {
    switch (event.type) {
      case "PRINT_STARTED": {
        this.fileName = event.fileName;
        this.activePrint = true;
        this.lastStatus = "printing";
        this.notify(
          "printStarted",
          "Print started",
          event.fileName
        );
        break;
      }
      case "STATUS": {
        this.handleStatus(
          event.status
        );
        break;
      }
      case "PRINT_FINISHED": {
        if (this.activePrint) {
          this.notify(
            "printCompleted",
            "Print completed",
            this.fileName ?? "The print completed successfully."
          );
        }
        this.activePrint = false;
        this.lastStatus = "idle";
        break;
      }
      case "PRINT_STOPPED": {
        if (this.activePrint) {
          this.notify(
            "printStopped",
            "Print stopped",
            this.fileName ?? "The active print was stopped."
          );
        }
        this.activePrint = false;
        this.lastStatus = event.status;
        break;
      }
      case "PRINT_RESET": {
        this.activePrint = false;
        this.fileName = null;
        this.lastStatus = event.status;
        break;
      }
      case "DISCONNECTED": {
        if (event.unexpected) {
          this.notify(
            "printerDisconnected",
            "Printer disconnected",
            this.activePrint && this.fileName ? `Connection lost while printing ${this.fileName}.` : "The printer connection was lost."
          );
        }
        this.activePrint = false;
        this.lastStatus = "disconnected";
        break;
      }
      case "ERROR": {
        this.notify(
          "printerErrors",
          "Printer error",
          event.message
        );
        break;
      }
      case "TEMPERATURE": {
        this.updateHeater(
          "Hotend",
          this.hotend,
          event.hotend,
          event.targetHotend
        );
        this.updateHeater(
          "Bed",
          this.bed,
          event.bed,
          event.targetBed
        );
        break;
      }
    }
  }
  handleStatus(status) {
    if (status === this.lastStatus) {
      return;
    }
    if (status === "paused") {
      this.notify(
        "printPaused",
        "Print paused",
        this.fileName ?? "The print is paused."
      );
    } else if (status === "printing" && this.lastStatus === "paused") {
      this.notify(
        "printPaused",
        "Print resumed",
        this.fileName ?? "The print has resumed."
      );
    }
    this.lastStatus = status;
  }
  updateHeater(name, state, current, target) {
    if (target !== void 0 && target !== state.target) {
      state.target = target;
      state.notifiedTarget = null;
    }
    if (current !== void 0) {
      state.current = current;
    }
    if (state.target <= 0 || state.notifiedTarget === state.target || Math.abs(
      state.current - state.target
    ) > TARGET_TOLERANCE_CELSIUS) {
      return;
    }
    state.notifiedTarget = state.target;
    this.notify(
      "temperatureReached",
      `${name} temperature reached`,
      `${Math.round(
        state.current
      )} °C / ${Math.round(
        state.target
      )} °C`
    );
  }
  notify(preference, title, body) {
    const settings = this.options.settings.getSnapshot().notifications;
    const window = this.options.getWindow();
    if (!settings.enabled || !settings[preference] || !electron.Notification.isSupported() || window && !window.isDestroyed() && window.isVisible() && window.isFocused()) {
      return;
    }
    const notification = new electron.Notification({
      title,
      body,
      icon: this.options.getIcon().resize({
        width: 256,
        height: 256,
        quality: "best"
      })
    });
    notification.on(
      "click",
      () => {
        this.options.showWindow();
      }
    );
    notification.show();
  }
}
let mainWindow = null;
let tray = null;
let printerRuntime = null;
let unregisterPrinterIpc = null;
let unregisterDesktopIpc = null;
let settingsStore = null;
let notificationService = null;
let appIcon = null;
const sleepBlocker = new PrintSleepBlocker();
function getAppIconPath() {
  return electron.app.isPackaged ? path.join(process.resourcesPath, "tray-icon.png") : path.join(
    electron.app.getAppPath(),
    "resources",
    "tray-icon.png"
  );
}
function getAppIcon() {
  if (appIcon) {
    return appIcon;
  }
  const icon = electron.nativeImage.createFromPath(
    getAppIconPath()
  );
  if (icon.isEmpty()) {
    throw new Error(
      `Unable to load application icon: ${getAppIconPath()}`
    );
  }
  appIcon = icon;
  return icon;
}
function initialisePrinter() {
  if (printerRuntime) {
    return;
  }
  printerRuntime = new PrinterRuntime({
    emit: (event) => {
      notificationService?.handle(
        event
      );
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(PRINTER_IPC.event, event);
      }
    },
    setPrintingActive: (active) => {
      sleepBlocker.setPrintingActive(active);
    }
  });
  unregisterPrinterIpc = registerPrinterIpc({
    getWindow: () => mainWindow,
    runtime: printerRuntime
  });
  if (settingsStore && !unregisterDesktopIpc) {
    unregisterDesktopIpc = registerDesktopIpc({
      getWindow: () => mainWindow,
      settings: settingsStore
    });
  }
}
function createMainWindow() {
  const window = createMainWindow$1(
    getAppIcon()
  );
  mainWindow = window;
  initialisePrinter();
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}
const hasSingleInstanceLock = electron.app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", showMainWindow);
  void electron.app.whenReady().then(async () => {
    if (process.platform === "win32") {
      electron.app.setAppUserModelId("dk.patrick.PrintInterface");
    }
    settingsStore = new AppSettingsStore(
      path.join(
        electron.app.getPath("userData"),
        "settings.json"
      )
    );
    await settingsStore.load();
    notificationService = new NotificationService({
      getWindow: () => mainWindow,
      showWindow: showMainWindow,
      getIcon: getAppIcon,
      settings: settingsStore
    });
    createMainWindow();
    tray = createTray(
      getAppIcon(),
      showMainWindow
    );
    electron.app.on("activate", showMainWindow);
  });
}
electron.app.on("before-quit", () => {
  unregisterDesktopIpc?.();
  unregisterDesktopIpc = null;
  unregisterPrinterIpc?.();
  unregisterPrinterIpc = null;
  void printerRuntime?.dispose();
  printerRuntime = null;
  sleepBlocker.dispose();
  tray?.destroy();
  tray = null;
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
