/**
 * Session theme switching for the site chatbot.
 * Primary path: detect intent from the user message (deterministic).
 * Optional bonus: trailing set_theme JSON from the model.
 * No persistence — client applies themeUpdate in-memory only.
 */

/** @typedef {"light"|"dark"|"system"} ThemePreference */

/**
 * @param {unknown} raw
 * @returns {ThemePreference | null}
 */
function normalizeTheme(raw) {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (t === "light" || t === "dark" || t === "system") return t;
  return null;
}

/**
 * Strip gpt-oss / Harmony control tokens from model text.
 * @param {string} text
 */
export function stripHarmonyTokens(text) {
  let s = String(text || "").replace(/<\|[^|>]{1,120}\|>/g, "");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  // Bare channel/constraint labels left after token removal (no real prose).
  if (
    /^(?:final|analysis|commentary|json|message)(?:\s+(?:final|analysis|commentary|json|message))*$/i.test(
      s
    )
  ) {
    return "";
  }
  return s;
}

/**
 * Extract a JSON object from assistant text (whole string or first {...} span).
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
export function extractTrailingJson(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    /* fall through */
  }

  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```\s*$/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      /* fall through */
    }
  }

  const start = trimmed.lastIndexOf("{");
  if (start < 0) return null;
  const candidate = trimmed.slice(start).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Strip a trailing JSON object from assistant prose (fenced or bare).
 * @param {string} text
 */
export function stripTrailingJsonObject(text) {
  const raw = String(text || "");
  let next = raw.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```\s*$/i, "");
  if (next !== raw) return next.trimEnd();

  const start = raw.lastIndexOf("{");
  if (start < 0) return raw.trimEnd();
  const candidate = raw.slice(start).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return raw.slice(0, start).trimEnd();
    }
  } catch {
    /* keep original */
  }
  return raw.trimEnd();
}

/**
 * Parse a set_theme action from model JSON.
 * @param {unknown} parsed
 * @returns {{ theme: ThemePreference } | null}
 */
export function parseSetThemeAction(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  if (parsed.action !== "set_theme") return null;
  const raw =
    typeof parsed.theme === "string"
      ? parsed.theme
      : typeof parsed.preference === "string"
        ? parsed.preference
        : typeof parsed.mode === "string"
          ? parsed.mode
          : "";
  const theme = normalizeTheme(raw);
  return theme ? { theme } : null;
}

/**
 * Explicit theme request in user text (e.g. "make it dark", "theme: light").
 * @param {string} text
 * @returns {ThemePreference | null}
 */
export function extractExplicitTheme(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  const exact = t.match(/^(?:theme\s*[:=]\s*)?(light|dark|system)$/i);
  if (exact) return normalizeTheme(exact[1]);

  const patterns = [
    /\b(?:switch|set|change|make|use|enable|apply)\b[\s\S]{0,48}\b(?:to\s+)?(light|dark|system)(?:\s+(?:theme|mode))?\b/i,
    /\b(?:theme|mode)\b[\s\S]{0,24}\b(light|dark|system)\b/i,
    /\b(light|dark|system)\s+(?:theme|mode)\b/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) return normalizeTheme(match[1]);
  }
  return null;
}

/**
 * Theme the assistant already committed to (for "do it" / "go ahead").
 * @param {string} text
 * @returns {ThemePreference | null}
 */
export function extractThemeFromAssistantCommitment(text) {
  const t = String(text || "");
  const patterns = [
    /\b(?:set|setting|change|changing|switch|switching|use|using|apply|applying)\b[\s\S]{0,48}\b(?:theme\s+)?(?:to\s+)?(light|dark|system)\b/i,
    /\btheme\s+to\s+(light|dark|system)\b/i,
    /\b(?:to|the)\s+(light|dark|system)\s+theme\b/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) return normalizeTheme(match[1]);
  }
  return null;
}

