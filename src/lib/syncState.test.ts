import { describe, expect, it } from "vitest";
import {
  SYNC_REFRESH_EVERY_MS,
  failureOf,
  freshnessOf,
  leastFresh,
  syncIsStale,
  syncRefreshDue,
  syncStep,
  walletSyncOf,
} from "./syncState";
import type { SyncStamp } from "./ipc";
import type { SyncPhase, SyncSlice, SyncStep } from "./syncState";

const EMPTY: SyncSlice = { syncErrors: {}, syncTurns: {}, syncingAll: null, syncAllEnded: {} };

function run(...steps: SyncStep[]): SyncSlice {
  return steps.reduce(syncStep, EMPTY);
}

describe("the sync state of a wallet", () => {
  it("is syncing from the start of a sync this window runs, then where it ended", () => {
    const started = run({ type: "started", walletId: "a", ticket: 1 });
    expect(walletSyncOf(started, "a")).toEqual({ state: "syncing", failure: null });
    expect(walletSyncOf(started, "b")).toEqual({ state: "idle" });
    const failed = syncStep(started, { type: "finished", walletId: "a", ticket: 1, failure: "timed out" });
    expect(walletSyncOf(failed, "a")).toEqual({ state: "failed", message: "timed out" });
  });

  it("keeps the last failure said while a new sync runs, and drops it on a good one", () => {
    const again = run(
      { type: "started", walletId: "a", ticket: 1 },
      { type: "finished", walletId: "a", ticket: 1, failure: "timed out" },
      { type: "started", walletId: "a", ticket: 2 },
    );
    const status = walletSyncOf(again, "a");
    expect(status).toEqual({ state: "syncing", failure: "timed out" });
    expect(failureOf(status)).toBe("timed out");
    const good = syncStep(again, { type: "finished", walletId: "a", ticket: 2, failure: null });
    expect(walletSyncOf(good, "a")).toEqual({ state: "idle" });
  });

  it("drops the answer of a sync the core said more of", () => {
    const told = run(
      { type: "started", walletId: "a", ticket: 1 },
      { type: "told", walletId: "a", ticket: 2, state: { state: "syncing" } },
      { type: "told", walletId: "a", ticket: 3, state: { state: "failed", message: "refused", kind: "sync", at: 1 } },
      // The window's own answer comes after the core's last word.
      { type: "finished", walletId: "a", ticket: 1, failure: null },
    );
    expect(walletSyncOf(told, "a")).toEqual({ state: "failed", message: "refused" });
  });

  it("drops the answer of a sync started again since", () => {
    const again = run(
      { type: "started", walletId: "a", ticket: 1 },
      { type: "started", walletId: "a", ticket: 2 },
      { type: "finished", walletId: "a", ticket: 1, failure: "stale" },
    );
    expect(walletSyncOf(again, "a")).toEqual({ state: "syncing", failure: null });
  });

  it("takes what the live watch said only while no sync of the wallet runs", () => {
    const heard = run(
      { type: "heard", walletId: "a", failure: "timed out" },
      { type: "told", walletId: "a", ticket: 1, state: { state: "syncing" } },
      // Late, from another channel: the sync that runs is not over.
      { type: "heard", walletId: "a", failure: null },
    );
    expect(walletSyncOf(heard, "a")).toEqual({ state: "syncing", failure: "timed out" });
    const after = syncStep(
      syncStep(heard, { type: "told", walletId: "a", ticket: 2, state: { state: "idle" } }),
      { type: "heard", walletId: "a", failure: "refused" },
    );
    expect(walletSyncOf(after, "a")).toEqual({ state: "failed", message: "refused" });
  });

  it("says a false proof in the app's words, as for a failed call", () => {
    const told = run({
      type: "told",
      walletId: "a",
      ticket: 1,
      state: { state: "failed", message: "the server sent a false proof", kind: "false_proof", at: 1 },
    });
    expect(failureOf(walletSyncOf(told, "a"))).not.toBe("the server sent a false proof");
  });

  it("takes the core's list only where nothing newer was said", () => {
    const listed = run(
      { type: "told", walletId: "a", ticket: 5, state: { state: "syncing" } },
      {
        type: "listed",
        ticket: 4,
        states: {
          a: { state: "idle" },
          b: { state: "failed", message: "kept from before", kind: "sync", at: 1 },
        },
      },
    );
    expect(walletSyncOf(listed, "a")).toEqual({ state: "syncing", failure: null });
    expect(walletSyncOf(listed, "b")).toEqual({ state: "failed", message: "kept from before" });
  });

  it("takes a sync of every wallet wallet by wallet, except where the core said more", () => {
    const all = run(
      { type: "allStarted", ticket: 1 },
      { type: "told", walletId: "b", ticket: 2, state: { state: "syncing" } },
      { type: "told", walletId: "b", ticket: 3, state: { state: "idle" } },
      { type: "allFinished", ticket: 1, network: "signet", at: 0, outcomes: { a: "timed out", b: "stale" } },
    );
    expect(all.syncingAll).toBeNull();
    expect(walletSyncOf(all, "a")).toEqual({ state: "failed", message: "timed out" });
    expect(walletSyncOf(all, "b")).toEqual({ state: "idle" });
  });

  it("ends a sync of every wallet only with its own answer", () => {
    const two = run({ type: "allStarted", ticket: 1 }, { type: "allStarted", ticket: 2 });
    const end = (ticket: number) =>
      ({ type: "allFinished", ticket, network: "signet", at: 0, outcomes: {} }) as const;
    expect(syncStep(two, end(1)).syncingAll).toBe(2);
    expect(syncStep(two, end(2)).syncingAll).toBeNull();
  });
});

