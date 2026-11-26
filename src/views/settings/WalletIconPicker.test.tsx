import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WalletIconId } from "../../lib/ipc";
import { WalletIconPicker } from "./WalletIconPicker";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openPicker(value: WalletIconId = "wallet") {
  const onChoose = vi.fn();
  render(<WalletIconPicker name="Cold storage" value={value} onChoose={onChoose} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Icon" }));
  return { user, onChoose, group: screen.getByRole("radiogroup", { name: "Icon of Cold storage" }) };
}

describe("WalletIconPicker", () => {
  it("offers 32 icons in one radio group, as two named sections", async () => {
    const { group } = await openPicker();
    expect(within(group).getAllByRole("radio")).toHaveLength(32);
    const symbols = within(group).getByRole("group", { name: "Symbols" });
    const devices = within(group).getByRole("group", { name: "Devices" });
    expect(within(symbols).getAllByRole("radio")).toHaveLength(7);
    expect(within(devices).getAllByRole("radio")).toHaveLength(25);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    // Every tile is named, to a screen reader and in its tooltip.
    for (const radio of within(group).getAllByRole("radio")) {
      expect(radio.getAttribute("aria-label")).toBeTruthy();
      expect(radio).toHaveAttribute("title", radio.getAttribute("aria-label"));
    }
  });

  it("moves down and up within a column, from the symbols into the devices", async () => {
    const { user } = await openPicker("piggy_bank");
    expect(screen.getByRole("radio", { name: "Piggy bank" })).toHaveFocus();
    const devices = within(screen.getByRole("group", { name: "Devices" })).getAllByRole("radio");

    // The seventh symbol sits over the seventh device of the first row.
    await user.keyboard("{ArrowDown}");
    expect(devices[6]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(devices[14]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(devices[22]).toHaveFocus();
    // The last row is shorter: Down lands on its last tile.
    await user.keyboard("{ArrowDown}");
    expect(devices[24]).toHaveFocus();
    // Nothing below the last row.
    await user.keyboard("{ArrowDown}");
    expect(devices[24]).toHaveFocus();

    // Back up keeps the column the focus now stands in.
    await user.keyboard("{ArrowUp}");
    expect(devices[16]).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("radio", { name: "Wallet" })).toHaveFocus();
  });

  it("walks the reading order with Left and Right, across the sections", async () => {
    const { user, group } = await openPicker("piggy_bank");
    const radios = within(group).getAllByRole("radio");
    const devices = within(screen.getByRole("group", { name: "Devices" })).getAllByRole("radio");
    await user.keyboard("{ArrowRight}");
    expect(devices[0]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Piggy bank" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(radios[radios.length - 1]).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(radios[0]).toHaveFocus();
    await user.keyboard("{End}{Home}");
    expect(radios[0]).toHaveFocus();
  });

  it("chooses a drawn device with its id, and marks the current one", async () => {
    const { user, onChoose } = await openPicker("piggy_bank");
    await user.keyboard("{ArrowDown}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    const first = within(screen.getByRole("group", { name: "Devices" })).getAllByRole("radio")[0];
    expect(first).toHaveFocus();
    await user.keyboard(" ");
    expect(first).toHaveAccessibleName("Swivel key");
    expect(onChoose.mock.calls).toEqual([["swivel_key"]]);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Icon" })).toHaveFocus();

    // Opened on that icon, the picker marks it and starts there.
    cleanup();
    await openPicker("swivel_key");
    const current = within(screen.getByRole("group", { name: "Devices" })).getAllByRole("radio")[0];
    expect(current).toHaveAttribute("aria-checked", "true");
    expect(current).toHaveFocus();
    expect(current.querySelector("svg")).not.toBeNull();
  });

  it("opens above the action when there is no room below it", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      // The action near the bottom of a 640px high window.
      const top = this.getAttribute("aria-expanded") !== null || this.querySelector("[aria-expanded]") ? 600 : 0;
      return { top, bottom: top + 32, left: 600, right: 700, width: 100, height: 32, x: 600, y: top } as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(362);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(640);
    const { group } = await openPicker();
    expect(group).toHaveClass("bottom-full");
    expect(group).not.toHaveClass("top-full");
    // It fits above: nothing is cut.
    expect(group.style.maxHeight).toBe("");
  });

  it("is cut to the larger side and scrolls when neither side holds it", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      // The action halfway down a 400px high window: 192px below, 172 above.
      const top = this.getAttribute("aria-expanded") !== null || this.querySelector("[aria-expanded]") ? 180 : 0;
      return { top, bottom: top + 32, left: 600, right: 700, width: 100, height: 32, x: 600, y: top } as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(362);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
    const { group } = await openPicker();
    expect(group).toHaveClass("top-full");
    expect(group.style.maxHeight).toBe("180px");
    expect(group).toHaveClass("overflow-y-auto");
  });
});
