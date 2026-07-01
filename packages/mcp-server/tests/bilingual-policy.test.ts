import { isTechnicalIdentifier } from "../src/policy/bilingual.js";

describe("bilingual policy — technical identifier preservation", () => {
  it("recognises preserved technical identifiers", () => {
    expect(isTechnicalIdentifier("API")).toBe(true);
    expect(isTechnicalIdentifier("rollback")).toBe(true);
    expect(isTechnicalIdentifier("sprint")).toBe(true);
    expect(isTechnicalIdentifier("backlog")).toBe(true);
    expect(isTechnicalIdentifier("QA")).toBe(true);
    expect(isTechnicalIdentifier("CI/CD")).toBe(true);
    expect(isTechnicalIdentifier("milestone")).toBe(true);
    expect(isTechnicalIdentifier("dependency")).toBe(true);
    expect(isTechnicalIdentifier("blocker")).toBe(true);
    expect(isTechnicalIdentifier("RAG")).toBe(true);
  });

  it("does not flag non-technical terms", () => {
    expect(isTechnicalIdentifier("project")).toBe(false);
    expect(isTechnicalIdentifier("delivery")).toBe(false);
    expect(isTechnicalIdentifier("status")).toBe(false);
  });
});
