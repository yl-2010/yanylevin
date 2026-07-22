import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCompactAboutYan,
  extractField,
  parseMarkdownSections,
  retrieveYanSections,
  tokenizeQuery,
} from "./yan-retrieve.js";
import { buildYanSystemPrompt } from "./yan-kb.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const yanMd = readFileSync(join(ROOT, "data", "yan.md"), "utf8");

describe("yan-retrieve", () => {
  it("parses ## sections from yan.md", () => {
    const sections = parseMarkdownSections(yanMd);
    assert.ok(sections.length >= 8);
    assert.ok(sections.some((s) => s.title === "Identity & contact"));
    assert.ok(sections.some((s) => s.title === "Building / startups"));
  });

  it("extracts Age without footnote clutter", () => {
    const age = extractField(yanMd, "Age");
    assert.ok(age);
    assert.match(age, /^\d+$/);
  });

  it("retrieves SocketHR-related sections for a startup query", () => {
    const hits = retrieveYanSections(yanMd, "What is SocketHR?");
    assert.ok(hits.length >= 1);
    const blob = hits.map((h) => `${h.title}\n${h.body}`).join("\n").toLowerCase();
    assert.ok(blob.includes("sockethr"));
  });

  it("builds a compact about block much smaller than yan.md", () => {
    const about = buildCompactAboutYan(yanMd);
    assert.ok(about.includes("ABOUT YAN"));
    assert.ok(about.length < 2_000);
    assert.ok(yanMd.length > 10_000);
  });

  it("tokenizes queries", () => {
    assert.deepEqual(tokenizeQuery("GPA & SAT?"), ["gpa", "sat"]);
  });
});

describe("buildYanSystemPrompt", () => {
  it("keeps the always-on prompt far smaller than stuffing full yan.md", () => {
    const prompt = buildYanSystemPrompt(
      { theme: "system", resolvedTheme: "dark" },
      { query: "What is Yan GPA?" }
    );
    assert.ok(prompt.includes("SITE ABILITIES"));
    assert.ok(prompt.includes("[[set_theme:"));
    assert.ok(prompt.includes("ABOUT YAN"));
    assert.ok(prompt.includes("RETRIEVED KNOWLEDGE"));
    assert.ok(!prompt.includes("--- KNOWLEDGE BASE (yan.md) ---"));
    // Should be well under the full dossier size.
    assert.ok(prompt.length < yanMd.length * 0.75);
  });

  it("surfaces theme ability instructions and current SITE THEME", () => {
    const prompt = buildYanSystemPrompt(
      { theme: "light", resolvedTheme: "light" },
      { query: "make it dark mode" }
    );
    assert.ok(prompt.includes("[[set_theme:"));
    assert.ok(prompt.includes("SITE THEME preference: light"));
    assert.ok(!prompt.includes("THEME UPDATE APPLIED"));
  });
});
