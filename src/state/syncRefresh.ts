// The wallets synced again while the app is on screen.
//
// The startup sync is one sync: an app left open all day showed the
// morning's figures in the evening. While the window is visible and
// unlocked, every wallet of the network is synced again once the least
// fresh of them is a refresh old (`syncRefreshDue`), and never within a
// refresh of the end of the last sync of them all, so the "old sync"
// amber stays off on an app that is open and online. It looks on the
// beat of the shared clock, which stops behind a hidden window; behind
// the lock it does not look at all.

import { useEffect } from "react";
import type { Network, WalletMeta } from "../lib/ipc";
import { syncRefreshDue } from "../lib/syncState";
import { onBeat } from "./clock";
import { useLock } from "./lock";
import { useUi } from "./store";
import { syncingAnyOf } from "./walletSync";

export function useSyncRefresh({
  enabled,
  network,
  wallets,
  reading,
  syncAll,
}: {
  /** The vault is open: the same condition as the startup sync. */
  enabled: boolean;
  network: Network | undefined;
  /** The wallets of `network`, as last read. */
  wallets: readonly WalletMeta[] | undefined;
  /** The list is being read again: its dates may be from before the
      sync that just ended, or of the network left behind. */
  reading: boolean;
  /** The sync of every wallet of a network, the one "Sync all" runs. */
  syncAll: (network: Network, how: { quiet: boolean }) => void;
}): void {
  useEffect(() => {
    if (!enabled || reading || !network || !wallets || wallets.length === 0) return;
    const ids = wallets.map((wallet) => wallet.id);
    const stamps = wallets.map((wallet) => wallet.last_sync);
    // Read from the store at the moment of looking, not from a render:
    // a sync started in this same commit, the startup's, has to count.
    const look = () => {
      if (document.visibilityState !== "visible") return;
      // Asked here too: a beat may land between the lock closing and
      // this effect being taken down.
      if (useLock.getState().locked) return;
      const state = useUi.getState();
      const due = syncRefreshDue(
        stamps,
        {
          // As "Sync all" is off: a rescan, a wallet's first sync or one
          // the live watch runs is let finish.
          syncing: syncingAnyOf(state, ids),
          endedAt: state.syncAllEnded[network] ?? null,
        },
        Date.now(),
      );
      if (due) syncAll(network, { quiet: true });
    };
    look();
    return onBeat(look);
  }, [enabled, reading, network, wallets, syncAll]);
}
