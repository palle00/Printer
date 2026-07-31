import assert from "node:assert/strict";
import test from "node:test";

import type {
  PrinterEvent,
} from "../src/types/printer";
import {
  PrinterEvents,
} from "../src/workers/core/PrinterEvents";
import {
  PositionTracker,
} from "../src/workers/gcode/PositionTracker";

function createTracker(): {
  tracker: PositionTracker;
  events: PrinterEvent[];
} {
  const events: PrinterEvent[] = [];
  const tracker =
    new PositionTracker(
      new PrinterEvents({
        postMessage(event) {
          events.push(event);
        },
      }),
    );

  return {
    tracker,
    events,
  };
}

test(
  "position tracker converts inch-mode coordinates to millimetres",
  () => {
    const { tracker } =
      createTracker();

    tracker.trackAcknowledgedCommand(
      "G20",
    );
    tracker.trackAcknowledgedCommand(
      "G1 X1 Y2 E0.5",
    );

    assert.deepEqual(
      tracker.current,
      {
        x: 25.4,
        y: 50.8,
        z: 0,
        e: 12.7,
      },
    );
  },
);

test(
  "position tracker scales relative moves and resets to millimetres",
  () => {
    const { tracker } =
      createTracker();

    tracker.trackAcknowledgedCommand(
      "G20",
    );
    tracker.trackAcknowledgedCommand(
      "G91",
    );
    tracker.trackAcknowledgedCommand(
      "G1 X1",
    );
    tracker.trackAcknowledgedCommand(
      "G1 X0.5",
    );

    assert.ok(
      Math.abs(
        tracker.current.x -
          38.1,
      ) < 0.000_001,
    );

    tracker.reset();
    tracker.trackAcknowledgedCommand(
      "G1 X2",
    );

    assert.equal(
      tracker.current.x,
      2,
    );
  },
);
