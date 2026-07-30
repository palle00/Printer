import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTerminalLines,
} from "../src/state/printerState";
import {
  initialPrinterState,
} from "../src/types/printer";

test(
  "terminal batches retain only the latest 300 lines",
  () => {
    const previous = {
      ...initialPrinterState,
      terminal: Array.from(
        {
          length: 250,
        },
        (_, index) =>
          `old-${index}`,
      ),
    };
    const next =
      appendTerminalLines(
        previous,
        Array.from(
          {
            length: 100,
          },
          (_, index) =>
            `new-${index}`,
        ),
      );

    assert.equal(
      next.terminal.length,
      300,
    );
    assert.equal(
      next.terminal[0],
      "old-50",
    );
    assert.equal(
      next.terminal.at(-1),
      "new-99",
    );
    assert.equal(
      previous.terminal.length,
      250,
    );
  },
);

test(
  "an empty terminal batch preserves state identity",
  () => {
    assert.equal(
      appendTerminalLines(
        initialPrinterState,
        [],
      ),
      initialPrinterState,
    );
  },
);
