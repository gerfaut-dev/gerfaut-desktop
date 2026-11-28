import { describe, expect, it } from "vitest";
import { FALSE_PROOF, errorMessage, isKind, plainMessage } from "./ipc";

describe("plainMessage", () => {
  it("gives a command's own message", () => {
    expect(plainMessage({ kind: "sync", message: "The server hung up." })).toBe(
      "The server hung up.",
    );
  });

  it("keeps a false proof in the core's words, unlike errorMessage", () => {
    const error = { kind: "false_proof", message: "Server x failed check y." };
    expect(plainMessage(error)).toBe("Server x failed check y.");
    expect(errorMessage(error)).toBe(FALSE_PROOF);
  });

  it("gives anything else as text", () => {
    expect(plainMessage(new Error("boom"))).toBe("Error: boom");
    expect(plainMessage("refused")).toBe("refused");
  });
});

describe("isKind", () => {
  it("matches a command error of that kind only", () => {
    const error = { kind: "tor", message: "Tor is not running." };
    expect(isKind(error, "tor")).toBe(true);
    expect(isKind(error, "locked")).toBe(false);
  });

  it("never matches what did not come from a command", () => {
    expect(isKind(new Error("tor"), "tor")).toBe(false);
    expect(isKind({ kind: "tor" }, "tor")).toBe(false);
    expect(isKind(null, "tor")).toBe(false);
  });
});
