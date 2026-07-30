#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  syncRuntimeAssetVersions,
  verifyRuntimeAssetVersions,
} from "./cache-versions.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultPublicUrl = "https://gorokhovatsky.tech/";
const forbiddenReleasePaths = [
  ".DS_Store",
  ".qa-artifacts/",
  "artifacts/",
  "test-results/",
];

const fail = (message) => {
  console.error(`\nRelease stopped: ${message}`);
  process.exit(1);
};

const run = (
  command,
  args,
  {
    capture = false,
    label = `${command} ${args.join(" ")}`,
  } = {},
) => new Promise((resolveRun, rejectRun) => {
  console.log(`\n→ ${label}`);
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  let stdout = "";
  let stderr = "";

  if (capture) {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
  }

  child.once("error", rejectRun);
  child.once("close", (status) => {
    if (status !== 0) {
      rejectRun(new Error(
        `${label} failed with exit ${status}`
        + (stderr.trim() ? `\n${stderr.trim()}` : ""),
      ));
      return;
    }

    resolveRun({ stdout, stderr });
  });
});

const parseArguments = () => {
  const args = process.argv.slice(2);
  const options = {
    files: [],
    message: "",
    publicUrl: defaultPublicUrl,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--message" || argument === "-m") {
      options.message = args[index + 1] || "";
      index += 1;
    } else if (argument === "--file" || argument === "-f") {
      options.files.push(args[index + 1] || "");
      index += 1;
    } else if (argument === "--url") {
      options.publicUrl = args[index + 1] || "";
      index += 1;
    } else {
      fail(`unknown argument "${argument}".`);
    }
  }

  options.files = [...new Set(options.files.filter(Boolean))];
  return options;
};

