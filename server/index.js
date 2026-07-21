/**
 * Yan Levin personal-site Mac Express API.
 * Pattern matches SocketHR / NoteLMs: JWT from Vercel, LM Studio GPT-OSS, Cloudflare Tunnel.
 *
 * Port 3004 — public hostname api.yanylevin.com (own tunnel; never expose :1234).
 */

import express from "express";
import cors from "cors";
import { authConfigured, requireAuth, getAuthConfig } from "./auth.js";
import { probeLmStudio, chatCompletions, getLmStudioConfig } from "./lmstudio.js";
import { buildYanSystemPrompt, loadYanMarkdown } from "./yan-kb.js";
import { appendChatTurn } from "./chat-log.js";
import { mintVisitorToken } from "./mint.js";

const PORT = Number(process.env.PORT || 3004);
const HOST = process.env.HOST || "0.0.0.0";

const DEFAULT_ORIGINS = [
  "https://yanylevin.com",
  "https://www.yanylevin.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ORIGINS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Very small in-memory rate limit for visitor token minting. */
const tokenHits = new Map();
function rateLimitOk(ip, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const key = ip || "unknown";
  let bucket = tokenHits.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    tokenHits.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const list = allowedOrigins();
      if (list.includes(origin) || list.includes("*")) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  const lm = await probeLmStudio();
  const { issuer, audience } = getAuthConfig();
  const kb = loadYanMarkdown();
  res.json({
    ok: true,
    service: "yanylevin-server",
    authConfigured: authConfigured(),
    jwt: { issuer, audience },
    knowledgeBase: {
      loaded: Boolean(kb && kb.trim()),
      bytes: kb ? Buffer.byteLength(kb, "utf8") : 0,
    },
    lmStudio: {
      ok: lm.ok,
      baseUrl: lm.baseUrl,
      model: lm.model,
      modelLoaded: lm.modelLoaded ?? false,
    },
    time: new Date().toISOString(),
  });
});

/**
 * Mint a short-lived visitor JWT for the public FAQ chatbot.
 * Used by local preview and as a fallback when the Vercel bridge is unavailable.
 */
app.get("/api/visitor-token", async (req, res) => {
  try {
    if (!authConfigured()) {
      res.status(503).json({ ok: false, error: "AUTH_SECRET not configured" });
      return;
    }
    const ip = req.ip || req.socket?.remoteAddress || "";
    if (!rateLimitOk(ip)) {
      res.status(429).json({ ok: false, error: "rate limit exceeded" });
      return;
    }
    const token = await mintVisitorToken();
    const { issuer, audience } = getAuthConfig();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      token,
      expiresIn: 600,
      issuer,
      audience,
    });
  } catch (err) {
    console.error("[/api/visitor-token]", err);
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || "token mint failed",
    });
  }
});

/**
 * Free-form chat against GPT-OSS for the site chatbot.
 * Requires Bearer JWT. Always injects yan.md as the system prompt.
 */
app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ ok: false, error: "messages required" });
      return;
    }
    const safe = messages
      .filter(
        (m) =>
          m &&
          typeof m.role === "string" &&
          typeof m.content === "string" &&
          ["system", "user", "assistant"].includes(m.role)
      )
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 16000) }));

    if (!safe.length) {
      res.status(400).json({ ok: false, error: "no valid messages" });
      return;
    }

    // Always ground answers in yan.md — strip client system messages so visitors
    // cannot override the knowledge base / persona.
    const conversation = safe.filter((m) => m.role !== "system");
    if (!conversation.length) {
      res.status(400).json({ ok: false, error: "no user messages" });
      return;
    }

    const grounded = [
      { role: "system", content: buildYanSystemPrompt() },
      ...conversation,
    ];

    const result = await chatCompletions({
      messages: grounded,
      temperature:
        typeof req.body?.temperature === "number" ? req.body.temperature : 0.4,
      maxTokens:
        typeof req.body?.maxTokens === "number" ? req.body.maxTokens : 2048,
    });

    // Audit trail: every user prompt + model reply → data/chat-log.md
    appendChatTurn({
      messages: conversation,
      assistantContent: result.content,
      model: result.model,
      ip: req.ip || req.socket?.remoteAddress || "",
    }).catch((err) => console.error("[chat-log]", err));

    res.json({
      ok: true,
      content: result.content,
      model: result.model,
      usage: result.usage,
      lmStudio: getLmStudioConfig(),
    });
  } catch (err) {
    console.error("[/api/chat]", err);
    res.status(502).json({ ok: false, error: err.message || "chat failed" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not found" });
});

app.listen(PORT, HOST, () => {
  console.log(
    `[yanylevin-server] listening on http://${HOST}:${PORT} (auth=${authConfigured() ? "configured" : "missing"})`
  );
});
