import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullNameTooltip } from "./FullNameTooltip";

const NAME = "Family savings, the long-term multisig vault";

/** A row whose name is drawn `width` pixels wide in a 180-pixel slot. */
function mount(width: number) {
  render(
    <FullNameTooltip name={NAME}>
      <button type="button">
        <span data-full-name>{NAME}</span>
      </button>
    </FullNameTooltip>,
  );
  const text = document.querySelector<HTMLElement>("[data-full-name]")!;
  Object.defineProperty(text, "scrollWidth", { configurable: true, value: width });
  Object.defineProperty(text, "clientWidth", { configurable: true, value: 180 });
  return screen.getByRole("button");
}

/** jsdom has no hover nor focus-visible state: the test says which holds. */
function pseudo(state: { hover?: boolean; focusVisible?: boolean }) {
  const original = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector) {
    if (selector === ":hover") return state.hover ?? false;
    if (selector === ":focus-visible") return state.focusVisible ?? false;
    return original.call(this, selector);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("FullNameTooltip", () => {
  it("shows the whole name of a cut row to keyboard focus", async () => {
    const row = mount(320);
    pseudo({ focusVisible: true });
    act(() => row.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(NAME);
  });

  it("shows nothing when the name fits", () => {
    const row = mount(150);
    pseudo({ focusVisible: true });
    act(() => row.focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows nothing for focus the code put on a cut row", () => {
    // A menu opened by a click focuses its current item: no tooltip.
    const row = mount(320);
    pseudo({ focusVisible: false, hover: false });
    act(() => row.focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
