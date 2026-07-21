# Cloudflare Tunnel + Cloudflare DNS (yanylevin)

Same pattern as NoteLMs: **`yanylevin.com` lives in the NoteLMs Cloudflare account** (NS `addyson` / `margo`). Apex/www stay on Vercel via proxied A records; **`api.yanylevin.com`** is a proxied Tunnel CNAME to the Mac Express API on port **3004**.

This is a **separate** tunnel from SocketHR (`~/.cloudflared/config.yml`) and NoteLMs (`~/.cloudflared/config-notelms.yml`). Do **not** put LM Studio (`:1234`) on the tunnel.

## Live Mac config

```yaml
# ~/.cloudflared/config-yanylevin.yml
tunnel: 15a6dfc9-457c-49c4-80c5-5218924341c9
credentials-file: /Users/yanlevin/.cloudflared/15a6dfc9-457c-49c4-80c5-5218924341c9.json

ingress:
  - hostname: api.yanylevin.com
    service: http://127.0.0.1:3004
  - service: http_status:404
```

Origin cert for this account: `~/.cloudflared/cert.pem.notelms.bak`  
(`TUNNEL_ORIGIN_CERT` when creating/listing tunnels in the NoteLMs account.)

## DNS

| Type | Name | Value | Proxy |
|------|------|--------|-------|
| A | `@` / `www` | Vercel anycast (`64.29.17.x`) | Proxied |
| CNAME | `api` | `15a6dfc9-457c-49c4-80c5-5218924341c9.cfargotunnel.com` | **Proxied** |

Registrar nameservers (Vercel domain): `addyson.ns.cloudflare.com`, `margo.ns.cloudflare.com`.

Do **not** add `api.yanylevin.com` as a Vercel *project domain*.

## Every session (or LaunchAgents)

```bash
cd /Users/yanlevin/github/yanylevin && npm run server
cloudflared tunnel --config ~/.cloudflared/config-yanylevin.yml run
```

## Verify

```bash
curl -sS http://127.0.0.1:3004/health
curl -sS https://api.yanylevin.com/health
```

Expect: `{"ok":true,"service":"yanylevin-server",...}`

## Troubleshooting

- **502** — Tunnel up but nothing on `127.0.0.1:3004`.
- **NXDOMAIN / unresolved** — Nameservers not yet propagated; zone still `initializing` in Cloudflare.
- **Wrong host** — Ingress hostname must be exactly `api.yanylevin.com`.
