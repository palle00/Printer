import type {
  SerialQueue,
} from "../serial/SerialQueue";

const SAFE_STOP_COMMANDS = [
  "M400",
  "G91",
  "G1 Z10 F1200",
  "G90",
  "G28 X Y",
  "M104 S0",
  "M140 S0",
  "M107",
  "M84",
];

export async function safeStopPrinter(
  queue: SerialQueue,
): Promise<void> {
  for (
    const command of
    SAFE_STOP_COMMANDS
  ) {
    try {
      await queue.queue(command);
    } catch {
      /*
       * Continue with the remaining safety
       * commands even if one command fails.
       */
    }
  }
}