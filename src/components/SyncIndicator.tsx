import { AlertTriangle, ClockAlert } from "lucide-react";
import type { SyncStamp } from "../lib/ipc";
import { relativeTime } from "../lib/format";
import { freshnessOf, phaseOf } from "../lib/syncState";
import type { Freshness, WalletSyncStatus } from "../lib/syncState";
import { useNow } from "../state/clock";
import { useFadeOnChange } from "../lib/motion";
import { useUi } from "../state/store";

/** The glyph of a sync to look at, wherever a line dates the data:
    amber is never said by its colour alone. */
export function SyncGlyph({ state }: { state: "failed" | "stale" }) {
  return state === "failed" ? (
    <AlertTriangle
      size={13}
      strokeWidth={1.5}
      aria-hidden
      data-glyph="alert-triangle"
      className="shrink-0"
    />
  ) : (
    <ClockAlert size={13} strokeWidth={1.5} aria-hidden data-glyph="clock-alert" className="shrink-0" />
  );
}

/** The line in two parts: the words of the state, announced when they
    change, and the rest, the date among it, which the clock moves on
    every half minute and nobody needs read out each time. */
function lineOf(fresh: Freshness, now: number): { said: string; rest: string | null } {
  const ago = (stamp: SyncStamp) => relativeTime(stamp.at, now);
  switch (fresh.state) {
    case "syncing":
      return { said: "Syncing…", rest: fresh.stamp ? `last sync ${ago(fresh.stamp)}` : null };
    case "failed":
      return {
        said: "Sync failed",
        rest: fresh.stamp ? `· showing data from ${ago(fresh.stamp)}` : "· no data yet",
      };
    case "stale":
    case "fresh":
      return { said: "Synced", rest: `${ago(fresh.stamp)} · ${fresh.stamp.backend}` };
    case "never":
      return { said: "Never synced", rest: null };
  }
}

/** Data freshness, always visible. While syncing, the last known sync
    stays on screen. A failed sync is stated with its reason: silence
    would look like health. An old sync says so in amber, behind a
    clock: a date alone leaves the reader to do the sum. */
export function SyncIndicator({
  stamp,
  sync,
  reading,
}: {
  stamp: SyncStamp | null;
  /** The sync of the wallet shown, never another wallet's. */
  sync: WalletSyncStatus;
  /** The figures dated are being read again. */
  reading: boolean;
}) {
  const now = useNow();
  // A sync of every wallet answers once the last of them is done, and
  // the figures of the ones done before are read again after it.
  const syncingAll = useUi((state) => state.syncingAll !== null);
  const fresh = freshnessOf(
    { stamp, phase: phaseOf(sync), settled: !reading && !syncingAll },
    now,
  );
  const { said, rest } = lineOf(fresh, now);
  const warned = fresh.state === "failed" || fresh.state === "stale" ? fresh.state : null;
  // One shape for every state, so the announced part is the same
  // element from one state to the next: a live region put in place
  // with its words already in it is not reliably read out. Growing old
  // is not announced: nothing happened, and the date says it when read.
  // The words carry the baseline, not the glyph: a line that gains one
  // keeps its box, and the header under it does not move.
  // A new state fades in on the spot. The element stays the same, so
  // the live region inside it keeps being read out.
  const fade = useFadeOnChange<HTMLSpanElement>(fresh.state);
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-ui text-xs font-medium tracking-wide ${
        warned ? "text-pending" : "text-muted"
      }`}
      title={sync.state === "failed" ? sync.message : undefined}
    >
      {warned && <SyncGlyph state={warned} />}
      <span ref={fade} className="self-baseline">
        <span aria-live="polite">{said}</span>
        {rest && ` ${rest}`}
      </span>
    </span>
  );
}
