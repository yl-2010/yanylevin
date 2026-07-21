# Public API tunnel (`api.yanylevin.com`)

Same pattern as NoteLMs: **`yanylevin.com` is a Cloudflare zone** (nameservers on Cloudflare). A dedicated tunnel exposes only the Mac Express API.

```
Browser
  → https://api.yanylevin.com
       → Cloudflare Tunnel (cloudflared, config-yanylevin.yml)
            → Express :3004
                 → LM Studio http://127.0.0.1:1234/v1  (never tunnelled)
```

## Live setup (this Mac)

| Item | Value |
|------|--------|
| Cloudflare account | Same as NoteLMs (`Yl-2010`) |
| Zone | `yanylevin.com` |
| Nameservers | `addyson.ns.cloudflare.com`, `margo.ns.cloudflare.com` |
| Tunnel | `yanylevin-api` → `15a6dfc9-457c-49c4-80c5-5218924341c9` |
| Config | `~/.cloudflared/config-yanylevin.yml` |
| DNS | Proxied CNAME `api` → `<tunnel-uuid>.cfargotunnel.com` |
| Apex / www | Point at Vercel (A records) so the static site stays on Vercel |

Do **not** attach `api.yanylevin.com` as a Vercel project domain.

SocketHR (`api.sockethr.com`) and NoteLMs (`api.notelms.com`) keep their own tunnels — three `cloudflared` processes.

## Runtime

LaunchAgents `com.yanylevin.server` + `com.yanylevin.cloudflared`, or manually:

```bash
npm run server
cloudflared tunnel --config ~/.cloudflared/config-yanylevin.yml run
```

## Verify

```bash
npm run verify:public-api
# or
curl -sS https://api.yanylevin.com/health
```

Details: [`deploy/cloudflared/README.md`](../deploy/cloudflared/README.md).
