import assert from "node:assert/strict";
import test from "node:test";
import { detectPrinterFromM115 } from "../src/printer/firmwareDetection";

test("M115 detects Marlin and known machine dimensions", () => {
  const detected = detectPrinterFromM115(["FIRMWARE_NAME:Marlin 2.1.2 SOURCE_CODE_URL:https://github.com/MarlinFirmware/Marlin MACHINE_TYPE:Ender-3 S1 UUID:abc", "ok"], "USB-123");
  assert.ok(detected);
  assert.equal(detected.firmware, "marlin");
  assert.equal(detected.displayName, "Creality Ender-3 S1");
  assert.deepEqual([detected.suggestedBedWidthMm, detected.suggestedBedDepthMm, detected.suggestedMaximumHeightMm], [220, 220, 270]);
  assert.equal(detected.identityKey, "usb:USB-123");
  assert.equal(detected.dimensionsSource, "model-catalog");
});

test("unknown Klipper machines use editable conservative defaults", () => {
  const detected = detectPrinterFromM115(["FIRMWARE_NAME:Klipper FIRMWARE_VERSION:v0.12.0 MACHINE_TYPE:Custom_CoreXY"], null);
  assert.ok(detected);
  assert.equal(detected.firmware, "klipper");
  assert.equal(detected.dimensionsSource, "default");
  assert.deepEqual([detected.suggestedBedWidthMm, detected.suggestedBedDepthMm, detected.suggestedMaximumHeightMm], [220, 220, 250]);
});

test("missing M115 metadata does not invent a printer identity", () => {
  assert.equal(detectPrinterFromM115(["ok", "X:0 Y:0 Z:0"], null), null);
});
