interface CommandQueue {
  queue(
    command: string,
    timeoutMs?: number,
  ): Promise<void>;
}

const SAFE_STOP_COMMANDS = [
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
];
const SAFE_STOP_TIMEOUT_MS =
  10_000;

export async function safeStopPrinter(
  queue: CommandQueue,
): Promise<void> {
  const failures: Error[] = [];

  for (
    const command of
    SAFE_STOP_COMMANDS
  ) {
    try {
      await queue.queue(
        command,
        SAFE_STOP_TIMEOUT_MS,
      );
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error
          : new Error(
              String(error),
            ),
      );
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "One or more printer shutdown commands failed.",
    );
  }
}