const NOW_MS = 1_755_100_000_000;
const NOW_S = NOW_MS / 1000;
const MIN = 60;
const stamp = (secondsAgo: number) => ({ at: NOW_S - secondsAgo, tip_height: 1, backend: "b" });

describe("an old sync", () => {
  it("is not old at 29 minutes, and old from 30", () => {
    expect(syncIsStale(stamp(29 * MIN + 59), NOW_MS)).toBe(false);
    expect(syncIsStale(stamp(30 * MIN), NOW_MS)).toBe(true);
  });

  /** The system clock set back an hour: the distance counts. */
  it("counts a sync dated in the future by how far it is", () => {
    expect(syncIsStale(stamp(-60 * MIN), NOW_MS)).toBe(true);
    expect(syncIsStale(stamp(-MIN), NOW_MS)).toBe(false);
  });
});

describe("what a line dating the data says", () => {
  const old = stamp(45 * MIN);
  const at = (phase: SyncPhase, stampOf: SyncStamp | null = old, settled = true) =>
    freshnessOf({ stamp: stampOf, phase, settled }, NOW_MS).state;

  it("says the phase, then the age of the last good sync", () => {
    expect(at("syncing")).toBe("syncing");
    expect(at("failed")).toBe("failed");
    expect(at("idle")).toBe("stale");
    expect(at("idle", stamp(2 * MIN))).toBe("fresh");
    expect(at("idle", null)).toBe("never");
  });

  /** A sync just ended, its figures not read back yet: the old date
      is about to go, and is not called old meanwhile. */
  it("does not call old a date being read again", () => {
    expect(at("idle", old, false)).toBe("fresh");
  });

  it("dates several wallets by the least fresh one that synced", () => {
    expect(leastFresh([stamp(2 * MIN), null, stamp(45 * MIN), stamp(5 * MIN)])?.at).toBe(
      NOW_S - 45 * MIN,
    );
    expect(leastFresh([null, null])).toBeNull();
  });
});

describe("a refresh of every wallet", () => {
  const idle = { syncing: false, endedAt: null };

  it("is due past ten minutes on the least fresh wallet, not before", () => {
    expect(syncRefreshDue([stamp(9 * MIN), stamp(MIN)], idle, NOW_MS)).toBe(false);
    expect(syncRefreshDue([stamp(MIN), stamp(10 * MIN)], idle, NOW_MS)).toBe(true);
  });

  it("is due for a wallet that never synced", () => {
    expect(syncRefreshDue([stamp(MIN), null], idle, NOW_MS)).toBe(true);
  });

  it("waits while a sync runs, and for ten minutes after the last one ended", () => {
    const due = [stamp(60 * MIN)];
    expect(syncRefreshDue(due, { syncing: true, endedAt: null }, NOW_MS)).toBe(false);
    const ended = NOW_MS - SYNC_REFRESH_EVERY_MS + 1000;
    expect(syncRefreshDue(due, { syncing: false, endedAt: ended }, NOW_MS)).toBe(false);
    expect(syncRefreshDue(due, { syncing: false, endedAt: ended }, NOW_MS + 1000)).toBe(true);
  });

  /** The system clock set back: the end of the last sync and the
      wallets' dates are ahead of it, by more than a refresh. */
  it("is not held up by a clock set back", () => {
    const ahead = NOW_MS + 60 * MIN * 1000;
    expect(syncRefreshDue([stamp(-60 * MIN)], { syncing: false, endedAt: ahead }, NOW_MS)).toBe(
      true,
    );
  });

  it("is never due without a wallet", () => {
    expect(syncRefreshDue([], idle, NOW_MS)).toBe(false);
  });

  /** Ended, failed or not, on the network it ran on; another network's
      end stays its own. */
  it("keeps when the last one ended, network by network", () => {
    const ended = run(
      { type: "allStarted", ticket: 1 },
      { type: "allFinished", ticket: 1, network: "signet", at: 42, outcomes: { a: "timed out" } },
      { type: "allStarted", ticket: 2 },
      { type: "allFinished", ticket: 2, network: "testnet4", at: 50, outcomes: {} },
    );
    expect(ended.syncAllEnded).toEqual({ signet: 42, testnet4: 50 });
  });
});
