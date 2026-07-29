#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const contractScripts = [
  "scripts/audit-project.mjs",
  "scripts/check-assets.mjs",
  "scripts/check-css-cascade.mjs",
  "scripts/check-reels.mjs",
  "scripts/check-ui-contracts.mjs",
];

const steps = [
  ...runtimeFiles.map((path) => ({
    label: `Runtime syntax: ${path}`,
    command: process.execPath,
    args: ["--check", path],
  })),
  {
    label: "Runtime manifest syntax",
    command: process.execPath,
    args: ["--check", "scripts/runtime-files.mjs"],
  },
  ...contractScripts.map((path) => ({
    label: `Contract syntax: ${path}`,
    command: process.execPath,
    args: ["--check", path],
  })),
  {
    label: "Project contracts",
    command: process.execPath,
    args: ["scripts/audit-project.mjs"],
  },
  {
    label: "CSS cascade contracts",
    command: process.execPath,
    args: ["scripts/check-css-cascade.mjs"],
  },
  {
    label: "Asset graph contracts",
    command: process.execPath,
    args: ["scripts/check-assets.mjs"],
  },
  {
    label: "Real-browser UI contracts",
    command: process.execPath,
    args: ["scripts/check-ui-contracts.mjs"],
  },
  {
    label: "Reel contracts",
    command: process.execPath,
    args: ["scripts/check-reels.mjs"],
  },
  {
    label: "Git whitespace",
    command: "git",
    args: ["diff", "--check"],
  },
];

const failures = [];

for (const step of steps) {
  console.log(`\n→ ${step.label}`);

  const result = spawnSync(step.command, step.args, {
    cwd: projectRoot,
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error || result.status !== 0) {
    failures.push({
      label: step.label,
      status: result.status,
      error: result.error?.message,
    });
  }
}

if (failures.length > 0) {
  console.error("\nProject check failed:");

  for (const failure of failures) {
    console.error(
      `- ${failure.label}`
      + (failure.status === null ? "" : ` (exit ${failure.status})`)
      + (failure.error ? `: ${failure.error}` : ""),
    );
  }

  process.exit(1);
}

console.log("\nProject check passed.");
