import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractThemeMarker,
  finalizeChatTheme,
  stripHarmonyTokens,
} from "./chat-theme.js";

describe("extractThemeMarker", () => {
  it("parses [[set_theme:…]] markers", () => {
    assert.equal(extractThemeMarker("Done.\n[[set_theme:dark]]"), "dark");
    assert.equal(extractThemeMarker("[[set_theme: light ]]"), "light");
    assert.equal(extractThemeMarker("no marker here"), null);
  });
});

describe("finalizeChatTheme (LLM action only)", () => {
  it("applies theme from marker and hides it from content", () => {
    const result = finalizeChatTheme("Theme set to dark\n[[set_theme:dark]]");
    assert.deepEqual(result.themeUpdate, { theme: "dark" });
    assert.equal(result.content, "Theme set to dark");
    assert.doesNotMatch(result.content, /\[\[/);
  });

  it("applies theme from trailing JSON", () => {
    const result = finalizeChatTheme(
      'Changing to light.\n{"action":"set_theme","theme":"light"}'
    );
    assert.deepEqual(result.themeUpdate, { theme: "light" });
    assert.equal(result.content, "Changing to light.");
  });

  it("does not invent a theme from prose alone", () => {
    const result = finalizeChatTheme("Theme change applied as requested");
    assert.equal(result.themeUpdate, undefined);
    assert.equal(result.content, "Theme change applied as requested");
  });

  it("strips harmony scaffolding and still reads a marker", () => {
    const result = finalizeChatTheme(
      "<|channel|>final<|message|>Done\n[[set_theme:system]]"
    );
    assert.deepEqual(result.themeUpdate, { theme: "system" });
    assert.match(result.content, /Done/i);
  });

  it("harmony-only junk yields no themeUpdate", () => {
    const result = finalizeChatTheme(
      "<|channel|>final <|constrain|>json<|message|>"
    );
    assert.equal(result.themeUpdate, undefined);
  });

  it("marker wins over conflicting JSON", () => {
    const result = finalizeChatTheme(
      '[[set_theme:dark]]\n{"action":"set_theme","theme":"light"}'
    );
    assert.deepEqual(result.themeUpdate, { theme: "dark" });
  });
});

describe("stripHarmonyTokens", () => {
  it("strips harmony scaffolding to empty", () => {
    assert.equal(
      stripHarmonyTokens("<|channel|>final <|constrain|>json<|message|>"),
      ""
    );
  });
});
