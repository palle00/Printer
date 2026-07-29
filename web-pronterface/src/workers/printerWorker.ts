/// <reference lib="webworker" />

export {};

const worker = self as unknown as DedicatedWorkerGlobalScope;

type PrinterStatus =
  | "disconnected"
  | "idle"
  | "printing"
  | "pausing"
  | "paused"
  | "stopping";

type CommandSource =
  | "print"
  | "manual"
  | "control"
  | "temperature";

interface QueueCommand {
  gcode: string;
  source: CommandSource;
  layer?: number;
}

interface ConnectMessage {
  type: "CONNECT";
  payload: {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  };
}

interface DisconnectMessage {
  type: "DISCONNECT";
}

interface SendGcodeMessage {
  type: "SEND_GCODE";
  payload: string;
}

interface PrintFileMessage {
  type: "PRINT_FILE";
  payload: {
    fileName: string;
    lines: string[];
  };
}

interface PausePrintMessage {
  type: "PAUSE_PRINT";
}

interface ResumePrintMessage {
  type: "RESUME_PRINT";
}

interface StopPrintMessage {
  type: "STOP_PRINT";
}

type IncomingMessage =
  | ConnectMessage
  | DisconnectMessage
  | SendGcodeMessage
  | PrintFileMessage
  | PausePrintMessage
  | ResumePrintMessage
  | StopPrintMessage;

let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

let status: PrinterStatus = "disconnected";
let connected = false;
let intentionalDisconnect = false;

let readBuffer = "";
let waitingForOk = false;
let currentCommand: QueueCommand | null = null;

let printQueue: QueueCommand[] = [];
let controlQueue: QueueCommand[] = [];
let manualQueue: QueueCommand[] = [];

let temperaturePollPending = false;
let temperaturePollTimer: number | null = null;

let fileName = "";
let totalPrintLines = 0;
let completedPrintLines = 0;
let currentLayer = 0;
let totalLayers = 0;

let printStartedAt = 0;
let pausedStartedAt = 0;
let totalPausedMilliseconds = 0;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

let absolutePositioning = true;
let absoluteExtrusion = true;

let trackedPosition = {
  x: 0,
  y: 0,
  z: 0,
  e: 0,
};


function post(type: string, payload: Record<string, unknown> = {}): void {
  worker.postMessage({
    type,
    ...payload,
  });
}

function postTerminalIn(text: string): void {
  post("TERMINAL_IN", { text });
}

function postTerminalOut(text: string): void {
  post("TERMINAL_OUT", { text });
}

function postError(message: string): void {
  post("ERROR", { message });
  postTerminalIn(`>> Error: ${message}`);
}

function setStatus(nextStatus: PrinterStatus): void {
  status = nextStatus;

  post("STATUS", {
    status,
  });
}

function clearTemperaturePolling(): void {
  if (temperaturePollTimer !== null) {
    clearInterval(temperaturePollTimer);
    temperaturePollTimer = null;
  }

  temperaturePollPending = false;
}

function startTemperaturePolling(): void {
  clearTemperaturePolling();

  temperaturePollPending = true;
  void processNextCommand();

  temperaturePollTimer = worker.setInterval(() => {
    if (!connected || status === "stopping") {
      return;
    }

    temperaturePollPending = true;
    void processNextCommand();
  }, 2000);
}

function cleanGcodeLine(rawLine: string): string {
  const withoutComment = rawLine.split(";")[0].trim();

  if (!withoutComment) {
    return "";
  }

  if (withoutComment === "%") {
    return "";
  }

  return withoutComment;
}

function detectLayerMarkerMode(
  lines: string[],
): "layer-number" | "layer-change" | "z-marker" | "none" {
  if (lines.some((line) => /^\s*;\s*LAYER:\s*-?\d+/i.test(line))) {
    return "layer-number";
  }

  if (lines.some((line) => /^\s*;\s*LAYER_CHANGE/i.test(line))) {
    return "layer-change";
  }

  if (lines.some((line) => /^\s*;\s*Z:\s*-?\d+(?:\.\d+)?/i.test(line))) {
    return "z-marker";
  }

  return "none";
}

