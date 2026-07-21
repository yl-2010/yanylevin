/**
 * Same-origin visitor JWT mint for the Mac Studio API.
 * Secret must match server/.env AUTH_SECRET on the Mac.
 */

const { SignJWT } = require("jose");

const ISSUER = "yanylevin-next";
const AUDIENCE = "yanylevin-mac-api";
const VISITOR_EMAIL = "visitor@yanylevin.com";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    res.status(503).json({ ok: false, error: "AUTH_SECRET not configured" });
    return;
  }

  try {
    const token = await new SignJWT({
      email: VISITOR_EMAIL,
      name: "Site visitor",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(VISITOR_EMAIL)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(secret));

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      ok: true,
      token,
      expiresIn: 600,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch (err) {
    console.error("[mac-token]", err);
    res.status(500).json({ ok: false, error: "token mint failed" });
  }
};
