"use strict";
const electron = require("electron");
const path = require("node:path");
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
class WorkerEvents {
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
  disconnected() {
    this.post({
      type: "DISCONNECTED"
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
  printFinished(mode, elapsedSeconds) {
    this.post({
      type: "PRINT_FINISHED",
      mode,
      elapsedSeconds
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
function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}
function estimateTestDurationSeconds(segmentCount) {
  const estimated = segmentCount / SEGMENTS_PER_SECOND;
  return clamp(
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
  percentOverride
}) {
  const safeTotalLines = Math.max(
    0,
    totalLines
  );
  const safeCurrentLine = clamp(
    currentLine,
    0,
    safeTotalLines
  );
  const calculatedPercent = safeTotalLines === 0 ? 100 : safeCurrentLine / safeTotalLines * 100;
  const percent = clamp(
    percentOverride ?? calculatedPercent,
    0,
    100
  );
  let etaSeconds = 0;
  if (estimatedDurationSeconds !== void 0) {
    etaSeconds = Math.max(
      0,
      estimatedDurationSeconds - elapsedSeconds
    );
  } else if (safeCurrentLine > 0 && safeCurrentLine < safeTotalLines) {
    const secondsPerCommand = elapsedSeconds / safeCurrentLine;
    etaSeconds = secondsPerCommand * (safeTotalLines - safeCurrentLine);
  }
  return {
    fileName,
    currentLine: safeCurrentLine,
    totalLines: safeTotalLines,
    currentLayer: clamp(
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
    )
  };
}
function calculateTestFrame(segments, printableLines, totalLayers, elapsedMilliseconds, durationMilliseconds) {
  const safeDuration = Math.max(
    1,
    durationMilliseconds
  );
  const ratio = clamp(
    elapsedMilliseconds / safeDuration,
    0,
    1
  );
  if (segments.length === 0) {
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
  const segmentProgress = ratio * segments.length;
  const segmentIndex = Math.min(
    segments.length - 1,
    Math.floor(segmentProgress)
  );
  const segment = segments[segmentIndex];
  const localRatio = ratio >= 1 ? 1 : segmentProgress - segmentIndex;
  const position = {
    x: segment.start.x + (segment.end.x - segment.start.x) * localRatio,
    y: segment.start.y + (segment.end.y - segment.start.y) * localRatio,
    z: segment.start.z + (segment.end.z - segment.start.z) * localRatio,
    e: segment.extruding ? localRatio : 0
  };
  return {
    finished: ratio >= 1,
    ratio,
    currentLine: ratio >= 1 ? printableLines : Math.max(
      0,
      segment.commandIndex - 1
    ),
    currentLayer: ratio >= 1 ? totalLayers : segment.layer,
    position
  };
}
function stripGcodeLine(rawLine) {
  const withoutComment = rawLine.split(";")[0];
  const withoutChecksum = withoutComment.split("*")[0];
  return withoutChecksum.replace(
    /^\s*N\d+\s+/i,
    ""
  ).trim();
}
function detectLayerMarkerMode(lines) {
  if (lines.some(
    (line) => /^\s*;\s*LAYER:\s*\d+/i.test(
      line
    )
  )) {
    return "numbered";
  }
  if (lines.some(
    (line) => /^\s*;\s*LAYER_CHANGE\b/i.test(
      line
    )
  )) {
    return "change";
  }
  if (lines.some(
    (line) => /^\s*;\s*Z:\s*[-+]?\d/i.test(
      line
    )
  )) {
    return "z";
  }
  return "none";
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
  const commands = [];
  let currentLayer = 1;
  let sequentialLayer = 0;
  for (const rawLine of lines) {
    if (markerMode === "numbered") {
      const match = rawLine.match(
        /^\s*;\s*LAYER:\s*(\d+)/i
      );
      if (match) {
        currentLayer = Number(match[1]) + 1;
      }
    } else if (markerMode === "change" && /^\s*;\s*LAYER_CHANGE\b/i.test(
      rawLine
    )) {
      sequentialLayer++;
      currentLayer = Math.max(
        1,
        sequentialLayer
      );
    } else if (markerMode === "z" && /^\s*;\s*Z:\s*[-+]?\d/i.test(
      rawLine
    )) {
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
    commands.push({
      text: command,
      layer: clampLayer(
        currentLayer,
        totalLayers
      )
    });
  }
  return commands;
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
      for (let index = 0; index < session.commands.length; index++) {
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
        const command = session.commands[index];
        await this.queue.queue(
          command.text
        );
        if (!this.context.isCurrent(
          session
        )) {
          return;
        }
        session.currentLine = index + 1;
        session.currentLayer = command.layer;
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
      session.segments,
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
    const session = {
      ...createBaseSession(
        "real",
        payload.fileName,
        commands.length,
        payload.totalLayers
      ),
      mode: "real",
      commands
    };
    this.session = session;
    this.options.events.printStarted(
      "real",
      payload.fileName,
      commands.length,
      payload.totalLayers
    );
    this.emitProgress(session);
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
      payload.segments.length
    );
    const session = {
      ...createBaseSession(
        "test",
        payload.fileName,
        payload.printableLines,
        payload.totalLayers
      ),
      mode: "test",
      segments: payload.segments,
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
    const firstSegment = payload.segments[0];
    if (firstSegment) {
      this.emitPosition({
        x: firstSegment.start.x,
        y: firstSegment.start.y,
        z: firstSegment.start.z,
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
    const elapsedSeconds = getElapsedMilliseconds(
      session
    ) / 1e3;
    const progress = createPrintProgress({
      fileName: session.fileName,
      currentLine: session.currentLine,
      totalLines: session.totalLines,
      currentLayer: session.currentLayer,
      totalLayers: session.totalLayers,
      elapsedSeconds,
      percentOverride: progressOptions?.percentOverride,
      estimatedDurationSeconds: progressOptions?.estimatedDurationSeconds
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
    session.currentLine = session.totalLines;
    session.currentLayer = session.totalLayers;
    session.status = "idle";
    this.emitProgress(
      session,
      session.mode === "test" ? {
        percentOverride: 100,
        estimatedDurationSeconds: session.durationMs / 1e3
      } : {
        percentOverride: 100
      }
    );
    this.options.events.printFinished(
      session.mode,
      session.elapsedBeforeRunMs / 1e3
    );
  }
  completeStop(session, clearSession) {
    if (this.session !== session) {
      return;
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
    const commands = gcode.split(/\r?\n/).map(
      (line) => stripGcodeLine(line)
    ).filter(
      (command) => command.length > 0
    );
    for (const command of commands) {
      await this.queue(command);
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
    this.events = new WorkerEvents({
      postMessage: (message) => {
        const event = message;
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
    this.events.disconnected();
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
  startTestPrint(gcode) {
    this.prints.startTest({
      fileName: gcode.fileName,
      printableLines: gcode.printableLines,
      totalLayers: gcode.totalLayers,
      segments: gcode.segments
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
        this.events.disconnected();
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
function assertTrustedSender(event, window) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents) {
    throw new Error(
      "Unauthorized printer request."
    );
  }
  return window;
}
function assertBaudRate(value) {
  const baudRate = value === void 0 ? 115200 : Number(value);
  if (!Number.isInteger(
    baudRate
  ) || baudRate < 1200 || baudRate > 2e6) {
    throw new Error(
      "Invalid serial baud rate."
    );
  }
  return baudRate;
}
function assertRealPrintPayload(value) {
  if (!value || typeof value !== "object") {
    throw new Error(
      "Invalid real-print payload."
    );
  }
  const print = value;
  if (typeof print.fileName !== "string" || print.fileName.trim().length === 0) {
    throw new Error(
      "Print file name is missing."
    );
  }
  if (!Array.isArray(print.lines) || !print.lines.every(
    (line) => typeof line === "string"
  )) {
    throw new Error(
      "Print payload contains invalid G-code lines."
    );
  }
  if (typeof print.totalLayers !== "number" || !Number.isFinite(
    print.totalLayers
  ) || print.totalLayers < 0) {
    throw new Error(
      "Print payload contains an invalid layer count."
    );
  }
}
function assertParsedGcode(value) {
  if (!value || typeof value !== "object") {
    throw new Error(
      "Invalid test-print payload."
    );
  }
  const gcode = value;
  if (typeof gcode.fileName !== "string" || !Array.isArray(gcode.lines) || !Array.isArray(gcode.segments) || typeof gcode.totalLayers !== "number" || typeof gcode.printableLines !== "number") {
    throw new Error(
      "Invalid test-print payload."
    );
  }
}
function formatPortLabel(port) {
  const description = [
    port.manufacturer,
    port.vendorId && port.productId ? `VID ${port.vendorId} / PID ${port.productId}` : null
  ].filter(
    (value) => Boolean(value)
  );
  return description.length > 0 ? `${port.path} — ${description.join(" — ")}` : port.path;
}
async function choosePort(window, ports) {
  if (ports.length === 0) {
    await electron.dialog.showMessageBox(
      window,
      {
        type: "warning",
        title: "No serial ports found",
        message: "No serial devices were detected.",
        detail: "Connect the printer through USB, verify its driver is installed, and try again.",
        buttons: ["OK"],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      }
    );
    return null;
  }
  const labels = ports.map(
    formatPortLabel
  );
  const cancelIndex = labels.length;
  const result = await electron.dialog.showMessageBox(
    window,
    {
      type: "question",
      title: "Select printer port",
      message: "Choose the USB serial port used by your 3D printer.",
      detail: "On Windows, the printer normally appears as COM3, COM4, or another COM port.",
      buttons: [
        ...labels,
        "Cancel"
      ],
      defaultId: 0,
      cancelId: cancelIndex,
      noLink: true
    }
  );
  return ports[result.response] ?? null;
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
    electron.ipcMain.removeHandler(
      channel
    );
  }
  electron.ipcMain.handle(
    PRINTER_IPC.listPorts,
    async (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      return runtime.listPorts();
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.connect,
    async (event, requestedBaudRate) => {
      const window = assertTrustedSender(
        event,
        getWindow()
      );
      const baudRate = assertBaudRate(
        requestedBaudRate
      );
      const ports = await runtime.listPorts();
      const selectedPort = await choosePort(
        window,
        ports
      );
      if (!selectedPort) {
        return null;
      }
      await runtime.connect(
        selectedPort.path,
        baudRate
      );
      return {
        path: selectedPort.path,
        baudRate
      };
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.disconnect,
    async (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      await runtime.disconnect();
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.sendGcode,
    async (event, value) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      if (typeof value !== "string") {
        throw new Error(
          "G-code must be a string."
        );
      }
      await runtime.sendGcode(
        value
      );
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.startPrint,
    (event, value) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      assertRealPrintPayload(
        value
      );
      runtime.startPrint(
        value
      );
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.startTestPrint,
    (event, value) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      assertParsedGcode(
        value
      );
      runtime.startTestPrint(
        value
      );
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.pausePrint,
    (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      runtime.pausePrint();
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.resumePrint,
    (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      runtime.resumePrint();
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.stopPrint,
    (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      runtime.stopPrint();
    }
  );
  electron.ipcMain.handle(
    PRINTER_IPC.resetPrint,
    (event) => {
      assertTrustedSender(
        event,
        getWindow()
      );
      runtime.resetPrint();
    }
  );
  return () => {
    for (const channel of channels) {
      electron.ipcMain.removeHandler(
        channel
      );
    }
  };
}
let mainWindow = null;
let tray = null;
let printerRuntime = null;
let unregisterPrinterIpc = null;
const sleepBlocker = new PrintSleepBlocker();
function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function openExternalUrl(value) {
  if (!isSafeExternalUrl(value)) {
    return;
  }
  void electron.shell.openExternal(
    value
  );
}
function getAppIconPath() {
  if (electron.app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "tray-icon.png"
    );
  }
  return path.join(
    process.cwd(),
    "resources",
    "tray-icon.png"
  );
}
function initialisePrinter() {
  if (printerRuntime) {
    return;
  }
  printerRuntime = new PrinterRuntime({
    emit: (event) => {
      const window = mainWindow;
      if (!window || window.isDestroyed()) {
        return;
      }
      window.webContents.send(
        PRINTER_IPC.event,
        event
      );
    },
    setPrintingActive: (active) => {
      sleepBlocker.setPrintingActive(
        active
      );
    }
  });
  unregisterPrinterIpc = registerPrinterIpc({
    getWindow: () => mainWindow,
    runtime: printerRuntime
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
function createTray() {
  if (tray) {
    return;
  }
  tray = new electron.Tray(
    getAppIconPath()
  );
  tray.setToolTip(
    "Web Pronterface"
  );
  tray.setContextMenu(
    electron.Menu.buildFromTemplate([
      {
        label: "Open Web Pronterface",
        click: () => {
          showMainWindow();
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => {
          electron.app.quit();
        }
      }
    ])
  );
  tray.on(
    "click",
    showMainWindow
  );
  tray.on(
    "double-click",
    showMainWindow
  );
}
function createMainWindow() {
  const window = new electron.BrowserWindow({
    title: "PrintInterface",
    icon: getAppIconPath(),
    width: 1500,
    height: 950,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#0b0e14",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(
        __dirname,
        "../preload/index.js"
      ),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  });
  mainWindow = window;
  initialisePrinter();
  window.once(
    "ready-to-show",
    () => {
      window.show();
    }
  );
  window.on(
    "minimize",
    () => {
      setTimeout(() => {
        if (window.isDestroyed()) {
          return;
        }
        window.hide();
        window.setSkipTaskbar(
          true
        );
      }, 0);
    }
  );
  window.on(
    "show",
    () => {
      window.setSkipTaskbar(
        false
      );
    }
  );
  window.webContents.setWindowOpenHandler(
    ({ url }) => {
      openExternalUrl(url);
      return {
        action: "deny"
      };
    }
  );
  window.webContents.on(
    "will-navigate",
    (event, url) => {
      const currentUrl = window.webContents.getURL();
      if (url === currentUrl) {
        return;
      }
      const developmentUrl2 = process.env["ELECTRON_RENDERER_URL"];
      if (!electron.app.isPackaged && developmentUrl2) {
        try {
          if (new URL(url).origin === new URL(
            developmentUrl2
          ).origin) {
            return;
          }
        } catch {
        }
      }
      event.preventDefault();
      openExternalUrl(url);
    }
  );
  const developmentUrl = process.env["ELECTRON_RENDERER_URL"];
  if (!electron.app.isPackaged && developmentUrl) {
    void window.loadURL(
      developmentUrl
    );
    window.webContents.openDevTools({
      mode: "detach"
    });
  } else {
    void window.loadFile(
      path.join(
        __dirname,
        "../renderer/index.html"
      )
    );
  }
  window.on(
    "closed",
    () => {
      if (mainWindow === window) {
        mainWindow = null;
      }
    }
  );
}
const hasSingleInstanceLock = electron.app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  electron.app.quit();
} else {
  electron.app.on(
    "second-instance",
    showMainWindow
  );
  void electron.app.whenReady().then(
    () => {
      if (process.platform === "win32") {
        electron.app.setAppUserModelId(
          "dk.patrick.webpronterface"
        );
      }
      createMainWindow();
      createTray();
      electron.app.on(
        "activate",
        showMainWindow
      );
    }
  );
}
electron.app.on(
  "before-quit",
  () => {
    unregisterPrinterIpc?.();
    unregisterPrinterIpc = null;
    void printerRuntime?.dispose();
    printerRuntime = null;
    sleepBlocker.dispose();
    tray?.destroy();
    tray = null;
  }
);
electron.app.on(
  "window-all-closed",
  () => {
    if (process.platform !== "darwin") {
      electron.app.quit();
    }
  }
);
