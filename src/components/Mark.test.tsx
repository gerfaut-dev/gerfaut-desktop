import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mark } from "./Mark";

const files = import.meta.glob("../assets/gerfaut-mark*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type Point = [number, number];

/** Points along an outline written with absolute M, L, C and Z only, as
    the brand kit writes it: each cubic sampled, so the overshoot of a
    curve past its end points (the tip of the beak) is counted. */
function outline(d: string): Point[] {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? [];
  const points: Point[] = [];
  let at: Point = [0, 0];
  let i = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M" || command === "L") {
      at = [next(), next()];
      points.push(at);
    } else if (command === "C") {
      const [p0, p1, p2, p3]: Point[] = [at, [next(), next()], [next(), next()], [next(), next()]];
      for (let step = 1; step <= 32; step++) {
        const t = step / 32;
        const u = 1 - t;
        const along = (k: 0 | 1) =>
          u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k];
        points.push([along(0), along(1)]);
      }
      at = p3;
    } else if (command !== "Z") {
      throw new Error(`unexpected path command ${command}`);
    }
  }
  return points;
}

/** The smallest gap, in viewBox units, between the outline and an edge of
    its box. */
function margin(svg: Element): number {
  const [x, y, width, height] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const gaps = [...svg.querySelectorAll("path")].flatMap((path) =>
    outline(path.getAttribute("d") ?? "").flatMap(([px, py]) => [px - x, x + width - px, py - y, y + height - py]),
  );
  // No outline read is no margin measured, not an endless one.
  if (gaps.length === 0) throw new Error("no outline in the mark");
  return Math.min(...gaps);
}

/** A box that hugs the outline is clipped once the browser snaps it to
    device pixels: the tip of the beak came out cut flat. Every mark the
    app draws keeps room around the head. */
describe("the mark", () => {
  it("keeps room between the outline and its box, inline", () => {
    const { container } = render(<Mark />);
    expect(margin(container.querySelector("svg")!)).toBeGreaterThanOrEqual(7);
  });

  it("keeps room between the outline and its box, in every bundled file", () => {
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(2);
    for (const [name, raw] of Object.entries(files)) {
      const svg = new DOMParser().parseFromString(raw, "image/svg+xml").documentElement;
      expect(margin(svg), name).toBeGreaterThanOrEqual(7);
    }
  });
});
