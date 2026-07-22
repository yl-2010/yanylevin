/**
 * Keep data/yan.md **Age** in sync with date of birth (America/Los_Angeles).
 * Month-only DOB (e.g. "June 2010") uses the 1st of that month as the birthday.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitAddCommitPush } from "./git-publish.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const YAN_MD_PATH = join(ROOT, "data", "yan.md");

const TZ = "America/Los_Angeles";

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const DOB_RE = /^- \*\*Date of birth:\*\* ([A-Za-z]+) (\d{4})\s*$/m;
const AGE_RE = /^- \*\*Age:\*\* (\d+).*$/m;

function pacificYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const n = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: n("year"), month: n("month"), day: n("day") };
}

/** @returns {{ year: number, month: number, day: number } | null} */
export function parseDob(markdown) {
  const m = String(markdown).match(DOB_RE);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const year = Number(m[2]);
  if (!month || !Number.isFinite(year)) return null;
  return { year, month, day: 1 };
}

export function ageFromDob(dob, now = new Date()) {
  const today = pacificYmd(now);
  let age = today.year - dob.year;
  if (
    today.month < dob.month ||
    (today.month === dob.month && today.day < dob.day)
  ) {
    age -= 1;
  }
  return age;
}

function ageLine(age) {
  return `- **Age:** ${age} *(auto-updated from date of birth; do not edit by hand)*`;
}

/**
 * Rewrite the Age line in yan.md when it does not match today's age.
 * @returns {{ updated: boolean, age: number|null, path: string }}
 */
export function syncYanAge(path = YAN_MD_PATH) {
  const text = readFileSync(path, "utf8");
  const dob = parseDob(text);
  if (!dob) {
    console.warn("[yan-age] no Date of birth line found; skipping");
    return { updated: false, age: null, path };
  }

  const age = ageFromDob(dob);
  const existing = text.match(AGE_RE);
  if (existing && Number(existing[1]) === age) {
    return { updated: false, age, path };
  }

  let next;
  if (existing) {
    next = text.replace(AGE_RE, ageLine(age));
  } else {
    next = text.replace(DOB_RE, (line) => `${line}\n${ageLine(age)}`);
  }

  if (next === text) {
    console.warn("[yan-age] could not insert/replace Age line");
    return { updated: false, age, path };
  }

  writeFileSync(path, next, "utf8");
  console.log(`[yan-age] updated Age → ${age} in ${path}`);
  return { updated: true, age, path };
}

/** Commit + push Age bump so main stays current (best-effort). */
export async function commitAndPushAgeBump(age) {
  const result = await gitAddCommitPush({
    paths: ["data/yan.md"],
    message: `Bump Yan age to ${age} in yan.md`,
  });
  if (result.pushed) console.log(`[yan-age] pushed Age ${age} to main`);
  else if (result.reason && result.reason !== "no changes") {
    console.error("[yan-age] git push failed", result.reason);
  }
  return result;
}

/** Run sync; if Age changed, best-effort commit/push. */
export async function syncYanAgeAndPublish(path = YAN_MD_PATH) {
  const result = syncYanAge(path);
  if (result.updated && result.age != null) {
    await commitAndPushAgeBump(result.age);
  }
  return result;
}
