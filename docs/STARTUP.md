# Start everything (Mac Studio + yanylevin.com API)

Production site (**https://yanylevin.com**) will call **https://api.yanylevin.com** for the future chatbot. Your Mac exposes the Express API on port **3004** through a dedicated Cloudflare Tunnel.

---

## After a Mac restart

LaunchAgents auto-start the Yan Levin API + tunnel on login. You only need to start **LM Studio** yourself (GUI):

1. Open **LM Studio**.
2. Load **openai/gpt-oss-20b**.
3. **Developer** tab → turn **local server** **ON** (listening on **1234**).

Then check:

```bash
curl -sS http://127.0.0.1:3004/health
curl -sS https://api.yanylevin.com/health
```

### LaunchAgents on this Mac

| Label | What |
|-------|------|
| `com.yanylevin.server` | Yan Levin Express `:3004` (`node --env-file=.env index.js`) |
| `com.yanylevin.cloudflared` | Tunnel → `api.yanylevin.com` |

Plists live in `~/Library/LaunchAgents/`. SocketHR and NoteLMs keep their own pairs; do not merge tunnels.

---

## Manual start (only if LaunchAgents are not installed)

### Terminal 1 — LM Studio (GUI)

1. Open **LM Studio**.
2. Load **openai/gpt-oss-20b**.
3. **Developer** tab → local server **ON** on **1234**.

### Terminal 2 — API

```bash
cd /Users/yanlevin/github/yanylevin
npm run server
```

### Terminal 3 — Tunnel

```bash
cloudflared tunnel --config ~/.cloudflared/config-yanylevin.yml run
```

First-time tunnel setup: [`deploy/cloudflared/README.md`](../deploy/cloudflared/README.md).

---

## Ports (this Mac)

| Port | Service | Public? |
|------|---------|---------|
| 3000 | SocketHR Express | via `api.sockethr.com` |
| 3002 | NoteLMs Express | via `api.notelms.com` |
| 3004 | Yan Levin Express | via `api.yanylevin.com` |
| 1234 | LM Studio | **never** (localhost only) |
