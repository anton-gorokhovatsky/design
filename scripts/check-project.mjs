#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

const steps = [
  {
    label: "Main JavaScript syntax",
    command: process.execPath,
    args: ["--check", "script.js"],
  },
  {
    label: "Audit script syntax",
    command: process.execPath,
    args: ["--check", "scripts/audit-project.mjs"],
  },
  {
    label: "Project contracts",
    command: process.execPath,
    args: ["scripts/audit-project.mjs"],
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
