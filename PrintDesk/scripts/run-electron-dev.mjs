import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const cli = path.resolve(
  "node_modules",
  "electron-vite",
  "bin",
  "electron-vite.js",
);
const child = spawn(
  process.execPath,
  [cli, "dev"],
  {
    env: environment,
    stdio: "inherit",
  },
);

let shuttingDown = false;

function stopChildProcess() {
  if (shuttingDown || child.exitCode !== null) {
    return;
  }

  shuttingDown = true;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

process.once("SIGINT", () => {
  stopChildProcess();
  process.exit(130);
});

process.once("SIGTERM", () => {
  stopChildProcess();
  process.exit(143);
});

process.once("exit", stopChildProcess);

child.on("error", (error) => {
  console.error("Unable to start Electron development mode.", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
