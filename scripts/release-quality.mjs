// Publication accepts only a successful main push run of this exact commit.
// An older green commit, PR check, skipped run or cancelled run cannot release.
export const selectQualityRun = (runs, commit) => runs
  .filter((run) => run.headSha === commit && run.headBranch === "main"
    && run.event === "push" && run.workflowName === "Quality")
  .sort((a, b) => b.databaseId - a.databaseId)[0];

export const waitForQuality = async ({
  commit, readRuns, log = console.log, now = Date.now,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  timeoutMs = 25 * 60 * 1000, intervalMs = 15000,
}) => {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Expected a full commit SHA.");
  const deadline = now() + timeoutMs;
  let lastState = "";
  while (now() < deadline) {
    const run = selectQualityRun(await readRuns(), commit);
    const state = run ? `${run.status}/${run.conclusion || "pending"}` : "waiting for run";
    if (state !== lastState) {
      log(`Quality ${commit.slice(0, 12)}: ${state}${run ? ` — ${run.url}` : ""}`);
      lastState = state;
    }
    if (run?.status === "completed") {
      if (run.conclusion !== "success") {
        throw new Error(`Quality ${run.conclusion}: ${run.url}. gh-pages was not updated.`);
      }
      return run;
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
  throw new Error(`Quality did not succeed within ${timeoutMs / 60000} minutes. gh-pages was not updated.`);
};
