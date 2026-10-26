#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProfiles } from "./check-profiles.mjs";
import { runtimeFiles, storyFiles } from "./runtime-files.mjs";
import { browserSteps, checkIds } from "./check-catalog.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const argumentsToCheck = process.argv.slice(2);
const scopeArgument = argumentsToCheck.find((argument) => (
  argument.startsWith("--scope=")
));
const checkScope = scopeArgument?.slice("--scope=".length) || "all";
const supportedScopes = new Set(["all", "copy", "static", "chromium", "webkit", ...Object.keys(checkProfiles)]);
const listOnly = argumentsToCheck.includes("--list");
const suiteArgument = argumentsToCheck.find((argument) => (
  argument.startsWith("--browser-suite=")
));
const browserSuite = suiteArgument?.slice("--browser-suite=".length) || "all";
const supportedSuites = new Set(["all", "core", "components"]);
const checksArgument = argumentsToCheck.find((argument) => argument.startsWith("--checks="));
const selectedChecks = checksArgument?.slice("--checks=".length).split(",");

if (
  argumentsToCheck.length !== Number(Boolean(scopeArgument)) + Number(Boolean(suiteArgument)) + Number(Boolean(checksArgument)) + Number(listOnly)
  || (selectedChecks && (suiteArgument || !["chromium", "webkit"].includes(checkScope)
    || selectedChecks.some((id) => !checkIds.includes(id))
    || new Set(selectedChecks).size !== selectedChecks.length
    || (checkScope === "webkit" && selectedChecks.includes("reels"))))
  || !supportedScopes.has(checkScope)
  || !supportedSuites.has(browserSuite)
  || (browserSuite !== "all" && !["chromium", "webkit"].includes(checkScope))
) {
  console.error(
    "Usage: node scripts/check-project.mjs "
    + "[--scope=all|copy|static|signature|checks|chromium|webkit] [--list] [--browser-suite=all|core|components | --checks=id,...]",
  );
  process.exit(2);
}

const contractScripts = [
  "scripts/check-profiles.mjs",
  "scripts/check-runner.mjs",
  "scripts/check-signature.mjs",
  "scripts/check-signature-static.mjs",
  "scripts/publication-assets.mjs",
  "scripts/audit-project.mjs",
  "scripts/browser-contracts.cjs",
  "scripts/native-webkit-capture.mjs",
  "scripts/material-contract.mjs",
  "scripts/cache-versions.mjs",
  "scripts/check-assets.mjs",
  "scripts/check-performance-budget.mjs",
  "scripts/check-performance-budget.test.mjs",
  "scripts/check-css-cascade.mjs",
  "scripts/check-publication-assets.mjs",
  "scripts/check-reel-preview.mjs",
  "scripts/check-reels.mjs",
  "scripts/check-personal-media.mjs",
  "scripts/check-inspector-links.mjs",
  "scripts/check-case-view.mjs",
  "scripts/check-scroll-lens.mjs",
  "scripts/check-case-flow.mjs",
  "scripts/check-command-placement.mjs",
  "scripts/check-local-ui.mjs",
  "scripts/check-first-visit.mjs",
  "scripts/check-accessibility.mjs",
  "scripts/accessibility-audit.mjs",
  "scripts/check-whoop-ui.mjs",
  "scripts/check-hover-layout.mjs",
  "scripts/check-map-routes.mjs",
  "scripts/check-sphere-motion.mjs",
  "scripts/release.mjs",
  "scripts/release-quality.mjs",
  "scripts/release-version.mjs",
  "scripts/check-release-quality.mjs",
  "scripts/release-scope.mjs",
  "scripts/component-scope.mjs",
  "scripts/overview-scope.mjs",
  "scripts/media-scope.mjs",
  "scripts/reel-specs.mjs",
  "scripts/reel-metadata.mjs",
  "scripts/prepare-reels.mjs",
  "scripts/check-catalog.mjs",
  "scripts/check-release-scope.mjs",
  "scripts/check-ui-contracts.mjs",
  "scripts/webkit-regression.cjs",
];