function isChooseRequest(text) {
  return /\b(you\s+choose|your\s+choice|pick\s+(one|for\s+me)|choose\s+for\s+me|surprise\s+me|whatever\s+you\s+(want|prefer)|up\s+to\s+you)\b/i.test(
    String(text || "")
  );
}

function isConfirmRequest(text) {
  return /^(do\s+it|go\s+ahead|yes|yep|yeah|please\s+do|confirm|ok|okay|sure)[.!]?\s*$/i.test(
    String(text || "").trim()
  );
}

function recentThemeConversation(messages) {
  return messages.slice(-8).some((m) => {
    const c = typeof m?.content === "string" ? m.content : "";
    return /\btheme\b|\blight\b|\bdark\b|\bsystem\b/i.test(c);
  });
}

/**
 * Detect theme change from the latest user turn (+ short prior context).
 * This is the primary path — do not rely on the model emitting JSON.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {ThemePreference | null}
 */
export function detectThemeIntent(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;

  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user" && typeof messages[i].content === "string") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return null;

  const userText = messages[lastUserIdx].content;
  const explicit = extractExplicitTheme(userText);
  if (explicit) return explicit;

  let prevAssistant = "";
  for (let i = lastUserIdx - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant" && typeof messages[i].content === "string") {
      prevAssistant = messages[i].content;
      break;
    }
  }

  if (isConfirmRequest(userText) && prevAssistant) {
    const committed = extractThemeFromAssistantCommitment(prevAssistant);
    if (committed) return committed;
  }

  if (
    isChooseRequest(userText) &&
    (recentThemeConversation(messages) ||
      /\b(light|dark|system|theme)\b/i.test(prevAssistant))
  ) {
    return "dark";
  }

  return null;
}

/**
 * Clean model text and resolve themeUpdate (user intent wins over model JSON).
 * @param {object} opts
 * @param {string} opts.rawContent
 * @param {ThemePreference | null | undefined} [opts.themeFromUser]
 * @returns {{ content: string, themeUpdate?: { theme: ThemePreference } }}
 */
export function finalizeChatTheme({ rawContent, themeFromUser = null }) {
  const cleaned = stripHarmonyTokens(String(rawContent || ""));
  const parsed = extractTrailingJson(cleaned);
  const fromModel = parseSetThemeAction(parsed);
  const stripped = stripTrailingJsonObject(cleaned);
  const theme = normalizeTheme(themeFromUser) || fromModel?.theme || null;

  let content = stripped.trim();
  if (!content && theme) {
    content = `Site theme set to ${theme}`;
  }
  if (!content) {
    content = String(rawContent || "").trim() || "…";
  }

  if (!theme) {
    return { content };
  }
  return {
    content,
    themeUpdate: { theme },
  };
}

/**
 * @deprecated Prefer finalizeChatTheme — kept for callers that only have model text.
 * @param {string} rawContent
 */
export function applySetThemeAction(rawContent) {
  return finalizeChatTheme({ rawContent, themeFromUser: null });
}

/**
 * Format SITE THEME lines for the system prompt.
 * @param {Record<string, unknown> | null | undefined} uiContext
 */
export function formatThemeContext(uiContext) {
  const ui = uiContext && typeof uiContext === "object" ? uiContext : {};
  const lines = [];

  const applied = normalizeTheme(ui.themeApplied);
  if (applied) {
    lines.push(
      `THEME UPDATE APPLIED: ${applied} — briefly confirm; the site applies the change itself`
    );
  }

  const themePref =
    typeof ui.theme === "string"
      ? ui.theme
      : typeof ui.themePreference === "string"
        ? ui.themePreference
        : null;
  if (themePref === "light" || themePref === "dark" || themePref === "system") {
    const resolved =
      typeof ui.resolvedTheme === "string" &&
      (ui.resolvedTheme === "light" || ui.resolvedTheme === "dark")
        ? ui.resolvedTheme
        : null;
    lines.push(
      resolved
        ? `SITE THEME preference: ${themePref} (currently resolving to ${resolved})`
        : `SITE THEME preference: ${themePref}`
    );
  }

  return lines.join("\n");
}
