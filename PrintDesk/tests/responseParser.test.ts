import assert from "node:assert/strict";
import test from "node:test";

import { parsePrinterResponse } from "../src/workers/serial/responseParser";

test("printer response parser extracts acknowledgement and heater telemetry", () => {
  const response = parsePrinterResponse("ok T:204.7 /210 B:59.8 /60", 3);
  assert.equal(response.acknowledge, true);
  assert.deepEqual(
    {
      hotend: response.temperature?.hotend,
      targetHotend: response.temperature?.targetHotend,
      bed: response.temperature?.bed,
      targetBed: response.temperature?.targetBed,
    },
    { hotend: 204.7, targetHotend: 210, bed: 59.8, targetBed: 60 },
  );
});

test("printer response parser preserves extrusion when M114 omits E", () => {
  const response = parsePrinterResponse("X:12.5 Y:-3 Z:0.24", 18.75);
  assert.deepEqual(response.position, { x: 12.5, y: -3, z: 0.24, e: 18.75 });
});

test("printer response parser recognizes firmware errors without false acknowledgements", () => {
  const response = parsePrinterResponse("Error:Printer halted", 0);
  assert.equal(response.acknowledge, false);
  assert.equal(response.error?.message, "Error:Printer halted");
});

test("printer response parser classifies actionable firmware faults", () => {
  assert.equal(parsePrinterResponse("Error: Thermal Runaway, system stopped!", 0).fault?.code, "thermal-runaway");
  assert.equal(parsePrinterResponse("echo: filament runout", 0).fault?.code, "filament-runout");
  assert.equal(parsePrinterResponse("Homing failed", 0).fault?.code, "homing-failed");
});
