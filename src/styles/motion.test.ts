import { describe, expect, it } from "vitest";

// Every duration, curve and distance of the interface lives in
// tokens.css; a screen names a token. A literal written anywhere else
// drifts from the rest the day the tokens change.
const SOURCES = import.meta.glob<string>(
  ["../**/*.{ts,tsx,css}", "!../**/*.test.*", "!../test/**", "!./tokens.css"],
  { query: "?raw", import: "default", eager: true },
);

const LITERALS: Array<[string, RegExp]> = [
  ["numeric duration class", /\bduration-\d/],
  ["arbitrary easing class", /\bease-\[/],
  ["cubic-bezier curve", /cubic-bezier\(/],
  ["millisecond literal", /\d+ms\b/],
  ["browser easing class", /(?<![\w-])ease-(?:in-out|in|out)(?![\w-])/],
];

describe("motion tokens", () => {
  it("reads every source of the app", () => {
    // A glob that silently matched nothing would pass the test below.
    expect(Object.keys(SOURCES)).toContain("../App.tsx");
    expect(Object.keys(SOURCES)).toContain("../components/ui/dialog.tsx");
    expect(Object.keys(SOURCES)).not.toContain("./tokens.css");
  });

  it("leaves no duration or curve literal outside tokens.css", () => {
    const found: string[] = [];
    for (const [name, text] of Object.entries(SOURCES)) {
      text.split("\n").forEach((line, i) => {
        for (const [what, pattern] of LITERALS) {
          if (pattern.test(line)) found.push(`${name}:${i + 1} ${what}: ${line.trim()}`);
        }
      });
    }
    expect(found).toEqual([]);
  });
});
