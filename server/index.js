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

const PORT = Number(process.env.PORT || 3004);
const HOST = process.env.HOST || "0.0.0.0";

const DEFAULT_ORIGINS = [
  "https://yanylevin.com",
  "https://www.yanylevin.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ORIGINS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
  res.json({
    ok: true,
    service: "yanylevin-server",
    authConfigured: authConfigured(),
    jwt: { issuer, audience },
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
 * Free-form chat against GPT-OSS for a future site chatbot.
 * Requires Bearer JWT (issuer yanylevin-next, audience yanylevin-mac-api).
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

    const result = await chatCompletions({
      messages: safe,
      temperature:
        typeof req.body?.temperature === "number" ? req.body.temperature : 0.4,
      maxTokens:
        typeof req.body?.maxTokens === "number" ? req.body.maxTokens : 2048,
    });
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
