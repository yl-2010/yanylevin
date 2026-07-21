/**
 * Minimal HS256 JWT helpers for Vercel serverless (no jose dependency).
 */

const crypto = require("crypto");

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64url");
}

/**
 * @param {object} opts
 * @param {string} opts.secret
 * @param {string} opts.email
 * @param {string} [opts.name]
 * @param {string} [opts.issuer]
 * @param {string} [opts.audience]
 * @param {number} [opts.expiresInSec]
 */
function mintHs256Jwt({
  secret,
  email,
  name = "Site visitor",
  issuer = "yanylevin-next",
  audience = "yanylevin-mac-api",
  expiresInSec = 600,
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    email,
    name,
    sub: email,
    iss: issuer,
    aud: audience,
    iat: now,
    exp: now + expiresInSec,
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

module.exports = { mintHs256Jwt };
