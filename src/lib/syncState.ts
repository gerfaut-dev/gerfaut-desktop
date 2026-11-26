// The sync states of the wallets, as one value per wallet and one
// transition: see `state/walletSync.ts` for who says what.

import { failureMessage } from "./ipc";
import type { WalletSyncState as CoreSyncState, Network, SyncStamp } from "./ipc";

/** Where a wallet's sync stands for the screens. While a sync runs, the
    failure of the one before stays said where a screen says it. */
export type WalletSyncStatus =
  | { state: "idle" }
  | { state: "syncing"; failure: string | null }
  | { state: "failed"; message: string };

/** The first sync of a wallet, still running: nothing was fetched yet,
    so the zero the vault holds for it is not an answer and no screen
    prints it as one. */
export function isFirstSync(sync: WalletSyncStatus, meta: { last_sync: unknown }): boolean {
  return sync.state === "syncing" && !meta.last_sync;
}

/** The fields of the store this module writes, and nothing else does. */
export interface SyncSlice {
  /** The words of the last failed sync of each wallet, until one
      succeeds; still there while it syncs again. */
  syncErrors: Record<string, string>;
  /** Per wallet, the ticket of the last word it took, and whether a
      sync of it runs. */
  syncTurns: Record<string, { ticket: number; running: boolean }>;
  /** The ticket of the sync of every wallet this window runs, if one
      runs. */
  syncingAll: number | null;
  /** Per network, when the last sync of every wallet of it ended, in
      milliseconds, whoever started it and however it ended. */
  syncAllEnded: Partial<Record<Network, number>>;
}

/** An outcome per wallet: null for a good sync, else what failed. */
export type SyncOutcomes = Record<string, string | null>;

export type SyncStep =
  /** This window starts a sync of a wallet. */
  | { type: "started"; walletId: string; ticket: number }
  /** That sync answered. */
  | { type: "finished"; walletId: string; ticket: number; failure: string | null }
  /** The core said where a wallet stands. */
  | { type: "told"; walletId: string; ticket: number; state: CoreSyncState }
  /** What the live watch said of a sync it ran: a failure, or null for
      a good one. It comes apart from the core's states, in no set order
      with them: taken only while no sync of the wallet runs, and it
      never says whether one does. */
  | { type: "heard"; walletId: string; failure: string | null }
  /** The wallet was removed: nothing of it is kept. */
  | { type: "removed"; walletId: string }
  /** The core's list, asked for with this ticket. */
  | { type: "listed"; ticket: number; states: Record<string, CoreSyncState> }
  /** This window starts a sync of every wallet. */
  | { type: "allStarted"; ticket: number }
  /** That sync of the wallets of `network` answered, wallet by wallet,
      or failed as a whole with no outcome, at `at` milliseconds. */
  | {
      type: "allFinished";
      ticket: number;
      network: Network;
      at: number;
      outcomes: SyncOutcomes;
    };

let lastTicket = 0;

/** A ticket newer than every one before. */
export function syncTicket(): number {
  lastTicket += 1;
  return lastTicket;
}

function withFailure(
  errors: Record<string, string>,
  walletId: string,
  failure: string | null,
): Record<string, string> {
  if (failure === null) {
    if (!(walletId in errors)) return errors;
    const rest = { ...errors };
    delete rest[walletId];
    return rest;
  }
  return errors[walletId] === failure ? errors : { ...errors, [walletId]: failure };
}

/** The words a screen shows for a failure the core keeps. */
function coreFailure(state: CoreSyncState): string | null {
  return state.state === "failed" ? failureMessage(state) : null;
}

/** Takes one word the core said of a wallet, at `ticket`. A wallet that
    has heard something newer keeps it. */
function tell(slice: SyncSlice, walletId: string, ticket: number, state: CoreSyncState): SyncSlice {
  if ((slice.syncTurns[walletId]?.ticket ?? 0) > ticket) return slice;
  const running = state.state === "syncing";
  return {
    ...slice,
    syncTurns: { ...slice.syncTurns, [walletId]: { ticket, running } },
    // A sync that starts leaves the failure before it said.
    syncErrors: running ? slice.syncErrors : withFailure(slice.syncErrors, walletId, coreFailure(state)),
  };
}

/** The one transition: where the syncs stand after `step`. */
export function syncStep(slice: SyncSlice, step: SyncStep): SyncSlice {
  switch (step.type) {
    case "started":
      return {
        ...slice,
        syncTurns: { ...slice.syncTurns, [step.walletId]: { ticket: step.ticket, running: true } },
      };
    case "finished": {
      // The core said more of this sync, or another one started.
      if (slice.syncTurns[step.walletId]?.ticket !== step.ticket) return slice;
      return {
        ...slice,
        syncTurns: {
          ...slice.syncTurns,
          [step.walletId]: { ticket: step.ticket, running: false },
        },
        syncErrors: withFailure(slice.syncErrors, step.walletId, step.failure),
      };
    }
    case "told":
      return tell(slice, step.walletId, step.ticket, step.state);
    case "heard":
      if (slice.syncTurns[step.walletId]?.running) return slice;
      return { ...slice, syncErrors: withFailure(slice.syncErrors, step.walletId, step.failure) };
    case "removed": {
      const { [step.walletId]: _turn, ...syncTurns } = slice.syncTurns;
      const { [step.walletId]: _failure, ...syncErrors } = slice.syncErrors;
      return { ...slice, syncTurns, syncErrors };
    }
    case "listed":
      return Object.entries(step.states).reduce(
        (next, [walletId, state]) => tell(next, walletId, step.ticket, state),
        slice,
      );
    case "allStarted":
      return { ...slice, syncingAll: step.ticket };
    case "allFinished": {
      let syncErrors = slice.syncErrors;
      for (const [walletId, failure] of Object.entries(step.outcomes)) {
        // A wallet the core has said more of since this sync started
        // keeps what it said.
        const turn = slice.syncTurns[walletId];
        if (turn && (turn.running || turn.ticket > step.ticket)) continue;
        syncErrors = withFailure(syncErrors, walletId, failure);
      }
      return {
        ...slice,
        syncErrors,
        syncingAll: slice.syncingAll === step.ticket ? null : slice.syncingAll,
        syncAllEnded: { ...slice.syncAllEnded, [step.network]: step.at },
      };
    }
  }
}

