/**
 * Same-origin chat proxy → Mac Studio API (api.yanylevin.com).
 * Browser never needs a JWT; Vercel mints one server-side.
 */

const { mintHs256Jwt } = require("./_jwt");

const ISSUER = "yanylevin-next";
const AUDIENCE = "yanylevin-mac-api";
const VISITOR_EMAIL = "visitor@yanylevin.com";
const DEFAULT_MAC_API = "https://api.yanylevin.com";

function macApiBase() {
  const raw =
    process.env.MAC_API_BASE || process.env.YANYLEVIN_API_BASE || DEFAULT_MAC_API;
  return String(raw).replace(/\/$/, "");
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ ok: false, error: "method not allowed" });
      return;
    }

    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      res.status(503).json({ ok: false, error: "AUTH_SECRET not configured" });
      return;
    }

    const body = req.body || {};
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ ok: false, error: "messages required" });
      return;
    }

    const token = mintHs256Jwt({
      secret,
      email: VISITOR_EMAIL,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresInSec: 600,
    });

    const upstream = await fetch(`${macApiBase()}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: body.messages,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      res.status(502).json({
        ok: false,
        error: `Mac API returned non-JSON (${upstream.status}): ${text.slice(0, 180)}`,
      });
      return;
    }

    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("[api/chat proxy]", err);
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : "chat proxy failed",
    });
  }
};
