(function() {
  "use strict";
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
    constructor(events2) {
      this.events = events2;
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
  class SerialConnection {
    constructor(events2) {
      this.events = events2;
    }
    events;
    reader = null;
    writer = null;
    connectedState = false;
    disconnecting = false;
    incomingBuffer = "";
    lineHandler = null;
    encoder = new TextEncoder();
    decoder = new TextDecoder();
    get connected() {
      return this.connectedState;
    }
    setLineHandler(handler) {
      this.lineHandler = handler;
    }
    async connect(payload) {
      if (this.connectedState) {
        return;
      }
      this.disconnecting = false;
      this.incomingBuffer = "";
      try {
        this.reader = payload.readable.getReader();
        this.writer = payload.writable.getWriter();
        this.connectedState = true;
        this.events.connected();
        void this.runReadLoop(
          this.reader
        );
      } catch (error) {
        this.connectedState = false;
        await this.releaseStreams();
        throw error;
      }
    }
    async disconnect() {
      if (!this.connectedState && !this.reader && !this.writer) {
        return;
      }
      this.disconnecting = true;
      this.connectedState = false;
      await this.releaseStreams();
      this.incomingBuffer = "";
      this.events.disconnected();
      this.disconnecting = false;
    }
    async write(command) {
      if (!this.connectedState || !this.writer) {
        throw new Error(
          "Printer is not connected."
        );
      }
      await this.writer.write(
        this.encoder.encode(
          `${command}
`
        )
      );
    }
    async runReadLoop(activeReader) {
      try {
        while (this.reader === activeReader) {
          const result = await activeReader.read();
          if (result.done) {
            break;
          }
          this.incomingBuffer += this.decoder.decode(
            result.value,
            {
              stream: true
            }
          );
          const lines = this.incomingBuffer.split(
            /\r?\n/
          );
          this.incomingBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const cleaned = line.trim();
            if (!cleaned) {
              continue;
            }
            this.events.terminalIn(
              cleaned
            );
            this.lineHandler?.(
              cleaned
            );
          }
        }
      } catch (error) {
        if (!this.disconnecting) {
          this.events.error(error);
        }
      }
    }
    async releaseStreams() {
      const activeReader = this.reader;
      const activeWriter = this.writer;
      this.reader = null;
      this.writer = null;
      try {
        await activeReader?.cancel();
      } catch {
      }
      try {
        activeReader?.releaseLock();
      } catch {
      }
      try {
        await activeWriter?.close();
      } catch {
      }
      try {
        activeWriter?.releaseLock();
      } catch {
      }
    }
  }
  const COMMAND_TIMEOUT_MS = 15 * 60 * 1e3;
  class SerialQueue {
    constructor(connection, events2, onAcknowledgedCommand) {
      this.connection = connection;
      this.events = events2;
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
      if (!this.pending) {
        return;
      }
      const pending = this.pending;
      this.pending = null;
      clearTimeout(
        pending.timeout
      );
      pending.resolve();
    }
    rejectAcknowledgement(error) {
      if (!this.pending) {
        return;
      }
      const pending = this.pending;
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
          "Another printer command is still waiting for acknowledgement."
        );
      }
      this.events.terminalOut(
        `> ${command}`
      );
      await new Promise(
        (resolve, reject) => {
          const timeout = setTimeout(
            () => {
              if (this.pending) {
                this.pending = null;
              }
              reject(
                new Error(
                  `Printer did not acknowledge: ${command}`
                )
              );
            },
            COMMAND_TIMEOUT_MS
          );
          this.pending = {
            resolve,
            reject,
            timeout
          };
          void this.connection.write(command).catch((error) => {
            clearTimeout(timeout);
            this.pending = null;
            reject(
              error instanceof Error ? error : new Error(
                String(error)
              )
            );
          });
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
  const worker = self;
  const events = new WorkerEvents(worker);
  const positionTracker = new PositionTracker(events);
  const serialConnection = new SerialConnection(events);
  const serialQueue = new SerialQueue(
    serialConnection,
    events,
    (command) => {
      positionTracker.trackAcknowledgedCommand(
        command
      );
    }
  );
  const prints = new PrintSessionManager({
    events,
    serialQueue,
    positionTracker,
    isConnected: () => serialConnection.connected
  });
  serialConnection.setLineHandler(
    (line) => {
      const response = parsePrinterResponse(
        line,
        positionTracker.current.e
      );
      if (response.temperature) {
        events.temperature(
          response.temperature
        );
      }
      if (response.position) {
        positionTracker.set(
          response.position
        );
      }
      if (response.error) {
        serialQueue.rejectAcknowledgement(
          response.error
        );
      }
      if (response.acknowledge) {
        serialQueue.resolveAcknowledgement();
      }
    }
  );
  new TemperaturePoller({
    connection: serialConnection,
    queue: serialQueue,
    isPrintActive: () => prints.isActive
  });
  async function connectPrinter(payload) {
    try {
      await serialConnection.connect(
        payload
      );
      await serialQueue.queue("M114").catch(() => void 0);
    } catch (error) {
      events.error(error);
      serialQueue.reset();
      await serialConnection.disconnect().catch(() => void 0);
    }
  }
  async function disconnectPrinter() {
    prints.handleDisconnect();
    serialQueue.reset(
      new Error(
        "Printer disconnected."
      )
    );
    await serialConnection.disconnect().catch((error) => {
      events.error(error);
    });
  }
  function sendManualGcode(gcode) {
    void serialQueue.sendMany(gcode).catch((error) => {
      events.error(error);
    });
  }
  worker.onmessage = (event) => {
    const message = event.data;
    switch (message.type) {
      case "CONNECT": {
        void connectPrinter(
          message.payload
        );
        break;
      }
      case "DISCONNECT": {
        void disconnectPrinter();
        break;
      }
      case "SEND_GCODE": {
        sendManualGcode(
          message.payload
        );
        break;
      }
      case "START_REAL_PRINT": {
        prints.startReal(
          message.payload
        );
        break;
      }
      case "START_TEST_PRINT": {
        prints.startTest(
          message.payload
        );
        break;
      }
      case "PAUSE_PRINT": {
        prints.pause();
        break;
      }
      case "RESUME_PRINT": {
        prints.resume();
        break;
      }
      case "STOP_PRINT": {
        prints.stop();
        break;
      }
      case "RESET_PRINT": {
        prints.reset();
        break;
      }
    }
  };
})();
