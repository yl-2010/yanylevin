# Cloudflare Tunnel (yanylevin) — NoteLMs-style

`yanylevin.com` lives in the **same Cloudflare account as NoteLMs** (not SocketHR). Public DNS is on Cloudflare; the static site still hosts on Vercel via apex/`www` A records.

Do **not** put LM Studio (`:1234`) on the tunnel.

## Live pieces

| Piece | Value |
|-------|--------|
| Tunnel name | `yanylevin-api` |
| Tunnel UUID | `15a6dfc9-457c-49c4-80c5-5218924341c9` |
| Local config | `~/.cloudflared/config-yanylevin.yml` |
| Credentials | `~/.cloudflared/15a6dfc9-457c-49c4-80c5-5218924341c9.json` |
| Origin cert (this account) | `~/.cloudflared/cert.pem.notelms.bak` |
| Hostname | `api.yanylevin.com` → `http://127.0.0.1:3004` |

## Recreate (if needed)

```bash
# Use the NoteLMs Cloudflare account cert
cp ~/.cloudflared/cert.pem.notelms.bak ~/.cloudflared/cert.pem
cloudflared tunnel login   # only if cert missing; select yanylevin.com
bash deploy/cloudflared/setup-path-a.sh
# Then in Cloudflare DNS: proxied CNAME api → <UUID>.cfargotunnel.com
```

`setup-path-a.sh` still writes local ingress config; for this domain the **authoritative** `api` record must be the **proxied** Cloudflare DNS CNAME (same as NoteLMs), not a Vercel-only CNAME.

## Every session / LaunchAgents

```bash
cd /Users/yanlevin/github/yanylevin && npm run server
cloudflared tunnel --config ~/.cloudflared/config-yanylevin.yml run
```

Or rely on `com.yanylevin.server` + `com.yanylevin.cloudflared`.

## Verify

```bash
curl -sS http://127.0.0.1:3004/health
curl -sS https://api.yanylevin.com/health
```

Expect: `{"ok":true,"service":"yanylevin-server",...}`
