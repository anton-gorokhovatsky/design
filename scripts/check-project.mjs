#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const contractScripts = [
  "scripts/audit-project.mjs",
  "scripts/browser-contracts.cjs",
  "scripts/cache-versions.mjs",
  "scripts/check-assets.mjs",
  "scripts/check-performance-budget.mjs",
  "scripts/check-css-cascade.mjs",
  "scripts/check-publication-assets.mjs",
  "scripts/check-reel-preview.mjs",
  "scripts/check-reels.mjs",
  "scripts/release.mjs",
  "scripts/check-ui-contracts.mjs",
  "scripts/webkit-regression.cjs",
];

const syntaxSteps = [
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
];

const staticContractSteps = [
  {
    label: "Cache-busting contract",
    command: process.execPath,
    args: ["scripts/cache-versions.mjs", "--check"],
  },
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
    label: "Performance budget",
    command: process.execPath,
    args: ["scripts/check-performance-budget.mjs"],
  },
  {
    label: "Publication assets",
    command: process.execPath,
    args: ["scripts/check-publication-assets.mjs"],
  },
  {
    label: "Reel contracts",
    command: process.execPath,
    args: ["scripts/check-reels.mjs"],
  },
  {
    label: "11 111 reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs"],
  },
  {
    label: "Narkomfin reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs", "narkomfin"],
  },
  {
    label: "Garage Webzine reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs", "garage-webzine"],
  },
  {
    label: "Shirokostup reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs", "shirokostup"],
  },
  {
    label: "Git whitespace",
    command: "git",
    args: ["diff", "--check"],
  },
];
const browserContractSteps = [
  {
    label: "Real-browser UI contracts",
    command: process.execPath,
    args: ["scripts/check-ui-contracts.mjs"],
  },
  {
    label: "WebKit UI contracts",
    command: process.execPath,
    args: ["scripts/webkit-regression.cjs"],
  },
];

const runStep = (step) => new Promise((resolveStep) => {
  const startedAt = performance.now();
  const child = spawn(step.command, step.args, {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.once("error", (error) => {
    resolveStep({
      ...step,
      duration: performance.now() - startedAt,
      error,
      status: null,
      stderr,
      stdout,
    });
  });
  child.once("close", (status) => {
    resolveStep({
      ...step,
      duration: performance.now() - startedAt,
      error: null,
      status,
      stderr,
      stdout,
    });
  });
});

const printResults = (results) => {
  results.forEach((result) => {
    const duration = `${(result.duration / 1000).toFixed(1)}s`;
    const marker = result.status === 0 && !result.error ? "✓" : "×";
    console.log(`\n${marker} ${result.label} (${duration})`);

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  });
};

const runPhase = async (label, steps) => {
  console.log(`\n${label}: ${steps.length} parallel task${steps.length === 1 ? "" : "s"}`);
  const results = await Promise.all(steps.map(runStep));
  printResults(results);
  return results;
};

const failures = [];
const startedAt = performance.now();
const syntaxResults = await runPhase("Syntax gate", syntaxSteps);
failures.push(...syntaxResults.filter((result) => (
  result.error || result.status !== 0
)));

if (failures.length === 0) {
  const staticContractResults = await runPhase("Static release gate", staticContractSteps);
  failures.push(...staticContractResults.filter((result) => (
    result.error || result.status !== 0
  )));
}

if (failures.length === 0) {
  console.log("\nBrowser release gate: 2 serial tasks");
  for (const step of browserContractSteps) {
    const result = await runStep(step);
    printResults([result]);
    if (result.error || result.status !== 0) {
      failures.push(result);
      break;
    }
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

console.log(
  `\nProject check passed in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`,
);
