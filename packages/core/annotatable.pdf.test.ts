import { describe, expect, test } from "bun:test";
import {
  ANNOTATABLE_DOC_REGEX,
  ANNOTATABLE_TARGET_REGEX,
  buildAnnotatableTargetExtensionsHint,
  buildAnnotatableTargetRegex,
  classifyAnnotatableTarget,
  isAnnotatableDocPath,
  isAnnotatablePdfPath,
  isAnnotatableTargetPath,
} from "./annotatable";

describe("PDF annotate target classification", () => {
  test("keeps PDF out of the UTF-8 document path", () => {
    expect(ANNOTATABLE_DOC_REGEX.test("paper.pdf")).toBe(false);
    expect(isAnnotatableDocPath("paper.pdf")).toBe(false);
    expect(isAnnotatablePdfPath("paper.PDF")).toBe(true);
    expect(classifyAnnotatableTarget("paper.pdf")).toBe("pdf");
  });

  test("includes PDF in direct and folder target discovery", () => {
    expect(ANNOTATABLE_TARGET_REGEX.test("paper.pdf")).toBe(true);
    expect(isAnnotatableTargetPath("paper.pdf")).toBe(true);
    expect(buildAnnotatableTargetRegex([".livemd"]).test("notes.livemd")).toBe(true);
    expect(buildAnnotatableTargetRegex([".livemd"]).test("paper.pdf")).toBe(true);
  });

  test("retains existing Markdown and HTML classifications", () => {
    expect(classifyAnnotatableTarget("notes.md")).toBe("markdown");
    expect(classifyAnnotatableTarget("page.html")).toBe("html");
    expect(classifyAnnotatableTarget("secret.env")).toBeNull();
  });

  test("target error hints name PDF without changing document hints", () => {
    expect(buildAnnotatableTargetExtensionsHint()).toEndWith(", .pdf");
  });
});
