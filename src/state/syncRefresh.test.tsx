import { createElement } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { useLock } from "./lock";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletMeta } from "../lib/ipc";
import { useSyncAll } from "./queries";
import { useUi } from "./store";
import { useSyncRefresh } from "./syncRefresh";

const NOW_MS = 1_755_100_000_000;
const MIN_MS = 60_000;

function wallet(id: string, minutesAgo: number | null): WalletMeta {
  return {
    id,
    last_sync:
      minutesAgo === null
        ? null
        : { at: (NOW_MS - minutesAgo * MIN_MS) / 1000, tip_height: 1, backend: "b" },
  } as WalletMeta;
}

let syncs = 0;
let answer: () => Promise<unknown>;

/** The refresh as the app wires it: on the same start of a sync of
    every wallet the sidebar's button uses, which is what is counted. */
function mount(wallets: WalletMeta[], { on = true, reading = false } = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    (props: { on: boolean; reading: boolean }) => {
      const syncAll = useSyncAll();
      useSyncRefresh({
        enabled: props.on,
        network: "signet",
        wallets,
        reading: props.reading,
        syncAll,
      });
      return syncAll;
    },
    { wrapper, initialProps: { on, reading } },
  );
}

/** Lets the answers in flight land. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  });
}

async function wait(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  // The clock's timer and the time; the query library's own timeouts
  // stay real.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(NOW_MS);
  syncs = 0;
  answer = () => Promise.resolve({ reports: [], failures: [] });
  mockIPC((cmd) => {
    if (cmd === "sync_all") {
      syncs += 1;
      return answer();
    }
    throw new Error(`unexpected command ${cmd}`);
  });
  useUi.setState({ syncErrors: {}, syncTurns: {}, syncingAll: null, syncAllEnded: {}, toast: null });
});

afterEach(() => {
  vi.useRealTimers();
  clearMocks();
  delete (document as { visibilityState?: unknown }).visibilityState;
});

describe("the refresh of every wallet", () => {
  it("syncs once the least fresh wallet is ten minutes old, not before", async () => {
    mount([wallet("a", 8), wallet("b", 1)]);
    await settle();
    expect(syncs).toBe(0);
    await wait(MIN_MS);
    expect(syncs).toBe(0);
    await wait(MIN_MS);
    expect(syncs).toBe(1);
  });

  it("syncs at once a wallet that never synced", async () => {
    mount([wallet("a", 1), wallet("b", null)]);
    await settle();
    expect(syncs).toBe(1);
  });

  /** Nobody asked for it: no toast when it ends, and the one on screen
      stays. */
  it("says nothing when it ends", async () => {
    act(() => useUi.getState().showToast("Copied", 60 * MIN_MS));
    mount([wallet("a", 30)]);
    await settle();
    expect(syncs).toBe(1);
    expect(useUi.getState().syncingAll).toBeNull();
    expect(useUi.getState().toast).toBe("Copied");
  });

  /** Ten minutes from the end: a sync that takes longer is not
      followed by another at once, and one that failed is not asked
      again on every look. */
  it("waits ten minutes from the end of the last sync, a long one that failed", async () => {
    let fail: () => void = () => {};
    answer = () =>
      new Promise((_resolve, reject) => {
        fail = () => reject({ kind: "sync", message: "timed out" });
      });
    mount([wallet("a", 30)]);
    await settle();
    expect(syncs).toBe(1);
    await wait(12 * MIN_MS);
    expect(syncs).toBe(1);
    fail();
    await settle();
    await wait(9 * MIN_MS);
    expect(syncs).toBe(1);
    await wait(MIN_MS);
    expect(syncs).toBe(2);
  });

  it("is not held up by a sync of another network", async () => {
    useUi.setState({ syncAllEnded: { testnet4: NOW_MS } });
    mount([wallet("a", 30)]);
    await settle();
    expect(syncs).toBe(1);
  });

  it("counts a sync asked for by hand", async () => {
    const { result, rerender } = mount([wallet("a", 30)], { on: false });
    act(() => result.current("signet"));
    await settle();
    expect(syncs).toBe(1);
    await wait(5 * MIN_MS);
    // The sync left the wallets as they were: the refresh waits out the
    // ten minutes all the same.
    rerender({ on: true, reading: false });
    await settle();
    expect(syncs).toBe(1);
    await wait(5 * MIN_MS);
    expect(syncs).toBe(2);
  });

  /** As "Sync all", off while a wallet of the network syncs: a rescan,
      a wallet's first sync, one the live watch runs. */
  it("lets a sync of one wallet finish, and looks again on the next beat", async () => {
    useUi.setState({ syncTurns: { a: { ticket: 1, running: true } } });
    mount([wallet("a", 30), wallet("b", 30)]);
    await wait(2 * MIN_MS);
    expect(syncs).toBe(0);
    act(() => useUi.setState({ syncTurns: { a: { ticket: 1, running: false } } }));
    await wait(30_000);
    expect(syncs).toBe(1);
  });

  /** Its dates may be from before the sync that just ended. */
  it("waits for the list being read again", async () => {
    const { rerender } = mount([wallet("a", 30)], { reading: true });
    await wait(2 * MIN_MS);
    expect(syncs).toBe(0);
    rerender({ on: true, reading: false });
    await settle();
    expect(syncs).toBe(1);
  });

  it("runs nothing behind the lock, and looks the moment the app opens", async () => {
    const { rerender } = mount([wallet("a", 30)], { on: false });
    await wait(20 * MIN_MS);
    expect(syncs).toBe(0);
    rerender({ on: true, reading: false });
    await settle();
    expect(syncs).toBe(1);
  });

  it("runs nothing once the lock has closed, even before the app has drawn it", async () => {
    mount([wallet("a", 30)], { on: true });
    await settle();
    expect(syncs).toBe(1);
    // The store says locked; the hook has not been told yet.
    useLock.setState({ locked: true });
    try {
      useUi.setState({ syncingAll: null, syncAllEnded: {} });
      await wait(20 * MIN_MS);
      expect(syncs).toBe(1);
    } finally {
      useLock.setState({ locked: false });
    }
  });

  it("runs nothing out of view, and looks the moment the window is back", async () => {
    setVisibility("hidden");
    mount([wallet("a", 30)]);
    await wait(20 * MIN_MS);
    expect(syncs).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    setVisibility("visible");
    await settle();
    expect(syncs).toBe(1);
  });
});
