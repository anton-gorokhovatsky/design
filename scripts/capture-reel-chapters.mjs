// Compatibility entry point: all media derivatives and metadata stay in sync.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ids = process.argv.slice(2);
for (const id of ids.length ? ids : [null]) {
  execFileSync(process.execPath, [fileURLToPath(new URL("./prepare-reels.mjs", import.meta.url)), ...(id ? [id] : [])], { stdio: "inherit" });
}
