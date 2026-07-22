/**
 * Append every chat turn (user prompt + LLM output) to data/chat-log.md
 * and commit + push to main so the audit trail stays on GitHub.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitAddCommitPush } from "./git-publish.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_PATH = join(ROOT, "data", "chat-log.md");
const LOG_REPO_PATH = "data/chat-log.md";

function lastUserContent(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i].content;
  }
  return "";
}

function fence(text) {
  const body = String(text ?? "");
  const ticks = body.includes("```") ? "````" : "```";
  return `${ticks}\n${body}\n${ticks}`;
}

/**
 * @param {object} opts
 * @param {Array<{role: string, content: string}>} opts.messages conversation (no system)
 * @param {string} opts.assistantContent
 * @param {string} [opts.model]
 * @param {string} [opts.ip]
 */
export async function appendChatTurn({
  messages,
  assistantContent,
  model = "",
  ip = "",
} = {}) {
  const userPrompt = lastUserContent(messages || []);
  const when = new Date().toISOString();
  const block = [
    "",
    `## ${when}`,
    "",
    `- model: ${model || "(unknown)"}`,
    `- ip: ${ip || "(unknown)"}`,
    "",
    "### User",
    "",
    fence(userPrompt),
    "",
    "### Assistant",
    "",
    fence(assistantContent),
    "",
    "---",
    "",
  ].join("\n");

  await mkdir(dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, block, "utf8");

  const result = await gitAddCommitPush({
    paths: [LOG_REPO_PATH],
    message: `Append chat turn ${when}`,
  });
  if (!result.pushed && result.reason && result.reason !== "no changes") {
    console.error("[chat-log] git publish failed:", result.reason);
  }
}

export function getChatLogPath() {
  return LOG_PATH;
}
