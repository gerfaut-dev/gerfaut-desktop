import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncStamp } from "../lib/ipc";
import type { WalletSyncStatus } from "../lib/syncState";
import { useUi } from "../state/store";
import { line } from "../test/text";
import { SyncIndicator } from "./SyncIndicator";

const NOW_MS = 1_755_100_000_000;
const MIN = 60;
const IDLE: WalletSyncStatus = { state: "idle" };
const SYNCING: WalletSyncStatus = { state: "syncing", failure: null };

function stamp(secondsAgo: number): SyncStamp {
  return { at: NOW_MS / 1000 - secondsAgo, tip_height: 200_000, backend: "mempool.space" };
}

/** The window as the system reports it, told the way a browser tells. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  useUi.setState({ syncingAll: null });
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  // Back to jsdom's own answer.
  delete (document as { visibilityState?: unknown }).visibilityState;
});

/** The indicator, for its colour, glyph and tooltip. */
function shown(stampOf: SyncStamp | null, sync: WalletSyncStatus): HTMLElement {
  const { container } = render(<SyncIndicator stamp={stampOf} sync={sync} reading={false} />);
  return container.firstElementChild as HTMLElement;
}

describe("SyncIndicator", () => {
  it("dates a recent sync quietly, with its backend", () => {
    const indicator = shown(stamp(2 * MIN), IDLE);
    expect(screen.getByText(line("Synced 2 min ago · mempool.space"))).toBeInTheDocument();
    expect(indicator).toHaveClass("text-muted");
    expect(indicator.querySelector("[data-glyph]")).toBe(null);
  });

  /** Amber behind a clock: the colour never says it alone. */
  it("says a sync of half an hour ago is old", () => {
    const indicator = shown(stamp(45 * MIN), IDLE);
    expect(screen.getByText(line("Synced 45 min ago · mempool.space"))).toBeInTheDocument();
    expect(indicator).toHaveClass("text-pending");
    expect(indicator.querySelector("[data-glyph='clock-alert']")).not.toBe(null);
  });

  it("says a sync that runs before the age of the one before", () => {
    const indicator = shown(stamp(45 * MIN), SYNCING);
    expect(screen.getByText(line("Syncing… last sync 45 min ago"))).toBeInTheDocument();
    expect(indicator).toHaveClass("text-muted");
    expect(indicator.querySelector("[data-glyph]")).toBe(null);
  });

  it("never calls a wallet whose first sync runs never synced", () => {
    shown(null, SYNCING);
    expect(screen.getByText(line("Syncing…"))).toBeInTheDocument();
    expect(screen.queryByText(line("Never synced"))).not.toBeInTheDocument();
  });

  /** A failure does not wait for the date to grow old. */
  it("says a failure at once, behind a fresh date", () => {
    const indicator = shown(stamp(MIN), { state: "failed", message: "timed out" });
    expect(screen.getByText(line("Sync failed · showing data from 1 min ago"))).toBeInTheDocument();
    expect(indicator).toHaveClass("text-pending");
    expect(indicator).toHaveAttribute("title", "timed out");
    expect(indicator.querySelector("[data-glyph='alert-triangle']")).not.toBe(null);
  });

  /** A sync that just ended, its figures not read back yet: no amber
      for the moment the old date is still on screen. */
  it("does not call old a date being read again, or while every wallet syncs", () => {
    const { container, rerender } = render(
      <SyncIndicator stamp={stamp(60 * MIN)} sync={IDLE} reading />,
    );
    const indicator = container.firstElementChild as HTMLElement;
    expect(indicator).toHaveClass("text-muted");
    expect(indicator.querySelector("[data-glyph]")).toBe(null);
    act(() => useUi.setState({ syncingAll: 1 }));
    rerender(<SyncIndicator stamp={stamp(60 * MIN)} sync={IDLE} reading={false} />);
    expect(indicator).toHaveClass("text-muted");
    act(() => useUi.setState({ syncingAll: null }));
    expect(indicator).toHaveClass("text-pending");
  });

  it("says a wallet never synced so", () => {
    shown(null, IDLE);
    expect(screen.getByText(line("Never synced"))).toBeInTheDocument();
  });

  /** A screen reader hears the line when its state changes, not each
      time the clock moves its date; read through, the date is there. */
  it("announces where the sync stands, never the beat of the clock", () => {
    const { container, rerender } = render(<SyncIndicator stamp={stamp(0)} sync={IDLE} reading={false} />);
    const live = container.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toBe("Synced");

    act(() => vi.advanceTimersByTime(60_000));
    const date = screen.getByText(line("Synced 1 min ago · mempool.space"));
    expect(live[0].textContent).toBe("Synced");
    expect(date.closest("[aria-hidden='true']")).toBe(null);

    // The same region, so the new words are read out.
    rerender(<SyncIndicator stamp={stamp(60)} sync={SYNCING} reading={false} />);
    expect(container.querySelector("[aria-live='polite']")).toBe(live[0]);
    expect(live[0].textContent).toBe("Syncing…");
    rerender(<SyncIndicator stamp={stamp(60)} sync={{ state: "failed", message: "timed out" }} reading={false} />);
    expect(container.querySelector("[aria-live='polite']")).toBe(live[0]);
    expect(live[0].textContent).toBe("Sync failed");
  });
});

describe("the time a line is dated by", () => {
  it("moves on by itself while the window is in view", () => {
    shown(stamp(0), IDLE);
    expect(screen.getByText(line("Synced just now · mempool.space"))).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText(line("Synced 1 min ago · mempool.space"))).toBeInTheDocument();
  });

  it("stands still out of view, and catches up the moment it is back", () => {
    shown(stamp(0), IDLE);
    setVisibility("hidden");
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.getByText(line("Synced just now · mempool.space"))).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    setVisibility("visible");
    expect(screen.getByText(line("Synced 5 min ago · mempool.space"))).toBeInTheDocument();
  });

  it("keeps one timer for every line, and none once no line reads it", () => {
    const { unmount } = render(
      <>
        <SyncIndicator stamp={stamp(0)} sync={IDLE} reading={false} />
        <SyncIndicator stamp={stamp(0)} sync={IDLE} reading={false} />
      </>,
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
