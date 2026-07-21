# Public API tunnel (`api.yanylevin.com`)

NoteLMs-style setup: **`yanylevin.com` is a Cloudflare zone** (nameservers on Cloudflare). The static site still serves from **Vercel**; only `api` goes through a dedicated Cloudflare Tunnel to the Mac.

```
Browser
├─ https://yanylevin.com → Cloudflare DNS (proxied A) → Vercel
└─ https://api.yanylevin.com
     → Cloudflare Tunnel (cloudflared, config-yanylevin.yml)
          → Express :3004
               → LM Studio http://127.0.0.1:1234/v1  (never tunnelled)
```

## Cloudflare account

| Item | Value |
|------|--------|
| Account | NoteLMs / `Yl-2010@outlook.com` (`7f1605c0b926ebcf18dd0380275607b3`) |
| Zone ID | `faecd79217ad3dfda64601c692e1633b` |
| Nameservers | `addyson.ns.cloudflare.com`, `margo.ns.cloudflare.com` |
| Tunnel | `yanylevin-api` → `15a6dfc9-457c-49c4-80c5-5218924341c9` |
| Origin cert | `~/.cloudflared/cert.pem.notelms.bak` (same account as NoteLMs) |

SocketHR uses a **separate** Cloudflare account (`86a2cffa…`, NS gerardo/tia). Do not merge tunnels.

## DNS (Cloudflare zone, Free)

| Type | Name | Value | Proxy |
|------|------|--------|-------|
| A | `@` | `64.29.17.1` / `64.29.17.65` | Proxied |
| A | `www` | `64.29.17.1` / `64.29.17.65` | Proxied |
| A | `*` | `216.198.79.1` / `216.198.79.65` | Proxied |
| CNAME | `api` | `15a6dfc9-457c-49c4-80c5-5218924341c9.cfargotunnel.com` | **Proxied** |

Do **not** attach `api.yanylevin.com` as a Vercel project domain.

## Runtime

LaunchAgents `com.yanylevin.server` + `com.yanylevin.cloudflared`, or manually:

```bash
npm run server
cloudflared tunnel --config ~/.cloudflared/config-yanylevin.yml run
```

## Verify

```bash
curl -sS http://127.0.0.1:3004/health
npm run verify:public-api
```

Expect: `{"ok":true,"service":"yanylevin-server",...}`

Details: [`deploy/cloudflared/README.md`](../deploy/cloudflared/README.md).
