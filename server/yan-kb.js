/**
 * Load data/yan.md as the grounded knowledge base for the site chatbot.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitAndPushAgeBump, syncYanAge } from "./yan-age.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const YAN_MD_PATH = join(ROOT, "data", "yan.md");

let cached = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

export function invalidateYanMarkdownCache() {
  cached = null;
  cachedAt = 0;
}

export function loadYanMarkdown() {
  try {
    const { updated, age } = syncYanAge(YAN_MD_PATH);
    if (updated) {
      invalidateYanMarkdownCache();
      if (age != null) {
        commitAndPushAgeBump(age).catch((err) =>
          console.error("[yan-kb] age push failed", err)
        );
      }
    }
  } catch (err) {
    console.error("[yan-kb] age sync failed", err);
  }

  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;
  try {
    cached = readFileSync(YAN_MD_PATH, "utf8");
    cachedAt = now;
    return cached;
  } catch (err) {
    console.error("[yan-kb] failed to read yan.md", err);
    return cached || "";
  }
}

/** Exact calendar date/time for the model (America/Los_Angeles). */
export function formatExactNow(date = new Date()) {
  const tz = "America/Los_Angeles";
  const pretty = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
  return `${pretty} (ISO ${date.toISOString()})`;
}

/** System prompt prepended on every chat request. */
export function buildYanSystemPrompt() {
  const kb = loadYanMarkdown().trim();
  const now = formatExactNow();
  return [
    "You are gptoss20b, a formal assistant answering questions about Yan Levin.",
    "You run on Yan’s local Mac Studio. Always refer to yourself as gptoss20b.",
    `Today's exact date and time is: ${now}.`,
    "Use that date when answering questions about the current day, deadlines, or anything time-sensitive.",
    "For Yan’s age, use the **Age** field in the knowledge base exactly — do not recompute age from the birth year alone.",
    "Refer to Yan in the third person. Keep answers very formal — no jokes, slang, emoji, or banter.",
    "Be very concise. Prefer short, direct answers; avoid filler and unnecessary preamble.",
    "For open-ended questions like “Who is he?” or “Who is Yan?”, answer in one short sentence only.",
    "Do not volunteer personal-life information (languages, heritage, date of birth, hobbies, family, etc.) unless the user directly asks for that category.",
    "Use only the knowledge base below. If a fact is not covered, say you do not know rather than inventing details.",
    "",
    "--- KNOWLEDGE BASE (yan.md) ---",
    kb || "(knowledge base unavailable)",
    "--- END KNOWLEDGE BASE ---",
  ].join("\n");
}
