/**
 * Session theme switching for the site chatbot (NoteLMs-style trailing JSON action).
 * No persistence — client applies themeUpdate in-memory only.
 */

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
 * @returns {{ theme: "light" | "dark" | "system" } | null}
 */
export function parseSetThemeAction(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  if (parsed.action !== "set_theme") return null;
  const raw =
    typeof parsed.theme === "string"
      ? parsed.theme.trim().toLowerCase()
      : typeof parsed.preference === "string"
        ? parsed.preference.trim().toLowerCase()
        : typeof parsed.mode === "string"
          ? parsed.mode.trim().toLowerCase()
          : "";
  if (raw === "light" || raw === "dark" || raw === "system") {
    return { theme: raw };
  }
  return null;
}

/**
 * Apply chat side-effects from a trailing set_theme JSON action.
 * Does not persist — returns themeUpdate for the client.
 * @param {string} rawContent
 * @returns {{ content: string, themeUpdate?: { theme: "light"|"dark"|"system" } }}
 */
export function applySetThemeAction(rawContent) {
  const raw = String(rawContent || "");
  const parsed = extractTrailingJson(raw);
  const themeAction = parseSetThemeAction(parsed);
  const stripped = stripTrailingJsonObject(raw);
  const baseContent = stripped.trim() || raw.trim() || "…";

  if (!themeAction) {
    return { content: baseContent };
  }

  return {
    content: baseContent,
    themeUpdate: { theme: themeAction.theme },
  };
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
