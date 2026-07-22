/**
 * Yan Levin site chatbot — liquid-glass pill + response panel.
 * Talks to Mac Studio GPT-OSS via same-origin /api/chat (prod)
 * or local apiBase + /api/visitor-token (dev).
 * Theme preference is session-only (resets to system on refresh).
 */
(() => {
  const root = document.getElementById("yan-chat");
  if (!root) return;

  const pill = root.querySelector(".yan-chat-pill");
  const panel = root.querySelector(".yan-chat-panel");
  const messagesEl = root.querySelector(".yan-chat-messages");
  const form = root.querySelector(".yan-chat-form");
  const input = root.querySelector(".yan-chat-input");
  const launcher = root.querySelector(".yan-chat-launcher");
  const closeBtns = root.querySelectorAll("[data-yan-chat-close]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @type {{role: string, content: string}[]} */
  let history = [];
  let sending = false;
  let configPromise = null;
  let tokenCache = { token: "", expiresAt: 0 };

  /** @typedef {"light"|"dark"|"system"} ThemePreference */
  /** @typedef {"light"|"dark"} ResolvedTheme */

  /** Session-only; never written to localStorage. */
  /** @type {ThemePreference} */
  let themePreference = "system";

  /** @param {unknown} value @returns {value is ThemePreference} */
  function isThemePreference(value) {
    return value === "light" || value === "dark" || value === "system";
  }

  /** @param {ThemePreference} preference @returns {ResolvedTheme} */
  function resolveTheme(preference) {
    if (preference === "dark") return "dark";
    if (preference === "light") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  /** @param {ThemePreference} preference @returns {ResolvedTheme} */
  function applyTheme(preference) {
    if (!isThemePreference(preference)) return resolveTheme(themePreference);
    themePreference = preference;
    const resolved = resolveTheme(preference);
    const html = document.documentElement;
    html.setAttribute("data-theme", preference);
    html.setAttribute("data-resolved-theme", resolved);
    html.style.colorScheme = resolved;
    void html.offsetHeight;
    return resolved;
  }

  function refreshGlass() {
    if (typeof window.reinitLiquidGlass === "function") {
      window.reinitLiquidGlass();
    }
  }

  // Bootstrap already set system; keep JS state in sync.
  applyTheme("system");

  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    if (themePreference !== "system") return;
    applyTheme("system");
    refreshGlass();
  };
  if (typeof schemeQuery.addEventListener === "function") {
    schemeQuery.addEventListener("change", onSchemeChange);
  } else if (typeof schemeQuery.addListener === "function") {
    schemeQuery.addListener(onSchemeChange);
  }

  function state() {
    return root.dataset.state || "closed";
  }

  function setState(next) {
    root.dataset.state = next;
    const open = next !== "closed";
    root.classList.toggle("is-open", open);
    root.classList.toggle("has-panel", next === "panel");
    if (panel) {
      panel.hidden = next !== "panel";
      panel.setAttribute("aria-hidden", next === "panel" ? "false" : "true");
    }
    if (pill) {
      // Clear magnetic hover offset so the spring centers cleanly.
      if (open) {
        pill._mx = 0;
        pill._my = 0;
        pill.style.transform = "";
      }
    }
    if (launcher) {
      launcher.setAttribute("aria-expanded", open ? "true" : "false");
      launcher.tabIndex = open ? -1 : 0;
    }
    if (input) {
      input.tabIndex = open ? 0 : -1;
      if (open) {
        // Wait for spring so focus doesn't fight the transform.
        window.setTimeout(() => input.focus({ preventScroll: true }), reduceMotion ? 0 : 420);
      }
    }
    scheduleGlassRefresh();
  }

  let glassTimer = 0;
  function scheduleGlassRefresh() {
    window.clearTimeout(glassTimer);
    glassTimer = window.setTimeout(() => {
      refreshGlass();
    }, reduceMotion ? 0 : 480);
  }

  async function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = (async () => {
      const host = window.location.hostname;
      const isLocal =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host.endsWith(".local");

      let runtime = { apiBase: "https://api.yanylevin.com", useSameOriginProxy: true };
      try {
        const res = await fetch("/runtime-config.json", { cache: "no-store" });
        if (res.ok) runtime = { ...runtime, ...(await res.json()) };
      } catch {
        /* keep defaults */
      }

      if (isLocal) {
        return {
          apiBase: "http://127.0.0.1:3004",
          useSameOriginProxy: false,
        };
      }
      return {
        apiBase: String(runtime.apiBase || "https://api.yanylevin.com").replace(/\/$/, ""),
        useSameOriginProxy: runtime.useSameOriginProxy !== false,
      };
    })();
    return configPromise;
  }

  async function getBearerToken(apiBase) {
    const now = Date.now();
    if (tokenCache.token && tokenCache.expiresAt > now + 30_000) {
      return tokenCache.token;
    }

    // Prefer same-origin mint on Vercel; fall back to Mac visitor-token.
    const endpoints = [
      "/api/mac-token",
      `${apiBase}/api/visitor-token`,
    ];

    let lastErr = "token unavailable";
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.token) {
          lastErr = data.error || `token ${res.status}`;
          continue;
        }
        const ttlMs = (Number(data.expiresIn) || 600) * 1000;
        tokenCache = { token: data.token, expiresAt: now + ttlMs };
        return data.token;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastErr);
  }

  function appendBubble(role, text) {
    if (!messagesEl) return;
    const el = document.createElement("div");
    el.className = `yan-chat-bubble yan-chat-bubble--${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setBusy(busy) {
    sending = busy;
    root.classList.toggle("is-busy", busy);
    if (input) input.disabled = busy;
    const submit = form?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = busy;
  }

  function showOffline(message) {
    appendBubble("assistant", message);
    if (state() !== "panel") setState("panel");
  }

  function chatBody() {
    return {
      messages: history,
      temperature: 0.4,
      maxTokens: 2048,
      uiContext: {
        theme: themePreference,
        resolvedTheme: resolveTheme(themePreference),
      },
    };
  }

  async function sendMessage(raw) {
    const text = String(raw || "").trim();
    if (!text || sending) return;

    if (state() === "closed") setState("open");
    appendBubble("user", text);
    history.push({ role: "user", content: text });
    if (input) input.value = "";
    setBusy(true);

    try {
      const cfg = await loadConfig();
      let res;

      if (cfg.useSameOriginProxy) {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(chatBody()),
        });
      } else {
        const token = await getBearerToken(cfg.apiBase);
        res = await fetch(`${cfg.apiBase}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(chatBody()),
        });
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 502 || res.status === 503) {
          showOffline(
            "The local AI on Yan’s Mac Studio is offline right now. Please try again later."
          );
        } else if (res.status === 401) {
          showOffline("Could not authorize the chat session. Please reload and try again.");
        } else {
          showOffline(data.error || "Something went wrong. Please try again.");
        }
        // Drop the failed user turn so retries stay clean.
        history.pop();
        return;
      }

      const reply =
        typeof data.content === "string" && data.content.trim()
          ? data.content.trim()
          : "No response was returned.";
      history.push({ role: "assistant", content: reply });
      appendBubble("assistant", reply);

      // Theme changes only when the model emitted an action (server → themeUpdate).
      if (isThemePreference(data.themeUpdate?.theme)) {
        applyTheme(data.themeUpdate.theme);
        refreshGlass();
      }

      setState("panel");
    } catch (err) {
      console.error("[yan-chat]", err);
      history.pop();
      showOffline(
        "Could not reach the chatbot. Check that the Mac API is running, then try again."
      );
    } finally {
      setBusy(false);
      if (input && state() !== "closed") {
        input.focus({ preventScroll: true });
      }
    }
  }

  function openChat() {
    if (state() === "closed") setState(history.length ? "panel" : "open");
  }

  function closeChat() {
    setState("closed");
  }

  launcher?.addEventListener("click", (event) => {
    event.preventDefault();
    openChat();
  });

  closeBtns.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeChat();
    });
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(input?.value);
  });

  // Enter sends; the pill itself is the text field surface.
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input.value);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state() !== "closed") {
      closeChat();
    }
  });

  // Keep glass filters sharp when the viewport resizes while open.
  window.addEventListener(
    "resize",
    (() => {
      let t;
      return () => {
        if (state() === "closed") return;
        clearTimeout(t);
        t = setTimeout(scheduleGlassRefresh, 120);
      };
    })()
  );

  setState("closed");
})();