function buildPrintQueue(lines: string[]): {
  queue: QueueCommand[];
  layers: number;
} {
  const queue: QueueCommand[] = [];
  const markerMode = detectLayerMarkerMode(lines);

  let layer = markerMode === "none" ? 1 : 0;
  let detectedLayers = layer;

  for (const rawLine of lines) {
    if (markerMode === "layer-number") {
      const match = rawLine.match(/^\s*;\s*LAYER:\s*(-?\d+)/i);

      if (match) {
        layer = Math.max(1, Number(match[1]) + 1);
        detectedLayers = Math.max(detectedLayers, layer);
        continue;
      }
    }

    if (
      markerMode === "layer-change" &&
      /^\s*;\s*LAYER_CHANGE/i.test(rawLine)
    ) {
      layer += 1;
      detectedLayers = Math.max(detectedLayers, layer);
      continue;
    }

    if (
      markerMode === "z-marker" &&
      /^\s*;\s*Z:\s*-?\d+(?:\.\d+)?/i.test(rawLine)
    ) {
      layer += 1;
      detectedLayers = Math.max(detectedLayers, layer);
      continue;
    }

    const gcode = cleanGcodeLine(rawLine);

    if (!gcode) {
      continue;
    }

    queue.push({
      gcode,
      source: "print",
      layer: Math.max(1, layer),
    });
  }

  return {
    queue,
    layers: Math.max(1, detectedLayers),
  };
}

function getElapsedMilliseconds(): number {
  if (printStartedAt === 0) {
    return 0;
  }

  const now = Date.now();
  const activePauseTime =
    pausedStartedAt > 0 ? now - pausedStartedAt : 0;

  return Math.max(
    0,
    now -
      printStartedAt -
      totalPausedMilliseconds -
      activePauseTime,
  );
}

function postProgress(): void {
  const elapsedMilliseconds = getElapsedMilliseconds();
  const elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);

  const percent =
    totalPrintLines > 0
      ? (completedPrintLines / totalPrintLines) * 100
      : 0;

  const linesPerSecond =
    elapsedMilliseconds > 0
      ? completedPrintLines / (elapsedMilliseconds / 1000)
      : 0;

  const remainingLines = Math.max(
    0,
    totalPrintLines - completedPrintLines,
  );

  const etaSeconds =
    linesPerSecond > 0
      ? Math.ceil(remainingLines / linesPerSecond)
      : 0;

  post("PROGRESS", {
    fileName,
    currentLine: completedPrintLines,
    totalLines: totalPrintLines,
    percent: Math.min(100, percent),
    elapsedSeconds,
    etaSeconds,
    currentLayer,
    totalLayers,
  });
}

function parseTemperature(line: string): void {
  const hotendMatch = line.match(
    /(?:^|\s)T:\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/i,
  );

  const bedMatch = line.match(
    /(?:^|\s)B:\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/i,
  );

  if (!hotendMatch && !bedMatch) {
    return;
  }

  post("TEMPERATURE", {
    hotend: hotendMatch ? Number(hotendMatch[1]) : null,
    targetHotend: hotendMatch ? Number(hotendMatch[2]) : null,
    bed: bedMatch ? Number(bedMatch[1]) : null,
    targetBed: bedMatch ? Number(bedMatch[2]) : null,
    timestamp: Date.now(),
  });
}

function isAcknowledgement(line: string): boolean {
  return /(?:^|\s)ok(?:\s|$)/i.test(line);
}

function isResendRequest(line: string): boolean {
  return /(?:resend|rs)\s*:?\s*\d+/i.test(line);
}

function isFatalPrinterError(line: string): boolean {
  return (
    /^\s*error:/i.test(line) ||
    /^\s*!!/i.test(line) ||
    /printer halted/i.test(line)
  );
}

