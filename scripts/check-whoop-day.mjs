import assert from "node:assert/strict";
import { normalizeDay, dayPalette } from "../js/whoop-day.js";

const now = Date.parse("2026-09-25T17:30:00Z");
const day = { schema: 1, source: "WHOOP", fetched_at: "2026-09-25T17:25:00Z",
  recovery: { value: 77, updated_at: "2026-09-25T02:19:00Z" },
  sleep: { minutes: 362, ended_at: "2026-09-25T02:18:00Z" },
  strain: { value: 12.9, updated_at: "2026-09-25T06:23:00Z" } };
assert.equal(normalizeDay(day, now).colour, true, "A morning recovery remains current through the day.");
assert.equal(normalizeDay(day, now + 3 * 3600000).colour, false, "A disconnected publisher cannot keep colouring the map indefinitely.");
assert.equal(normalizeDay({ ...day, fetched_at: "2026-09-27T17:25:00Z" }, now + 48 * 3600000).colour, false, "Refreshing an old night does not make it current.");
assert.throws(() => normalizeDay({ ...day, fetched_at: "tomorrow" }, now));
assert.throws(() => normalizeDay({ ...day, fetched_at: "2027-09-25T17:25:00Z" }, now));
assert.equal(normalizeDay({ ...day, recovery: { value: null } }, now).recovery, null);
assert.equal(normalizeDay({ ...day, recovery: { value: 0 } }, now).recovery, 0, "Zero is a valid score.");
assert.equal(normalizeDay({ ...day, recovery: { value: "77" }, strain: { value: 22 } }, now).colour, false);
assert.equal(normalizeDay({ ...day, strain: { value: 22 } }, now).strain, null);
assert.equal(normalizeDay({ ...day, sleep: { ...day.sleep, minutes: -1 } }, now).sleep, null);
assert.equal(normalizeDay({ ...day, access_token: "must not propagate", hrv: 50 }, now).access_token, undefined);
for (const [scores, label] of [[[0, 33, 33.49], "Низкое"], [[33.5, 34, 50, 66, 66.49], "Среднее"], [[66.5, 67, 77, 100], "Высокое"]]) {
  for (const score of scores) assert.equal(dayPalette(score).label, label, `Zone agrees with the displayed ${Math.round(score)}%.`);
  assert.ok(dayPalette(scores[0]).rgb.split(",").every(value => Number.isFinite(Number(value))));
}
assert.equal(new Set([25, 50, 77].map(score => dayPalette(score).rgb)).size, 3);
assert.deepEqual(dayPalette(77, 18), dayPalette(77, 5), "Accumulated strain cannot change the recovery palette.");
console.log("WHOOP day: valid zero, partial data, source timestamps, stale fallback and palette boundaries passed.");
