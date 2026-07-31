import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import path from "node:path";

const output = path.resolve(".tmp", "all.test.cjs");
await build({
  entryPoints: [path.resolve("tests", "all.test.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: output,
});

const result = spawnSync(process.execPath, ["--test", output], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