async function resendCurrentCommand(): Promise<void> {
  if (!writer || !currentCommand) {
    return;
  }

  try {
    await writer.write(
      encoder.encode(`${currentCommand.gcode}\n`),
    );

    postTerminalOut(`<< ${currentCommand.gcode} [resend]`);
  } catch (error) {
    await handleConnectionFailure(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function completeCurrentCommand(): void {
  if (!currentCommand) {
    waitingForOk = false;
    return;
  }

  updateTrackedPosition(currentCommand.gcode);

  if (currentCommand.source === "print") {
    completedPrintLines += 1;
    currentLayer =
      currentCommand.layer ?? currentLayer;

    postProgress();
  }

  currentCommand = null;
  waitingForOk = false;
}

function handleCompletedQueues(): boolean {
  if (
    status === "pausing" &&
    controlQueue.length === 0 &&
    !waitingForOk
  ) {
    pausedStartedAt = Date.now();
    setStatus("paused");
    post("PRINT_PAUSED");
    return true;
  }

  if (
    status === "stopping" &&
    controlQueue.length === 0 &&
    !waitingForOk
  ) {
    printQueue = [];
    manualQueue = [];

    setStatus("idle");

    post("PRINT_STOPPED", {
      fileName,
    });

    return true;
  }

  if (
    status === "printing" &&
    printQueue.length === 0 &&
    !waitingForOk
  ) {
    completedPrintLines = totalPrintLines;
    currentLayer = totalLayers;
    postProgress();

    setStatus("idle");

    post("PRINT_FINISHED", {
      fileName,
      elapsedSeconds: Math.floor(
        getElapsedMilliseconds() / 1000,
      ),
    });

    return true;
  }

  return false;
}

function getNextCommand(): QueueCommand | null {
  if (controlQueue.length > 0) {
    return controlQueue.shift() ?? null;
  }

  if (status === "stopping" || status === "pausing") {
    return null;
  }

  if (manualQueue.length > 0) {
    return manualQueue.shift() ?? null;
  }

  if (temperaturePollPending) {
    temperaturePollPending = false;

    return {
      gcode: "M105",
      source: "temperature",
    };
  }

  if (status === "printing" && printQueue.length > 0) {
    return printQueue.shift() ?? null;
  }

  return null;
}

async function processNextCommand(): Promise<void> {
  if (!connected || !writer || waitingForOk) {
    return;
  }

  if (handleCompletedQueues()) {
    return;
  }

  const nextCommand = getNextCommand();

  if (!nextCommand) {
    return;
  }

  currentCommand = nextCommand;
  waitingForOk = true;

  try {
    await writer.write(
      encoder.encode(`${nextCommand.gcode}\n`),
    );

    postTerminalOut(`<< ${nextCommand.gcode}`);
  } catch (error) {
    waitingForOk = false;
    currentCommand = null;

    await handleConnectionFailure(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function handlePrinterLine(line: string): void {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  postTerminalIn(trimmed);
  parseTemperature(trimmed);
  parseReportedPosition(trimmed);

  if (isResendRequest(trimmed)) {
    void resendCurrentCommand();
    return;
  }

  if (isFatalPrinterError(trimmed)) {
    postError(trimmed);
  }

  if (isAcknowledgement(trimmed)) {
    completeCurrentCommand();
    void processNextCommand();
  }
}

async function readLoop(): Promise<void> {
  if (!reader) {
    return;
  }

  try {
    while (connected && reader) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      readBuffer += decoder.decode(value, {
        stream: true,
      });

      const receivedLines = readBuffer.split(/\r?\n/);
      readBuffer = receivedLines.pop() ?? "";

      for (const line of receivedLines) {
        handlePrinterLine(line);
      }
    }

    if (readBuffer.trim()) {
      handlePrinterLine(readBuffer);
      readBuffer = "";
    }

    if (!intentionalDisconnect && connected) {
      await handleConnectionFailure(
        "The printer serial connection was closed.",
      );
    }
  } catch (error) {
    if (!intentionalDisconnect) {
      await handleConnectionFailure(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function connect(
  readable: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>,
): Promise<void> {
  if (connected) {
    await disconnect();
  }

  try {
    reader = readable.getReader();
    writer = writable.getWriter();

    connected = true;
    intentionalDisconnect = false;
    readBuffer = "";
    waitingForOk = false;
    currentCommand = null;

    setStatus("idle");
    post("CONNECTED");

    startTemperaturePolling();
    void readLoop();
  } catch (error) {
    postError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function releaseSerialLocks(): Promise<void> {
  const activeReader = reader;
  const activeWriter = writer;

  reader = null;
  writer = null;

  if (activeReader) {
    try {
      await activeReader.cancel();
    } catch {
      // Ignore cancellation errors.
    }

    try {
      activeReader.releaseLock();
    } catch {
      // Ignore release errors.
    }
  }

  if (activeWriter) {
    try {
      await activeWriter.close();
    } catch {
      // Ignore close errors.
    }

    try {
      activeWriter.releaseLock();
    } catch {
      // Ignore release errors.
    }
  }
}

function clearAllQueues(): void {
  printQueue = [];
  controlQueue = [];
  manualQueue = [];

  currentCommand = null;
  waitingForOk = false;
}

async function disconnect(): Promise<void> {
  intentionalDisconnect = true;
  connected = false;

  clearTemperaturePolling();
  clearAllQueues();

  await releaseSerialLocks();

  setStatus("disconnected");
  post("DISCONNECTED");

  intentionalDisconnect = false;
}

async function handleConnectionFailure(
  message: string,
): Promise<void> {
  connected = false;
  clearTemperaturePolling();
  clearAllQueues();

  await releaseSerialLocks();

  setStatus("disconnected");
  postError(message);
  post("DISCONNECTED");
}

function startPrint(
  nextFileName: string,
  lines: string[],
): void {
  if (!connected) {
    postError("Printer is not connected.");
    return;
  }

  if (
    status === "printing" ||
    status === "pausing" ||
    status === "paused" ||
    status === "stopping"
  ) {
    postError("A print job is already active.");
    return;
  }

  const parsed = buildPrintQueue(lines);

  if (parsed.queue.length === 0) {
    postError("The selected file contains no printable G-code.");
    return;
  }

  fileName = nextFileName;
  printQueue = parsed.queue;
  controlQueue = [];
  manualQueue = [];

  totalPrintLines = printQueue.length;
  completedPrintLines = 0;
  currentLayer = 0;
  totalLayers = parsed.layers;

  printStartedAt = Date.now();
  pausedStartedAt = 0;
  totalPausedMilliseconds = 0;

  setStatus("printing");

  post("PRINT_STARTED", {
    fileName,
    totalLines: totalPrintLines,
    totalLayers,
  });

  postProgress();
  void processNextCommand();
}

function pausePrint(): void {
  if (status !== "printing") {
    return;
  }

  setStatus("pausing");

  controlQueue = [
    {
      gcode: "M400",
      source: "control",
    },
  ];

  void processNextCommand();
}

function resumePrint(): void {
  if (status !== "paused") {
    return;
  }

  if (pausedStartedAt > 0) {
    totalPausedMilliseconds += Date.now() - pausedStartedAt;
    pausedStartedAt = 0;
  }

  setStatus("printing");
  post("PRINT_RESUMED");

  void processNextCommand();
}

function stopPrint(): void {
  if (
    status !== "printing" &&
    status !== "pausing" &&
    status !== "paused"
  ) {
    return;
  }

  printQueue = [];
  manualQueue = [];
  temperaturePollPending = false;

  setStatus("stopping");
  post("PRINT_STOPPING");

  controlQueue = [
    {
      gcode: "M400",
      source: "control",
    },
    {
      gcode: "G91",
      source: "control",
    },
    {
      gcode: "G1 Z10 F1200",
      source: "control",
    },
    {
      gcode: "G90",
      source: "control",
    },
    {
      gcode: "G28 X Y",
      source: "control",
    },
    {
      gcode: "M104 S0",
      source: "control",
    },
    {
      gcode: "M140 S0",
      source: "control",
    },
    {
      gcode: "M107",
      source: "control",
    },
    {
      gcode: "M84",
      source: "control",
    },
  ];

  void processNextCommand();
}

function sendManualGcode(gcode: string): void {
  const cleanedLines = gcode
    .split(/\r?\n/)
    .map(cleanGcodeLine)
    .filter(Boolean);

  if (!connected) {
    postError("Printer is not connected.");
    return;
  }

  for (const line of cleanedLines) {
    manualQueue.push({
      gcode: line,
      source: "manual",
    });
  }

  void processNextCommand();
}

worker.onmessage = (
  event: MessageEvent<IncomingMessage>,
): void => {
  const message = event.data;

  switch (message.type) {
    case "CONNECT": {
      void connect(
        message.payload.readable,
        message.payload.writable,
      );
      break;
    }

    case "DISCONNECT": {
      void disconnect();
      break;
    }

    case "SEND_GCODE": {
      sendManualGcode(message.payload);
      break;
    }

    case "PRINT_FILE": {
      startPrint(
        message.payload.fileName,
        message.payload.lines,
      );
      break;
    }

    case "PAUSE_PRINT": {
      pausePrint();
      break;
    }

    case "RESUME_PRINT": {
      resumePrint();
      break;
    }

    case "STOP_PRINT": {
      stopPrint();
      break;
    }
  }
};

function readGcodeParameter(
  gcode: string,
  parameter: "X" | "Y" | "Z" | "E",
): number | null {
  const match = gcode.match(
    new RegExp(
      `(?:^|\\s)${parameter}\\s*(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`,
      "i",
    ),
  );

  return match ? Number(match[1]) : null;
}

function postTrackedPosition(): void {
  post("POSITION", {
    x: trackedPosition.x,
    y: trackedPosition.y,
    z: trackedPosition.z,
    e: trackedPosition.e,
  });
}

function updateTrackedPosition(gcode: string): void {
  const command =
    gcode.trim().match(/^([GMT]\d+(?:\.\d+)?)/i)?.[1]
      ?.toUpperCase();

  if (!command) {
    return;
  }

  if (command === "G90") {
    absolutePositioning = true;
    return;
  }

  if (command === "G91") {
    absolutePositioning = false;
    return;
  }

  if (command === "M82") {
    absoluteExtrusion = true;
    return;
  }

  if (command === "M83") {
    absoluteExtrusion = false;
    return;
  }

  if (command === "G92") {
    const x = readGcodeParameter(gcode, "X");
    const y = readGcodeParameter(gcode, "Y");
    const z = readGcodeParameter(gcode, "Z");
    const e = readGcodeParameter(gcode, "E");

    if (x !== null) trackedPosition.x = x;
    if (y !== null) trackedPosition.y = y;
    if (z !== null) trackedPosition.z = z;
    if (e !== null) trackedPosition.e = e;

    postTrackedPosition();
    return;
  }

  if (command === "G28") {
    const hasX = /(?:^|\s)X(?:\s|$)/i.test(gcode);
    const hasY = /(?:^|\s)Y(?:\s|$)/i.test(gcode);
    const hasZ = /(?:^|\s)Z(?:\s|$)/i.test(gcode);

    const hasSpecificAxis = hasX || hasY || hasZ;

    if (!hasSpecificAxis || hasX) trackedPosition.x = 0;
    if (!hasSpecificAxis || hasY) trackedPosition.y = 0;
    if (!hasSpecificAxis || hasZ) trackedPosition.z = 0;

    postTrackedPosition();
    return;
  }

  const isMovement =
    command === "G0" ||
    command === "G00" ||
    command === "G1" ||
    command === "G01" ||
    command === "G2" ||
    command === "G02" ||
    command === "G3" ||
    command === "G03";

  if (!isMovement) {
    return;
  }

  const x = readGcodeParameter(gcode, "X");
  const y = readGcodeParameter(gcode, "Y");
  const z = readGcodeParameter(gcode, "Z");
  const e = readGcodeParameter(gcode, "E");

  if (x !== null) {
    trackedPosition.x = absolutePositioning
      ? x
      : trackedPosition.x + x;
  }

  if (y !== null) {
    trackedPosition.y = absolutePositioning
      ? y
      : trackedPosition.y + y;
  }

  if (z !== null) {
    trackedPosition.z = absolutePositioning
      ? z
      : trackedPosition.z + z;
  }

  if (e !== null) {
    trackedPosition.e = absoluteExtrusion
      ? e
      : trackedPosition.e + e;
  }

  postTrackedPosition();
}

function parseReportedPosition(line: string): void {
  const match = line.match(
    /X:\s*(-?\d+(?:\.\d+)?)\s+Y:\s*(-?\d+(?:\.\d+)?)\s+Z:\s*(-?\d+(?:\.\d+)?)\s+E:\s*(-?\d+(?:\.\d+)?)/i,
  );

  if (!match) {
    return;
  }

  trackedPosition = {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
    e: Number(match[4]),
  };

  postTrackedPosition();
}