const syntaxSteps = [
  ...[...runtimeFiles,...storyFiles.filter(path=>path.endsWith('.js'))].map((path) => ({
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
  { label: "Check command runner", command: process.execPath, args: ["scripts/check-runner.mjs"] },
  ...checkProfiles.signature.static,
  {
    label: "WHOOP service authorization and publication",
    command: process.execPath,
    args: ["--test", "services/whoop/worker.test.js", "services/whoop/presence.test.js"],
  },
  {
    label: "WHOOP daily states",
    command: process.execPath,
    args: ["scripts/check-whoop-day.mjs"],
  },
  {
    label: "Release scope selection",
    command: process.execPath,
    args: ["scripts/check-release-scope.mjs"],
  },
  {
    label: "Quality publication barrier",
    command: process.execPath,
    args: ["scripts/check-release-quality.mjs"],
  },
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
    label: "Performance budget boundary cases",
    command: process.execPath,
    args: ["--test", "scripts/check-performance-budget.test.mjs"],
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
    label: "Generated reel metadata",
    requiresFfmpeg: true,
    command: process.execPath,
    args: ["scripts/prepare-reels.mjs", "--check"],
  },
  {
    label: "Reel contracts",
    requiresFfmpeg: true,
    command: process.execPath,
    args: ["scripts/check-reels.mjs"],
  },
];

const chromiumReelSteps = [
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
    label: "Russian Art Archive reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs", "garage-archives"],
  },
  {
    label: "Radiance reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs", "garage-institutions"],
  },
  {
    label: "Garage Endowment reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs", "garage-endowment"],
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
    label: "Hotline Camp reel preview",
    command: process.execPath,
    args: ["scripts/check-reel-preview.mjs", "hotline-camp"],
  },
];

const gitWhitespaceStep = {
  label: "Git whitespace",
  command: "git",
  args: ["diff", "--check"],
};

const browserContractSteps = ["chromium", "webkit"].flatMap(browserSteps);

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
    if (step.streamOutput) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (step.streamOutput) process.stderr.write(chunk);
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

    if (result.stdout && !result.streamOutput) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr && !result.streamOutput) {
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

const recordsFailure = (result) => result.error || result.status !== 0;
const failures = [];
const startedAt = performance.now();
const scopeLabel = checkScope === "all"
  ? "Project check"
  : `Project ${checkScope} check`;

// --list exposes the exact execution plan; tests exercise the same selected
// steps that run below, rather than a parallel description of the gate.
const isolated = checkProfiles[checkScope];
const hasStatic = isolated || ["all", "static", "copy"].includes(checkScope);
const plan = {
  syntax: !hasStatic ? [] : isolated ? isolated.syntax.map(path => ({
    label: `Syntax: ${path}`, command: process.execPath, args: ["--check", path],
  })) : syntaxSteps,
  static: !hasStatic ? [] : isolated ? [...isolated.static, gitWhitespaceStep]
    : checkScope === "all" ? [...staticContractSteps, ...chromiumReelSteps, gitWhitespaceStep]
      : [...staticContractSteps.filter(step => checkScope !== "copy" || !step.requiresFfmpeg), gitWhitespaceStep],
  reels: checkScope === "chromium" && (selectedChecks ? selectedChecks.includes("reels") : browserSuite !== "components") ? chromiumReelSteps : [],
  browser: isolated || ["static", "copy"].includes(checkScope) ? [] : browserContractSteps.filter(step => (
    (checkScope === "all" || step.scope === checkScope)
    && (selectedChecks ? selectedChecks.includes(step.id)
      : browserSuite === "all" || (step.id === "core" ? "core" : "components") === browserSuite)
  )),
};
if (listOnly) { console.log(JSON.stringify(plan)); process.exit(0); }
for (const [label, steps] of [["Syntax gate", plan.syntax], ["Static release gate", plan.static], ["Chromium reel preview gate", plan.reels]]) {
  if (failures.length || !steps.length) continue;
  const results = await runPhase(label, steps);
  failures.push(...results.filter(recordsFailure));
}
if (failures.length === 0 && plan.browser.length) {
  console.log(`\nBrowser release gate: ${plan.browser.length} serial tasks`);
  for (const step of plan.browser) {
    console.log(`\n→ ${step.label}`);
    const result = await runStep({ ...step, streamOutput: true });
    printResults([result]);
    if (recordsFailure(result)) failures.push(result);
  }
}

if (failures.length > 0) {
  console.error(`\n${scopeLabel} failed:`);

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
  `\n${scopeLabel} passed in `
  + `${((performance.now() - startedAt) / 1000).toFixed(1)}s.`,
);
