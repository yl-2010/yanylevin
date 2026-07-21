# AGENTS.md

## Cursor Cloud specific instructions

### Git workflow (IMPORTANT)

Cloud agents MUST **always commit and push changes directly to the `main` branch immediately**, without opening a pull request — unless the user explicitly asks otherwise. Do not create feature branches or PRs by default; push straight to `main`.

This is a **static website** (plain HTML/CSS/JS) for Yan Levin's personal site. There is no build step, no package manager, and no dependencies to install.

### Running the dev server

Serve the folder with Python's built-in HTTP server (see `README.md`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`. `python3` (3.12) is preinstalled, so no setup is required.

### Structure notes

- `index.html`, `styles.css`, `script.js` — the main site.
- `favicon.svg`, `yan-levin.jpg` — assets referenced by the page.
- `1/`, `2/`, `3/`, `4/`, `5/`, `versions/` — standalone alternate/older `index.html` design variants, each viewable at its own path (e.g. `http://localhost:8080/1/`).
- `Illustrator/` — source `.ai` logo art and exports, not used by the running site.

### Lint / test / build

There is no lint config, automated test suite, or build pipeline in this repo. "Testing" means opening the served page in a browser and confirming it renders and the JS interactions (scroll reveals, metric count-up, portrait tilt) work with no console errors.
