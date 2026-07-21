#!/usr/bin/env bash
# NoteLMs-style: Cloudflare zone DNS + dedicated tunnel (not Vercel-DNS Path A).
# Prefer TUNNEL_ORIGIN_CERT pointing at the NoteLMs account cert.
# Prerequisites: brew install cloudflare/cloudflare/cloudflared
#
# Live setup (2026-07-21):
#   Account: NoteLMs / Yl-2010 (7f1605c0b926ebcf18dd0380275607b3)
#   Zone:    yanylevin.com (faecd79217ad3dfda64601c692e1633b)
#   Tunnel:  15a6dfc9-457c-49c4-80c5-5218924341c9 (yanylevin-api)
#   NS:      addyson.ns.cloudflare.com / margo.ns.cloudflare.com
#
# This script only writes ~/.cloudflared/config-yanylevin.yml for an existing tunnel.

set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-yanylevin-api}"
API_HOSTNAME="${API_HOSTNAME:-api.yanylevin.com}"
LOCAL_SERVICE="${LOCAL_SERVICE:-http://127.0.0.1:3004}"
CF_DIR="${HOME}/.cloudflared"
# NoteLMs-account origin cert (same account as notelms.com)
export TUNNEL_ORIGIN_CERT="${TUNNEL_ORIGIN_CERT:-${CF_DIR}/cert.pem.notelms.bak}"
CONFIG_OUT="${CONFIG_OUT:-${CF_DIR}/config-yanylevin.yml}"

die() { echo "error: $*" >&2; exit 1; }

command -v cloudflared >/dev/null 2>&1 || die "cloudflared not found. Install: brew install cloudflare/cloudflare/cloudflared"
[[ -f "${TUNNEL_ORIGIN_CERT}" ]] || die "Missing origin cert: ${TUNNEL_ORIGIN_CERT}"

get_tunnel_id_for_name() {
  cloudflared tunnel list -o json 2>/dev/null | python3 -c "
import json, sys
name = sys.argv[1]
raw = json.load(sys.stdin)
rows = raw if isinstance(raw, list) else raw.get('tunnels') or raw.get('result') or []
if not isinstance(rows, list):
    rows = [rows]
for row in rows:
    if not isinstance(row, dict):
        continue
    if row.get('name') == name or row.get('Name') == name:
        print(row.get('id') or row.get('ID') or '')
        break
" "${TUNNEL_NAME}"
}

TUNNEL_ID="$(get_tunnel_id_for_name || true)"
[[ -n "${TUNNEL_ID}" ]] || die "Tunnel ${TUNNEL_NAME} not found in NoteLMs CF account. Create with: TUNNEL_ORIGIN_CERT=${TUNNEL_ORIGIN_CERT} cloudflared tunnel create ${TUNNEL_NAME}"

CREDS="${CF_DIR}/${TUNNEL_ID}.json"
[[ -f "${CREDS}" ]] || die "Missing credentials file: ${CREDS}"

cat > "${CONFIG_OUT}" <<EOF
# NoteLMs-style: dedicated Cloudflare zone + tunnel
# Tunnel: ${TUNNEL_NAME} (${TUNNEL_ID}) → ${LOCAL_SERVICE}

tunnel: ${TUNNEL_ID}
credentials-file: ${CREDS}

ingress:
  - hostname: ${API_HOSTNAME}
    service: ${LOCAL_SERVICE}
  - service: http_status:404
EOF

echo "Wrote ${CONFIG_OUT}"
echo "Ensure Cloudflare DNS (proxied): CNAME api → ${TUNNEL_ID}.cfargotunnel.com"
echo "Run: cloudflared tunnel --config ${CONFIG_OUT} run"