const readGitLines = async (args) => {
  const { stdout } = await run("git", args, {
    capture: true,
    label: `git ${args.join(" ")}`,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
};

const normalizeStatusPath = (line) => {
  const path = line.slice(3).trim();
  const renameTarget = path.includes(" -> ") ? path.split(" -> ").at(-1) : path;
  return renameTarget.replace(/^"|"$/g, "");
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const getLocalRuntimeAssets = () => {
  const html = readFileSync(resolve(projectRoot, "index.html"), "utf8");
  const assetReferences = [...html.matchAll(
    /(?:src|href)=["']((?:styles\.css|(?:js|assets)\/[^"'?#]+)(?:\?[^"']*)?)["']/g,
  )].map((match) => match[1]);

  return {
    html,
    htmlHash: sha256(html),
    assets: [...new Set(assetReferences)]
      .map((reference) => ({
        reference,
        path: reference.split(/[?#]/, 1)[0],
      }))
      .filter(({ path }) => existsSync(resolve(projectRoot, path)))
      .map(({ path, reference }) => ({
        path,
        reference,
        hash: sha256(readFileSync(resolve(projectRoot, path))),
      })),
  };
};

const fetchWithTimeout = async (url, timeout = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const verifyPublicRelease = async (publicUrl, commit, localRuntime) => {
  const deadline = Date.now() + 240000;
  const releaseUrl = new URL(publicUrl);
  let lastDifference = "production HTML is not available yet";

  console.log(`\n→ Waiting for Pages at ${releaseUrl}`);

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(releaseUrl);
      if (!response.ok) {
        lastDifference = `HTTP ${response.status}`;
      } else {
        const publicHtml = await response.text();
        const publicHtmlHash = sha256(publicHtml);
        const localRuntimeReferences = localRuntime.assets.map(({ reference }) => reference);
        const missingReferences = localRuntimeReferences.filter((reference) => (
          !publicHtml.includes(reference)
        ));

        if (publicHtmlHash !== localRuntime.htmlHash) {
          lastDifference = "production HTML is still stale";
        } else if (missingReferences.length > 0) {
          lastDifference = `missing runtime references: ${missingReferences.join(", ")}`;
        } else {
          const mismatchedAssets = [];

          for (const asset of localRuntime.assets) {
            const assetUrl = new URL(asset.reference, releaseUrl);
            const assetResponse = await fetchWithTimeout(assetUrl);
            const bytes = Buffer.from(await assetResponse.arrayBuffer());

            if (!assetResponse.ok || sha256(bytes) !== asset.hash) {
              mismatchedAssets.push(asset.path);
            }
          }

          if (mismatchedAssets.length === 0) {
            console.log(
              `✓ Pages serves ${localRuntime.assets.length} exact runtime assets from ${commit.slice(0, 12)}.`,
            );
            return;
          }

          lastDifference = `stale runtime assets: ${mismatchedAssets.join(", ")}`;
        }
      }
    } catch (error) {
      lastDifference = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, 5000);
    });
  }

  fail(`Pages did not converge to the release within 4 minutes (${lastDifference}).`);
};

const verifyRemoteBranches = async (commit) => {
  const branchLines = await readGitLines([
    "ls-remote",
    "--heads",
    "origin",
    "refs/heads/main",
    "refs/heads/gh-pages",
  ]);
  const branchCommits = new Map(branchLines.map((line) => {
    const [hash, reference] = line.split(/\s+/);
    return [reference, hash];
  }));
  const mismatchedBranches = [
    "refs/heads/main",
    "refs/heads/gh-pages",
  ].filter((reference) => branchCommits.get(reference) !== commit);

  if (mismatchedBranches.length > 0) {
    fail(
      `remote branches do not point to ${commit.slice(0, 12)}: `
      + mismatchedBranches.join(", "),
    );
  }

  console.log(`✓ main and gh-pages point to ${commit.slice(0, 12)}.`);
};

const options = parseArguments();
if (!options.message.trim()) {
  fail("provide a commit message with --message.");
}
if (options.files.length === 0) {
  fail("provide each intended release file with --file.");
}

const branch = (await readGitLines(["branch", "--show-current"]))[0] || "";
if (branch !== "main") {
  fail(`current branch is "${branch || "(detached)"}", expected "main".`);
}

const initialStatusLines = await readGitLines([
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
]);
const initialChangedPaths = initialStatusLines.map(normalizeStatusPath);
const initialUnexpectedPaths = initialChangedPaths.filter(
  (path) => !options.files.includes(path),
);
const initialMissingPaths = options.files.filter((path) => (
  path !== "index.html" && !initialChangedPaths.includes(path)
));
const initialForbiddenPaths = initialChangedPaths.filter((path) => (
  forbiddenReleasePaths.some((prefix) => path === prefix || path.startsWith(prefix))
));

if (initialUnexpectedPaths.length > 0) {
  fail(
    `working tree has changes outside the release scope: `
    + `${initialUnexpectedPaths.join(", ")}.`,
  );
}
if (initialMissingPaths.length > 0) {
  fail(`release files are not changed: ${initialMissingPaths.join(", ")}.`);
}
if (initialForbiddenPaths.length > 0) {
  fail(`QA artifacts cannot be released: ${initialForbiddenPaths.join(", ")}.`);
}

let cacheUpdate;

try {
  cacheUpdate = syncRuntimeAssetVersions(projectRoot);
} catch (error) {
  fail(
    "could not update CSS/JS content hashes: "
    + (error instanceof Error ? error.message : String(error)),
  );
}

if (cacheUpdate.changed && !options.files.includes(cacheUpdate.indexPath)) {
  options.files.push(cacheUpdate.indexPath);
  console.log(`\n✓ Added automatic cache manifest update: ${cacheUpdate.indexPath}.`);
}

const statusLines = await readGitLines([
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
]);
const changedPaths = statusLines.map(normalizeStatusPath);
const unexpectedPaths = changedPaths.filter((path) => !options.files.includes(path));
const missingPaths = options.files.filter((path) => !changedPaths.includes(path));
const forbiddenPaths = changedPaths.filter((path) => (
  forbiddenReleasePaths.some((prefix) => path === prefix || path.startsWith(prefix))
));

if (unexpectedPaths.length > 0) {
  fail(`working tree has changes outside the release scope: ${unexpectedPaths.join(", ")}.`);
}
if (missingPaths.length > 0) {
  fail(`release files are not changed: ${missingPaths.join(", ")}.`);
}
if (forbiddenPaths.length > 0) {
  fail(`QA artifacts cannot be released: ${forbiddenPaths.join(", ")}.`);
}

console.log("\nRelease scope:");
options.files.forEach((path) => console.log(`- ${path}`));

try {
  await run(
    "git",
    ["push", "--dry-run", "origin", "HEAD:main", "HEAD:gh-pages"],
    { label: "Verify the real GitHub push path" },
  );
  await run(process.execPath, ["scripts/check-project.mjs"], {
    label: "Run the parallel production gate",
  });
  verifyRuntimeAssetVersions(projectRoot);
  console.log("\n✓ CSS/JS references match their current content hashes.");
  await run("git", ["add", "--", ...options.files], {
    label: "Stage the approved release scope",
  });

  const stagedPaths = await readGitLines(["diff", "--cached", "--name-only"]);
  const stagedOutsideScope = stagedPaths.filter((path) => !options.files.includes(path));
  if (stagedOutsideScope.length > 0) {
    fail(`staged changes escaped the release scope: ${stagedOutsideScope.join(", ")}.`);
  }

  await run("git", ["commit", "-m", options.message.trim()], {
    label: "Create the release commit",
  });
  const [commit] = await readGitLines(["rev-parse", "HEAD"]);
  const localRuntime = getLocalRuntimeAssets();

  await run("git", ["push", "origin", "main", "main:gh-pages"], {
    label: "Publish the same commit to main and gh-pages",
  });
  await verifyRemoteBranches(commit);
  await verifyPublicRelease(options.publicUrl, commit, localRuntime);

  console.log(`\nRelease complete: ${commit}`);
  console.log(options.publicUrl);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
