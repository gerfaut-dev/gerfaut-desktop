import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FadeInPlace } from "./FadeInPlace";

afterEach(cleanup);

describe("FadeInPlace", () => {
  it("cuts to what it shows first", () => {
    render(
      <FadeInPlace state="read">
        <p>Content</p>
      </FadeInPlace>,
    );
    expect(screen.getByText("Content").parentElement).not.toHaveClass("animate-swap");
  });

  it("fades each later state in where the last stood", () => {
    const { rerender } = render(
      <FadeInPlace state="loading">
        <p>Loading…</p>
      </FadeInPlace>,
    );
    rerender(
      <FadeInPlace state="read">
        <p>Content</p>
      </FadeInPlace>,
    );
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.getByText("Content").parentElement).toHaveClass("animate-swap");
  });
});