export function statusOf(running: boolean, failure: string | null): WalletSyncStatus {
  if (running) return { state: "syncing", failure };
  return failure === null ? { state: "idle" } : { state: "failed", message: failure };
}

/** Where the sync of a wallet stands, from the fields of the store. */
export function walletSyncOf(
  slice: Pick<SyncSlice, "syncTurns" | "syncErrors">,
  walletId: string,
): WalletSyncStatus {
  return statusOf(slice.syncTurns[walletId]?.running ?? false, slice.syncErrors[walletId] ?? null);
}

/** The failure a screen says for a wallet: the last one, also while a
    new sync runs. */
export function failureOf(status: WalletSyncStatus): string | null {
  switch (status.state) {
    case "idle":
      return null;
    case "syncing":
      return status.failure;
    case "failed":
      return status.message;
  }
}

/** How long ago `atMs` was. A system clock set back puts it in the
    future: the distance counts, so an hour back reads as an hour gone
    rather than stopping every rule that waits on an age. */
function ageMs(atMs: number, nowMs: number): number {
  return Math.abs(nowMs - atMs);
}

/** How old a sync may get before the lines that date it say so: three
    refreshes missed (`SYNC_REFRESH_EVERY_MS`), so an app on screen and
    online never gets there. */
export const SYNC_STALE_AFTER_SECONDS = 30 * 60;

/** Whether the sync of `stamp` is old enough to be said in amber. */
export function syncIsStale(stamp: Pick<SyncStamp, "at">, nowMs: number): boolean {
  return ageMs(stamp.at * 1000, nowMs) >= SYNC_STALE_AFTER_SECONDS * 1000;
}

/** Where the sync behind a line stands: one value, so a line never has
    to choose between two that both hold. A screen that keeps a failure
    said during the next try passes "failed" while it runs. */
export type SyncPhase = "idle" | "syncing" | "failed";

/** The phase of one wallet's sync: a sync that runs goes first. */
export function phaseOf(status: WalletSyncStatus): SyncPhase {
  return status.state;
}

/** What a line that dates the data says, in its order: a sync that
    runs, then one that failed, then the age of the last good one. */
export type Freshness =
  | { state: "syncing"; stamp: SyncStamp | null }
  | { state: "failed"; stamp: SyncStamp | null }
  | { state: "stale"; stamp: SyncStamp }
  | { state: "fresh"; stamp: SyncStamp }
  | { state: "never" };

/** `settled` is false while the figures dated are being read again:
    a sync that just ended has not reached them yet, and their old date
    is not one to call old. */
export function freshnessOf(
  { stamp, phase, settled }: { stamp: SyncStamp | null; phase: SyncPhase; settled: boolean },
  nowMs: number,
): Freshness {
  switch (phase) {
    case "syncing":
      return { state: "syncing", stamp };
    case "failed":
      return { state: "failed", stamp };
    case "idle":
      if (!stamp) return { state: "never" };
      return settled && syncIsStale(stamp, nowMs)
        ? { state: "stale", stamp }
        : { state: "fresh", stamp };
  }
}

/** The oldest of the syncs that happened: one line dating several
    wallets dates the least fresh figure. A wallet never synced has no
    date to give. */
export function leastFresh(stamps: readonly (SyncStamp | null)[]): SyncStamp | null {
  let oldest: SyncStamp | null = null;
  for (const stamp of stamps) {
    if (stamp && (!oldest || stamp.at < oldest.at)) oldest = stamp;
  }
  return oldest;
}

/** How often the wallets are synced again while the app is on screen. */
export const SYNC_REFRESH_EVERY_MS = 10 * 60 * 1000;

/** Whether the wallets on screen are due a sync of them all: the least
    fresh is a refresh old, or never synced; no sync of a wallet or of
    them all runs; and the last sync of them all on this network ended
    a refresh ago or more, whatever came of it. Measured from its end, a
    sync that takes longer than a refresh is not followed by another at
    once; and a failure waits its turn rather than being asked again on
    every look. */
export function syncRefreshDue(
  stamps: readonly (SyncStamp | null)[],
  { syncing, endedAt }: { syncing: boolean; endedAt: number | null },
  nowMs: number,
): boolean {
  if (stamps.length === 0 || syncing) return false;
  if (endedAt !== null && ageMs(endedAt, nowMs) < SYNC_REFRESH_EVERY_MS) return false;
  if (stamps.some((stamp) => stamp === null)) return true;
  const oldest = leastFresh(stamps);
  return oldest !== null && ageMs(oldest.at * 1000, nowMs) >= SYNC_REFRESH_EVERY_MS;
}
