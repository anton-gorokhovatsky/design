#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const argumentsToCheck = process.argv.slice(2);
const scopeArgument = argumentsToCheck.find((argument) => (
  argument.startsWith("--scope=")
));
const checkScope = scopeArgument?.slice("--scope=".length) || "all";
const supportedScopes = new Set(["all", "static", "chromium", "webkit"]);
const suiteArgument = argumentsToCheck.find((argument) => (
  argument.startsWith("--browser-suite=")
));
const browserSuite = suiteArgument?.slice("--browser-suite=".length) || "all";
const supportedSuites = new Set(["all", "core", "components"]);

if (
  argumentsToCheck.length !== Number(Boolean(scopeArgument)) + Number(Boolean(suiteArgument))
  || !supportedScopes.has(checkScope)
  || !supportedSuites.has(browserSuite)
  || (browserSuite !== "all" && !["chromium", "webkit"].includes(checkScope))
) {
  console.error(
    "Usage: node scripts/check-project.mjs "
    + "[--scope=all|static|chromium|webkit] [--browser-suite=all|core|components]",
  );
  process.exit(2);
}

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
  "scripts/check-personal-media.mjs",
  "scripts/check-inspector-links.mjs",
  "scripts/check-command-placement.mjs",
  "scripts/check-sphere-motion.mjs",
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

const browserContractSteps = [
  {
    scope: "chromium",
    suite: "core",
    label: "Real-browser UI contracts",
    command: process.execPath,
    args: ["scripts/check-ui-contracts.mjs"],
  },
  {
    scope: "webkit",
    suite: "core",
    label: "WebKit UI contracts",
    command: process.execPath,
    args: ["scripts/webkit-regression.cjs"],
  },
  {
    scope: "chromium",
    label: "Personal video lifecycle: Chromium",
    command: process.execPath,
    args: ["scripts/check-personal-media.mjs", "chromium"],
  },
  {
    scope: "webkit",
    label: "Personal video lifecycle: WebKit",
    command: process.execPath,
    args: ["scripts/check-personal-media.mjs", "webkit"],
  },
  {
    scope: "chromium",
    label: "Inspector destination links: Chromium",
    command: process.execPath,
    args: ["scripts/check-inspector-links.mjs", "chromium"],
  },
  {
    scope: "webkit",
    label: "Inspector destination links: WebKit",
    command: process.execPath,
    args: ["scripts/check-inspector-links.mjs", "webkit"],
  },
];

browserContractSteps.push(...["chromium", "webkit"].map((scope) => ({
  scope,
  label: "Command popup placement: " + scope,
  command: process.execPath,
  args: ["scripts/check-command-placement.mjs", scope],
})));

browserContractSteps.push(...["chromium", "webkit"].map((scope) => ({
  scope,
  label: "Sphere axial motion: " + scope,
  command: process.execPath,
  args: ["scripts/check-sphere-motion.mjs", scope],
})));

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

const recordsFailure = (result) => result.error || result.status !== 0;
const failures = [];
const startedAt = performance.now();
const scopeLabel = checkScope === "all"
  ? "Project check"
  : `Project ${checkScope} check`;

if (checkScope === "all" || checkScope === "static") {
  const syntaxResults = await runPhase("Syntax gate", syntaxSteps);
  failures.push(...syntaxResults.filter(recordsFailure));

  if (failures.length === 0) {
    const scopedStaticSteps = checkScope === "all"
      ? [...staticContractSteps, ...chromiumReelSteps, gitWhitespaceStep]
      : [...staticContractSteps, gitWhitespaceStep];
    const staticContractResults = await runPhase(
      "Static release gate",
      scopedStaticSteps,
    );
    failures.push(...staticContractResults.filter(recordsFailure));
  }
}

if (failures.length === 0 && checkScope === "chromium" && browserSuite !== "components") {
  const reelResults = await runPhase(
    "Chromium reel preview gate",
    chromiumReelSteps,
  );
  failures.push(...reelResults.filter(recordsFailure));
}

if (failures.length === 0 && checkScope !== "static") {
  const scopedBrowserSteps = browserContractSteps.filter((step) => (
    (checkScope === "all" || step.scope === checkScope)
    && (browserSuite === "all" || (step.suite || "components") === browserSuite)
  ));
  console.log(
    `\nBrowser release gate: ${scopedBrowserSteps.length} serial task`
    + `${scopedBrowserSteps.length === 1 ? "" : "s"}`,
  );

  for (const step of scopedBrowserSteps) {
    const result = await runStep(step);
    printResults([result]);
    if (recordsFailure(result)) {
      failures.push(result);
      break;
    }
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
