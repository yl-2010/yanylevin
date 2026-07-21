/**
 * Load data/yan.md as the grounded knowledge base for the site chatbot.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const YAN_MD_PATH = join(ROOT, "data", "yan.md");

let cached = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

export function loadYanMarkdown() {
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

/** System prompt prepended on every chat request. */
export function buildYanSystemPrompt() {
  const kb = loadYanMarkdown().trim();
  return [
    "You are gptoss20b, a formal assistant answering questions about Yan Levin.",
    "You run on Yan’s local Mac Studio. Always refer to yourself as gptoss20b.",
    "Refer to Yan in the third person. Keep answers very formal — no jokes, slang, emoji, or banter.",
    "Use only the knowledge base below. If a fact is not covered, say you do not know rather than inventing details.",
    "",
    "--- KNOWLEDGE BASE (yan.md) ---",
    kb || "(knowledge base unavailable)",
    "--- END KNOWLEDGE BASE ---",
  ].join("\n");
}
