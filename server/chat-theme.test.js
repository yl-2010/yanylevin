import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectThemeIntent,
  extractExplicitTheme,
  finalizeChatTheme,
  stripHarmonyTokens,
} from "./chat-theme.js";

describe("extractExplicitTheme", () => {
  it("parses common theme commands", () => {
    assert.equal(extractExplicitTheme("make it dark"), "dark");
    assert.equal(extractExplicitTheme("Please switch the site theme to light."), "light");
    assert.equal(extractExplicitTheme("set theme to system"), "system");
    assert.equal(extractExplicitTheme("dark"), "dark");
    assert.equal(extractExplicitTheme("theme: light"), "light");
  });

  it("ignores unrelated text", () => {
    assert.equal(extractExplicitTheme("what else can you do"), null);
    assert.equal(extractExplicitTheme("who are you"), null);
  });
});

describe("detectThemeIntent", () => {
  it("uses explicit user commands", () => {
    assert.equal(
      detectThemeIntent([{ role: "user", content: "make it light" }]),
      "light"
    );
  });

  it("resolves you choose in a theme conversation", () => {
    assert.equal(
      detectThemeIntent([
        {
          role: "assistant",
          content:
            "I can confirm a theme change if you let me know which one—light, dark, or system.",
        },
        { role: "user", content: "you choose" },
      ]),
      "dark"
    );
  });

  it("resolves do it after an assistant commitment", () => {
    assert.equal(
      detectThemeIntent([
        { role: "assistant", content: "I will set the theme to dark." },
        { role: "user", content: "do it" },
      ]),
      "dark"
    );
  });

  it("does not invent a theme for unrelated confirms", () => {
    assert.equal(
      detectThemeIntent([
        { role: "assistant", content: "Yan is 16" },
        { role: "user", content: "do it" },
      ]),
      null
    );
  });
});

describe("stripHarmonyTokens / finalizeChatTheme", () => {
  it("strips harmony scaffolding to empty", () => {
    assert.equal(
      stripHarmonyTokens("<|channel|>final <|constrain|>json<|message|>"),
      ""
    );
  });

  it("applies user theme even when model emits junk", () => {
    const result = finalizeChatTheme({
      rawContent: "<|channel|>final <|constrain|>json<|message|>",
      themeFromUser: "dark",
    });
    assert.deepEqual(result.themeUpdate, { theme: "dark" });
    assert.match(result.content, /dark/i);
    assert.doesNotMatch(result.content, /<\|/);
  });

  it("still accepts trailing model JSON as a bonus", () => {
    const result = finalizeChatTheme({
      rawContent: 'Done.\n{"action":"set_theme","theme":"light"}',
      themeFromUser: null,
    });
    assert.deepEqual(result.themeUpdate, { theme: "light" });
    assert.equal(result.content, "Done.");
  });

  it("lets user intent win over model JSON", () => {
    const result = finalizeChatTheme({
      rawContent: '{"action":"set_theme","theme":"light"}',
      themeFromUser: "system",
    });
    assert.deepEqual(result.themeUpdate, { theme: "system" });
  });
});
