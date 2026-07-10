import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  failSkillOutput,
  normalizeText,
  skillInputObject,
  stringArrayFrom,
  textFrom,
  textItemsFrom,
} from "../src/index.js";

function envelope(input: SkillInputEnvelope["input"]): SkillInputEnvelope {
  return { skillId: "summarizeStatus", context: { locale: "en", now: "t0" }, input };
}

describe("skills helpers", () => {
  it("normalizeText trims, lowercases, and collapses whitespace", () => {
    expect(normalizeText("  Fix   THE\tflow ")).toBe("fix the flow");
  });

  it("textFrom ignores non-strings and empty strings", () => {
    expect(textFrom("  hello ")).toBe("hello");
    expect(textFrom("   ")).toBeUndefined();
    expect(textFrom(42)).toBeUndefined();
    expect(textFrom(undefined)).toBeUndefined();
  });

  it("stringArrayFrom filters invalid entries", () => {
    expect(stringArrayFrom(["a", "", 3, " b "])).toEqual(["a", "b"]);
    expect(stringArrayFrom("not-array")).toEqual([]);
  });

  it("textItemsFrom filters invalid items and preserves order", () => {
    const items = textItemsFrom([
      { id: "1", title: "One", body: "b", tags: ["x", 2] },
      { id: "", title: "missing id" },
      "junk",
      { id: "2", title: "Two", status: "open" },
    ]);
    expect(items).toEqual([
      { id: "1", title: "One", body: "b", tags: ["x"] },
      { id: "2", title: "Two", status: "open" },
    ]);
  });

  it("skillInputObject parses supported fields", () => {
    const parsed = skillInputObject(
      envelope({
        title: "T",
        summary: "S",
        notes: ["n1"],
        items: [{ id: "1", title: "One" }],
        context: { extra: true },
      }),
    );
    expect(parsed).toEqual({
      title: "T",
      summary: "S",
      notes: ["n1"],
      items: [{ id: "1", title: "One" }],
      context: { extra: true },
    });
    expect(skillInputObject(envelope("nope"))).toBeNull();
  });

  it("failSkillOutput emits ok false with a matching warning", () => {
    const failure = failSkillOutput("extractRisks", "OMP-S-5003", "bad input");
    expect(failure).toEqual({
      skillId: "extractRisks",
      ok: false,
      output: { code: "OMP-S-5003", message: "bad input" },
      warnings: [{ code: "OMP-S-5003", message: "bad input" }],
    });
  });
});
