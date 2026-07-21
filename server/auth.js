/**
 * JWT verification for tokens minted by a future Vercel /api/mac-token route.
 * Secret must match Vercel NEXTAUTH_SECRET (or AUTH_SECRET) when auth is added.
 */

import { jwtVerify } from "jose";

export function getAuthConfig() {
  return {
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "",
    issuer: process.env.JWT_ISSUER || "yanylevin-next",
    audience: process.env.JWT_AUDIENCE || "yanylevin-mac-api",
  };
}

export function authConfigured() {
  return Boolean(getAuthConfig().secret);
}

/**
 * @returns {Promise<{ email: string, name: string|null, sub: string }|null>}
 */
export async function getAuthFromRequest(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const { secret, issuer, audience } = getAuthConfig();
  if (!secret) {
    const err = new Error("AUTH_SECRET not configured");
    err.status = 503;
    throw err;
  }

  try {
    const { payload } = await jwtVerify(match[1], new TextEncoder().encode(secret), {
      issuer,
      audience,
      algorithms: ["HS256"],
    });

    const emailRaw =
      (typeof payload.email === "string" && payload.email) ||
      (typeof payload.sub === "string" && payload.sub.includes("@") ? payload.sub : null);

    if (!emailRaw || typeof emailRaw !== "string") {
      return null;
    }

    const email = emailRaw.trim().toLowerCase();
    if (!email.includes("@")) return null;

    return {
      email,
      name: typeof payload.name === "string" ? payload.name : null,
      sub: typeof payload.sub === "string" ? payload.sub : email,
    };
  } catch {
    return null;
  }
}

/** Express middleware: require valid Bearer JWT; attach req.user. */
export function requireAuth(req, res, next) {
  getAuthFromRequest(req)
    .then((user) => {
      if (!user) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      req.user = user;
      next();
    })
    .catch((err) => {
      const status = err.status || 500;
      res.status(status).json({
        ok: false,
        error: err.message || "auth failed",
      });
    });
}
