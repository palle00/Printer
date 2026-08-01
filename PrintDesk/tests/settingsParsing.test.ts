import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAppSettingsSnapshot,
  parseOperationsSettings,
} from "../electron/main/settings/settingsParsing";
import { DEFAULT_OPERATIONS_SETTINGS } from "../src/types/operations";

test("settings parsing replaces invalid profiles and references with safe defaults", () => {
  const parsed = parseOperationsSettings({
    profiles: [{ id: "broken", name: "Broken", firmware: "marlin", bedWidthMm: -1 }],
    activeProfileId: "missing",
    spools: [{ id: "bad", remainingGrams: "a lot" }],
    activeSpoolId: "bad",
    network: { enabled: true, port: 12, readOnly: false },
  });

  assert.deepEqual(parsed.profiles, DEFAULT_OPERATIONS_SETTINGS.profiles);
  assert.equal(parsed.activeProfileId, DEFAULT_OPERATIONS_SETTINGS.activeProfileId);
  assert.deepEqual(parsed.spools, []);
  assert.equal(parsed.activeSpoolId, null);
  assert.equal(parsed.network.port, DEFAULT_OPERATIONS_SETTINGS.network.port);
});

test("settings parsing filters malformed persisted collection entries", () => {
  const parsed = parseOperationsSettings({
    history: [null, { id: "history", fileName: "part.gcode", mode: "real", outcome: "completed", startedAt: 1, finishedAt: 2, elapsedSeconds: 1, profileId: null }],
    macros: [{ id: "invalid" }, { id: "home", name: "Home", commands: "G28", requiresConfirmation: false }],
    queue: [{ id: "bad", path: 42 }, { id: "queued", path: "C:\\part.gcode", name: "part.gcode", addedAt: 1 }],
    dismissedPrinterIdentities: ["known", 42],
  });

  assert.equal(parsed.history.length, 1);
  assert.deepEqual(parsed.macros.map((macro) => macro.id), ["home"]);
  assert.deepEqual(parsed.queue.map((entry) => entry.id), ["queued"]);
  assert.deepEqual(parsed.dismissedPrinterIdentities, ["known"]);
});

test("application settings parsing applies defaults to partial legacy data", () => {
  const parsed = parseAppSettingsSnapshot({
    recentFiles: [],
    notifications: { enabled: false, printCompleted: false },
  });

  assert.ok(parsed);
  assert.equal(parsed.notifications.enabled, false);
  assert.equal(parsed.notifications.printCompleted, false);
  assert.equal(parsed.notifications.printerErrors, true);
  assert.deepEqual(parsed.operations.profiles, DEFAULT_OPERATIONS_SETTINGS.profiles);
});
