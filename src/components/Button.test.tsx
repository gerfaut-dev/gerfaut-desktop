import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button, Disclosure } from "./Button";

describe("Button", () => {
  it("fills every role", () => {
    render(
      <>
        <Button variant="primary">Test the connection</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="danger">Remove wallet</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Test the connection" })).toHaveClass(
      "bg-primary",
      "text-on-primary",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("bg-sunken");
    expect(screen.getByRole("button", { name: "Remove wallet" })).toHaveClass(
      "bg-alert",
      "text-on-alert",
    );
  });

  it("ignores clicks while busy, keeps its focus and its colour", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" icon={Bell} busy onClick={onClick}>
        Connecting…
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Connecting…" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveClass("opacity-50");
    // The spinner in the icon's slot, not beside it: the icon, faded
    // out, shares its cell.
    const [icon, spinner] = button.querySelectorAll("svg");
    expect(button.querySelectorAll("svg")).toHaveLength(2);
    expect(icon).toHaveClass("opacity-0", "col-start-1", "row-start-1");
    expect(spinner).not.toHaveClass("opacity-0");
    expect(spinner).toHaveClass("col-start-1", "row-start-1");
    button.focus();
    await userEvent.click(button);
    await userEvent.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it("fades its busy words in over its label, both laid out, one read", () => {
    const { rerender } = render(
      <Button variant="primary" busy={false} busyLabel="Adding…">
        Add wallet
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Add wallet" });
    const label = screen.getByText("Add wallet");
    const busyWords = screen.getByText("Adding…");
    // Both hold their room in one cell, so the button is as wide as the
    // longer one in either state; the one not shown is transparent and
    // silent.
    expect(button).toContainElement(busyWords);
    expect(busyWords.parentElement).toBe(label.parentElement);
    expect(busyWords).toHaveClass("row-start-1", "col-start-2", "opacity-0", "transition-opacity");
    expect(busyWords).toHaveAttribute("aria-hidden", "true");
    expect(label).toHaveClass("row-start-1", "transition-opacity");
    expect(label).not.toHaveClass("opacity-0");

    rerender(
      <Button variant="primary" busy busyLabel="Adding…">
        Add wallet
      </Button>,
    );
    expect(button).toHaveAccessibleName("Adding…");
    expect(screen.getByText("Add wallet")).toBe(label);
    expect(label).toHaveClass("opacity-0");
    expect(label).toHaveAttribute("aria-hidden", "true");
    expect(busyWords).not.toHaveClass("opacity-0");
    expect(busyWords).not.toHaveAttribute("aria-hidden");
    // A fade, not a motion: reduced motion keeps it, so nothing here is
    // written `motion-safe:`.
    expect(busyWords.className).not.toMatch(/motion-safe/);
  });

  it("keeps a label with no busy words of its own still while the glyph swaps", () => {
    render(
      <Button variant="secondary" icon={Bell} busy>
        New address
      </Button>,
    );
    const label = screen.getByText("New address");
    expect(label).not.toHaveClass("opacity-0");
    expect(label).not.toHaveAttribute("aria-hidden");
    expect(screen.getByRole("button", { name: "New address" })).toBeInTheDocument();
  });

  it("switches a busy submit off, so Enter in its form cannot send it again", async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <input aria-label="PIN" />
        <Button variant="primary" type="submit" busy>
          Unlocking…
        </Button>
      </form>,
    );
    expect(screen.getByRole("button", { name: "Unlocking…" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("goes hollow when disabled, with no hover", () => {
    render(
      <Button variant="primary" disabled>
        Save backend
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save backend" });
    expect(button).toBeDisabled();
    // No fade: half a button wrote white on a pale fill, at 2:1.
    expect(button.className).not.toMatch(/opacity/);
    expect(button).toHaveClass("off:bg-transparent", "off:text-muted");
    // Hover only lives under `live:`, which a disabled button is not.
    expect(button.className).not.toMatch(/(^| )hover:/);
  });
});

describe("Disclosure", () => {
  it("says whether its part is open", async () => {
    const onClick = vi.fn();
    render(
      <Disclosure open={false} onClick={onClick}>
        Advanced
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: "Advanced" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
