/**
 * Load data/yan.md and build a slim always-on system prompt.
 * Detail sections are retrieved per turn (NoteLMs-style lexical RAG) — not stuffed whole.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitAndPushAgeBump, syncYanAge } from "./yan-age.js";
import { formatThemeContext } from "./chat-theme.js";
import {
  buildCompactAboutYan,
  formatRetrievedKnowledge,
  parseMarkdownSections,
  retrieveYanSections,
} from "./yan-retrieve.js";

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

/**
 * Slim system prompt: persona + abilities + compact about + theme + retrieved sections.
 * @param {Record<string, unknown> | null | undefined} uiContext
 * @param {{ query?: string }} [opts]
 */
export function buildYanSystemPrompt(uiContext, opts = {}) {
  const kb = loadYanMarkdown().trim();
  const now = formatExactNow();
  const themeLine = formatThemeContext(uiContext);
  const query = typeof opts.query === "string" ? opts.query : "";
  const retrieved = kb ? retrieveYanSections(kb, query) : [];
  const about = kb
    ? buildCompactAboutYan(kb)
    : "ABOUT YAN: (knowledge base unavailable)";

  const lines = [
    "You are GPT-OSS:20b, a formal assistant answering questions about Yan.",
    "You run on Yan’s local Mac Studio. Always refer to yourself as GPT-OSS:20b.",
    `Today's exact date and time is: ${now}.`,
    "Use that date for current-day / time-sensitive questions.",
    "",
    "TONE:",
    "- Very formal — no jokes, slang, emoji, or banter",
    "- Very concise — short direct answers; no filler",
    "- Refer to him as Yan in the third person (not Yan Levin / full name)",
    "- One phrase or one sentence replies: do not end with a period",
    "- “Who is he?” / “Who is Yan?” → one short sentence only",
    "- Do not volunteer personal-life details (languages, heritage, DOB, hobbies, family, phone, YouTube) unless directly asked",
    "",
    "SITE ABILITIES (you have these on this website):",
    "- Answer factual questions about Yan using ABOUT YAN and RETRIEVED KNOWLEDGE",
    "- Site theme can be changed to light, dark, or system when the user asks — the website front-end applies it",
    "- ONLY confirm a theme change when THEME UPDATE APPLIED is present in this prompt (the site already applied it). If the user asks about theme but THEME UPDATE APPLIED is missing, ask which they want: light, dark, or system",
    "- Never claim a theme change succeeded unless THEME UPDATE APPLIED is present",
    "- Never say you cannot change the theme or lack that ability",
    "- Do not emit JSON, control tokens, or action markup",
    "",
    about,
  ];

  if (themeLine) {
    lines.push("", themeLine);
  }

  lines.push("", formatRetrievedKnowledge(retrieved));
  return lines.join("\n");
}

/** Knowledge-base stats for /health. */
export function getKnowledgeStats() {
  const kb = loadYanMarkdown();
  const sections = kb ? parseMarkdownSections(kb) : [];
  return {
    loaded: Boolean(kb && kb.trim()),
    bytes: kb ? Buffer.byteLength(kb, "utf8") : 0,
    sections: sections.length,
  };
}
