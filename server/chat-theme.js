/**
 * Session theme switching for the site chatbot.
 * Theme changes apply ONLY when the model emits an action in its reply
 * ([[set_theme:…]] marker or trailing {"action":"set_theme",…} JSON).
 * No persistence — client applies themeUpdate in-memory only.
 */

/** @typedef {"light"|"dark"|"system"} ThemePreference */

const THEME_MARKER_RE =
  /\[\[\s*set_theme\s*:\s*(light|dark|system)\s*\]\]/gi;

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
 * Extract a JSON object from assistant text (whole string or trailing {...}).
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

  // Prefer the last {...} span (action usually trails the prose).
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
 * Parse [[set_theme:dark]] (last marker wins).
 * @param {string} text
 * @returns {ThemePreference | null}
 */
export function extractThemeMarker(text) {
  let found = null;
  const re = new RegExp(THEME_MARKER_RE.source, "gi");
  let match;
  while ((match = re.exec(String(text || ""))) !== null) {
    found = normalizeTheme(match[1]);
  }
  return found;
}

/**
 * @param {string} text
 */
export function stripThemeMarkers(text) {
  return String(text || "")
    .replace(THEME_MARKER_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
 * Parse theme action from model reply only (marker preferred, JSON accepted).
 * @param {string} rawContent
 * @returns {{ content: string, themeUpdate?: { theme: ThemePreference } }}
 */
export function finalizeChatTheme(rawContent) {
  const cleaned = stripHarmonyTokens(String(rawContent || ""));
  const fromMarker = extractThemeMarker(cleaned);
  const withoutMarkers = stripThemeMarkers(cleaned);
  const parsed = extractTrailingJson(withoutMarkers);
  const fromJson = parseSetThemeAction(parsed);
  const stripped = stripTrailingJsonObject(withoutMarkers);
  const theme = fromMarker || fromJson?.theme || null;

  let content = stripped.trim();
  if (!content) {
    content = theme ? `Site theme set to ${theme}` : "…";
  }

  if (!theme) {
    return { content };
  }
  return {
    content,
    themeUpdate: { theme },
  };
}

/** @deprecated Alias for finalizeChatTheme */
export function applySetThemeAction(rawContent) {
  return finalizeChatTheme(rawContent);
}

/**
 * Format SITE THEME line for the system prompt.
 * @param {Record<string, unknown> | null | undefined} uiContext
 */
export function formatThemeContext(uiContext) {
  const ui = uiContext && typeof uiContext === "object" ? uiContext : {};
  const themePref =
    typeof ui.theme === "string"
      ? ui.theme
      : typeof ui.themePreference === "string"
        ? ui.themePreference
        : null;
  if (themePref !== "light" && themePref !== "dark" && themePref !== "system") {
    return "";
  }
  const resolved =
    typeof ui.resolvedTheme === "string" &&
    (ui.resolvedTheme === "light" || ui.resolvedTheme === "dark")
      ? ui.resolvedTheme
      : null;
  return resolved
    ? `SITE THEME preference: ${themePref} (currently resolving to ${resolved})`
    : `SITE THEME preference: ${themePref}`;
}
