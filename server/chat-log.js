/**
 * Append every chat turn (user prompt + LLM output) to data/chat-log.md
 * so Yan can audit misuse locally.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_PATH = join(ROOT, "data", "chat-log.md");

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
}

export function getChatLogPath() {
  return LOG_PATH;
}
