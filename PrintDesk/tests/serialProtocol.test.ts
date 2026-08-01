import assert from "node:assert/strict";
import test from "node:test";

import { PrinterEvents } from "../src/workers/core/PrinterEvents";
import { SimulatedSerialTransport } from "../src/workers/serial/SimulatedSerialTransport";
import { SerialQueue } from "../src/workers/serial/SerialQueue";
import { calculateMarlinChecksum, frameMarlinCommand, parseMarlinResendRequest } from "../src/workers/serial/marlinProtocol";
import { parsePrinterResponse } from "../src/workers/serial/responseParser";

test("Marlin protocol frames commands and parses resend variants", () => {
  assert.equal(calculateMarlinChecksum("N1 G28"), 18);
  assert.equal(frameMarlinCommand(1, "G28"), "N1 G28*18");
  assert.equal(parseMarlinResendRequest("Resend: 42"), 42);
  assert.equal(parseMarlinResendRequest("rs N17 Expected checksum"), 17);
  assert.equal(parseMarlinResendRequest("ok"), null);
});

test("simulated Marlin firmware replays an outstanding numbered command", async () => {
  let numberedWrites = 0;
  const transport = new SimulatedSerialTransport((command) => {
    if (!command.startsWith("N")) return ["ok"];
    numberedWrites += 1;
    return numberedWrites === 1 ? ["Resend:1"] : ["ok"];
  });
  const events = new PrinterEvents({ postMessage: () => undefined });
  const queue = new SerialQueue(transport, events, () => undefined);
  transport.setLineHandler((line) => {
    const response = parsePrinterResponse(line, 0);
    if (response.resendLine !== null) void queue.resend(response.resendLine);
    if (response.acknowledge) queue.resolveAcknowledgement();
  });
  await transport.connect({ path: "SIM", baudRate: 115200 });
  await queue.enableMarlinChecksums();
  await queue.queue("G1 X10");

  assert.equal(transport.writes[0], "M110 N0");
  assert.equal(transport.writes[1], frameMarlinCommand(1, "G1 X10"));
  assert.equal(transport.writes[2], transport.writes[1]);
});

test("immediate serial commands bypass acknowledgement waiting", async () => {
  const transport = new SimulatedSerialTransport(() => []);
  const queue = new SerialQueue(
    transport,
    new PrinterEvents({ postMessage: () => undefined }),
    () => undefined,
  );
  await transport.connect({ path: "SIM", baudRate: 115200 });
  await queue.sendImmediate("M112");
  assert.deepEqual(transport.writes, ["M112"]);
});
