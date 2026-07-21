# AGENTS.md

## Cursor Cloud specific instructions

### Git workflow (IMPORTANT)

Cloud agents MUST **always commit and push changes directly to the `main` branch immediately**, without opening a pull request — unless the user explicitly asks otherwise. Do not create feature branches or PRs by default; push straight to `main`.

### Architecture (SocketHR / NoteLMs pattern)

```
Browser
├─ https://yanylevin.com → Cloudflare DNS (proxied) → Vercel (static site)
└─ https://api.yanylevin.com → Cloudflare Tunnel (own process, NoteLMs CF account)
     └─ http://127.0.0.1:3004 → Express (server/)
          └─ LM Studio → http://127.0.0.1:1234/v1 (openai/gpt-oss-20b)
```

Zone + tunnel live in the **NoteLMs Cloudflare account** (NS addyson/margo), separate from SocketHR (`api.sockethr.com` → `:3000`, NS gerardo/tia). Do not merge tunnels.

### Commands

| Script | Purpose |
|--------|---------|
| `npm run server` | Start Mac Express API (port 3004) |
| `npm run server:dev` | Watch mode |
| `npm run verify:public-api` | `curl https://api.yanylevin.com/health` |
| `python3 -m http.server 8080` | Static site local preview |

### Hard rules

- Do **not** expose LM Studio publicly (localhost only; never Cloudflare Tunnel).
- Yan Levin, SocketHR, and NoteLMs each own a Cloudflare Tunnel (three `cloudflared` processes on the Mac).
- Never commit `server/.env` or auth secrets.
- Auth secret in `server/.env` must match Vercel `NEXTAUTH_SECRET` once Auth.js JWT bridge is added.

### Key docs

- [`docs/STARTUP.md`](docs/STARTUP.md)
- [`docs/LOCAL_BACKEND.md`](docs/LOCAL_BACKEND.md)
- [`docs/PUBLIC_TUNNEL.md`](docs/PUBLIC_TUNNEL.md)
- [`deploy/cloudflared/README.md`](deploy/cloudflared/README.md)
- [`agent-plans/CHATBOT_FRONTEND_PLAN.html`](agent-plans/CHATBOT_FRONTEND_PLAN.html) — handoff for chatbot UI (auth, API, yan.md, design)

### Frontend note

The marketing site is still static HTML/CSS/JS (`index.html`, etc.). The Express API is ready; see the chatbot frontend plan before wiring UI.
