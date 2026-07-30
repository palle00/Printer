import assert from "node:assert/strict";
import test from "node:test";

import {
  safeStopPrinter,
} from "../src/workers/print/safeStop";

test(
  "safe stop forces millimetres and continues after command failures",
  async () => {
    const commands: string[] = [];
    const timeouts: number[] = [];

    await assert.rejects(
      safeStopPrinter({
        async queue(
          command,
          timeoutMs,
        ) {
          commands.push(command);
          timeouts.push(
            timeoutMs ?? 0,
          );

          if (command === "G28 X Y") {
            throw new Error(
              "Home failed",
            );
          }
        },
      }),
      AggregateError,
    );

    assert.deepEqual(
      commands,
      [
        "M400",
        "G21",
        "G91",
        "G1 Z10 F1200",
        "G90",
        "G28 X Y",
        "M104 S0",
        "M140 S0",
        "M107",
        "M84",
      ],
    );
    assert.ok(
      timeouts.every(
        (timeout) =>
          timeout === 10_000,
      ),
    );
  },
);
