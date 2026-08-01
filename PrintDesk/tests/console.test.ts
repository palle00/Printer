import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyConsoleLine,
  shouldShowConsoleLine,
} from "../src/utils/terminalLines";

test("console classifies commands, application messages, and firmware severity", () => {
  assert.equal(classifyConsoleLine("> G28").kind, "command");
  assert.equal(classifyConsoleLine(">> Connected to COM3").kind, "system");
  assert.equal(classifyConsoleLine("Error: heater failed").kind, "error");
  assert.equal(classifyConsoleLine("echo:busy: processing").kind, "warning");
  assert.equal(classifyConsoleLine("ok T:205 /210 B:60 /60").kind, "routine");
  assert.equal(classifyConsoleLine("FIRMWARE_NAME:Marlin").kind, "response");
});

test("console detail levels hide only the intended message classes", () => {
  const command = classifyConsoleLine("> G1 X10");
  const routine = classifyConsoleLine("ok");
  const error = classifyConsoleLine("!! thermal runaway");

  assert.equal(shouldShowConsoleLine(command, "essential"), false);
  assert.equal(shouldShowConsoleLine(error, "essential"), true);
  assert.equal(shouldShowConsoleLine(command, "standard"), true);
  assert.equal(shouldShowConsoleLine(routine, "standard"), false);
  assert.equal(shouldShowConsoleLine(routine, "all"), true);
});
