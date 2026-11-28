// Server-state hooks. One place defines cache keys and invalidation.

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import type {
  BackendConfig,
  ExportOptions,
  FiatCurrency,
  LockKind,
  Network,
  ParsedInput,
  PriceHistory,
  PriceQuote,
  PriceRange,
  PriceReading,
  PriceSource,
  SyncReport,
  WalletIconId,
  WalletMeta,
} from "../lib/ipc";
import { errorMessage, failureMessage, ipc, isCommandError, isFalseProof, isKind } from "../lib/ipc";
import { syncTicket } from "../lib/syncState";
import type { SyncOutcomes } from "../lib/syncState";
import { useUi } from "./store";

// What a sync found is announced by the Rust side, which posts the
// notifications and keeps the record of what was said: a sync asked
// for here and the live watch never say the same thing twice.

export const keys = {
  settings: ["settings"] as const,
  wallets: (network?: Network) => ["wallets", network ?? "all"] as const,
  snapshot: (id: string) => ["snapshot", id] as const,
  utxos: (id: string) => ["utxos", id] as const,
  policy: (id: string) => ["policy", id] as const,
  /** Every transaction of a wallet: the prefix of `txDetail`. */
  tx: (id: string) => ["tx", id] as const,
  txDetail: (id: string, txid: string) => ["tx", id, txid] as const,
  receive: (id: string) => ["receive", id] as const,
  addresses: (id: string) => ["addresses", id] as const,
  /** The last transactions sent on a network, newest first. */
  recentBroadcasts: (network: Network) => ["recent-broadcasts", network] as const,
  broadcastStatus: (network: Network, hex: string | null) =>
    ["broadcast-status", network, hex ?? "none"] as const,
  torStatus: ["tor-status"] as const,
  liveStatus: ["live-status"] as const,
  /** Constants of the build, which say nothing of the vault: the lock
      keeps them in the cache. */
  priceTable: ["price-table"] as const,
  liveLimits: ["live-limits"] as const,
};

/** What kept the vault shut at startup, or null. Asked once: only a
    retry from the screen that shows it changes the answer, and that
    screen resets every query when it does. A bridge that does not know
    the command reads as no failure. */
export function useStartupFailure() {
  return useQuery({
    queryKey: ["startup"],
    queryFn: async () => (await ipc.startupFailure()) ?? null,
    staleTime: Infinity,
    retry: false,
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: ipc.getSettings });
}

/** The welcome tour has been seen: the vault says so, or it was closed
    in this session. The vault's own preference decides, not a copy
    hydrated from it, which would land a frame later; the session's
    word covers a write the vault refused, and the settings read again
    at each unlock. Only an explicit "1" counts: an unreadable
    preference shows the tour again rather than swallowing it. */
export function useTourSeen(): boolean {
  const settings = useSettings();
  const dismissed = useUi((state) => state.tourDismissed);
  return settings.data?.app_prefs["onboarding.seen"] === "1" || dismissed;
}

/** The public servers offered for a network. A static catalogue: it
    only changes when the app is updated. */
export function usePublicServers(network: Network) {
  return useQuery({
    queryKey: ["public-servers", network],
    queryFn: () => ipc.publicServers(network),
    staleTime: Infinity,
  });
}

/** The wallets of a network. `enabled` is how the lock keeps them out
    of the cache: the list is names, kinds and networks, and behind the
    lock screen none of it has any business being in the webview. */
export function useWallets(network?: Network, enabled = true) {
  return useQuery({
    queryKey: keys.wallets(network),
    queryFn: () => ipc.listWallets(network),
    enabled,
  });
}

export function useSnapshot(id: string | null) {
  return useQuery({
    queryKey: keys.snapshot(id ?? "none"),
    queryFn: () => ipc.walletSnapshot(id!),
    enabled: id !== null,
  });
}

export function useUtxos(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: keys.utxos(id ?? "none"),
    queryFn: () => ipc.utxos(id!),
    enabled: id !== null && enabled,
  });
}

/** The wallet's policy read against the tip and its coins. Its lock
    states move with the chain, so it is invalidated with the snapshot. */
export function useWalletPolicy(id: string | null) {
  return useQuery({
    queryKey: keys.policy(id ?? "none"),
    queryFn: () => ipc.walletPolicy(id!),
    enabled: id !== null,
  });
}

export function useTxDetail(id: string | null, txid: string | null) {
  return useQuery({
    queryKey: keys.txDetail(id ?? "none", txid ?? "none"),
    queryFn: () => ipc.txDetail(id!, txid!),
    enabled: id !== null && txid !== null,
  });
}

export function useReceiveAddresses(id: string | null, lookahead: number) {
  return useQuery({
    queryKey: [...keys.receive(id ?? "none"), lookahead],
    queryFn: () => ipc.receiveAddresses(id!, lookahead),
    enabled: id !== null,
    // Skipping to the next index must not flash the page empty — but
    // never carry an address across wallets, even for a frame.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === id ? previous : undefined,
  });
}

/** The cached reads of one wallet, or of every wallet without `id`:
    what changes when chain state moves, and what goes with the wallet.
    Timelocks are among them, read against the tip and the coins, and
    the receive address, which a sync can mark as used. */
export function walletKeys(id?: string): QueryKey[] {
  if (id === undefined) {
    return [["snapshot"], ["utxos"], ["policy"], ["tx"], ["receive"], ["addresses"]];
  }
  return [
    keys.snapshot(id),
    keys.utxos(id),
    keys.policy(id),
    keys.tx(id),
    keys.receive(id),
    keys.addresses(id),
  ];
}

/** Invalidates everything that changes when chain state moves. */
export function useInvalidateWallet() {
  const client = useQueryClient();
  return (id?: string) => {
    void client.invalidateQueries({ queryKey: ["wallets"] });
    for (const key of walletKeys(id || undefined)) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
}

/** Syncs are commands to the core, which reaches the backend or says
    why not, a node on this machine or Tor included. Held back while the
    webview reads offline, by TanStack's default, a sync would stay
    "Syncing…" for as long, over the failure and the age it hides. */
const SYNC_NETWORK_MODE = "always";

/** What a sync of one wallet this window starts says of where the
    wallet stands: syncing from the start, then the answer, unless the
    core said more of the wallet in between (`syncStep`). The figures
    are asked again before the sync is said over, so a line never dates
    the old ones once nothing runs. */
function walletSyncSteps(invalidate: (id?: string) => void) {
  return {
    onMutate: (id: string) => {
      const ticket = syncTicket();
      useUi.getState().stepSync({ type: "started", walletId: id, ticket });
      return { ticket };
    },
    onSuccess: (_report: SyncReport, id: string, context: { ticket: number } | undefined) => {
      invalidate(id);
      if (context) {
        useUi
          .getState()
          .stepSync({ type: "finished", walletId: id, ticket: context.ticket, failure: null });
      }
    },
    onError: (error: unknown, id: string, context: { ticket: number } | undefined) => {
      invalidate(id);
      if (context) {
        useUi.getState().stepSync({
          type: "finished",
          walletId: id,
          ticket: context.ticket,
          failure: errorMessage(error),
        });
      }
    },
  };
}

export function useSyncWallet() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (id: string) => ipc.syncWallet(id),
    networkMode: SYNC_NETWORK_MODE,
    ...walletSyncSteps(invalidate),
  });
}

/** Scans a wallet again from its first address with the current gap
    limit. An incremental sync only watches the addresses it revealed:
    funds that landed past them, or a descriptor also used elsewhere,
    are only found by starting over. */
export function useRescanWallet() {
  const invalidate = useInvalidateWallet();
  const steps = walletSyncSteps(invalidate);
  return useMutation({
    mutationFn: (id: string) => ipc.rescanWallet(id),
    networkMode: SYNC_NETWORK_MODE,
    onMutate: steps.onMutate,
    onSuccess: (report, id, context) => {
      steps.onSuccess(report, id, context);
      const found =
        report.new_tx_count === 0
          ? "no new transactions"
          : report.new_tx_count === 1
            ? "1 new transaction"
            : `${report.new_tx_count} new transactions`;
      useUi.getState().showToast(`Rescanned · ${found}`);
    },
    onError: steps.onError,
  });
}

/** Fetches an older round of watched-address history. */
export function useLoadMoreHistory() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (id: string) => ipc.loadMoreHistory(id),
    onSuccess: (added, id) => {
      invalidate(id);
      useUi
        .getState()
        .showToast(added === 0 ? "History is complete" : `${added} older transactions`);
    },
    // A backend that refuses must say so: the button would otherwise
    // look like it did nothing.
    onError: (error) =>
      useUi
        .getState()
        .showToast(
          isFalseProof(error)
            ? "Nothing loaded: a server sent a false proof"
            : isCommandError(error)
              ? "Could not reach the backend"
              : "Could not load more",
        ),
  });
}

/** One sync of every wallet of a network, as the mutation runs it: its
    ticket is taken by whoever starts it, before it is asked for. */
interface SyncAllRun {
  network: Network;
  ticket: number;
  /** Started by no one: the refresh of a window left open. It says
      nothing when it ends; the lines say where the wallets stand. */
  quiet: boolean;
}

/** Starts a sync of every wallet of `network`: the one start of the
    startup sync, the sidebar's button, a restored backup and the
    refresh. It is said running before the mutation is asked for, so
    whatever looks next sees it, however the mutation gets going. */
export function useSyncAll(): (network: Network, how?: { quiet?: boolean }) => void {
  const invalidate = useInvalidateWallet();
  const finish = (run: SyncAllRun, outcomes: SyncOutcomes) => {
    // The figures are asked again before the sync is said over: see
    // `walletSyncSteps`.
    invalidate();
    useUi.getState().stepSync({
      type: "allFinished",
      ticket: run.ticket,
      network: run.network,
      at: Date.now(),
      outcomes,
    });
  };
  const { mutate } = useMutation({
    mutationFn: (run: SyncAllRun) => ipc.syncAll(run.network),
    networkMode: SYNC_NETWORK_MODE,
    onSuccess: (report, run) => {
      const outcomes: SyncOutcomes = {};
      for (const sync of report.reports) outcomes[sync.wallet_id] = null;
      for (const failure of report.failures) {
        outcomes[failure.wallet_id] = failureMessage(failure);
      }
      finish(run, outcomes);
      if (run.quiet) return;
      const ui = useUi.getState();
      if (report.failures.length === 0) {
        ui.showToast(
          report.reports.length === 1
            ? "1 wallet synced"
            : `${report.reports.length} wallets synced`,
        );
      } else {
        ui.showToast(
          `${report.reports.length} synced, ${report.failures.length} failed`,
        );
      }
    },
    // A sync of every wallet that did not answer at all leaves each
    // wallet as the core said it stands.
    onError: (_error, run) => finish(run, {}),
  });
  return useCallback(
    (network: Network, how: { quiet?: boolean } = {}) => {
      const ticket = syncTicket();
      useUi.getState().stepSync({ type: "allStarted", ticket });
      mutate({ network, ticket, quiet: how.quiet ?? false });
    },
    [mutate],
  );
}

/** Keeps a shown receive address revealed. The upcoming addresses and
    the audit list both change: it now counts as handed out. */
export function useRevealReceiveAddress() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, index }: { id: string; index: number }) =>
      ipc.revealReceiveAddress(id, index),
    onSuccess: (_answer, { id }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.receive(id) }),
        client.invalidateQueries({ queryKey: keys.addresses(id) }),
      ]),
  });
}

export function useAddressList(id: string | null) {
  return useQuery({
    queryKey: keys.addresses(id ?? "none"),
    queryFn: () => ipc.addressList(id!),
    enabled: id !== null,
  });
}

export function useExportCsv() {
  return useMutation({
    mutationFn: (args: { id: string; options: ExportOptions; suggestedName: string }) =>
      ipc.exportTransactionsCsv(args.id, args.options, args.suggestedName),
  });
}

/** Whether a price was not asked because Tor is required and cannot
    be had: with an onion backend the core sends nothing in the clear. */
export function torDown(error: unknown): boolean {
  return isKind(error, "tor");
}

/** Asked whatever the webview thinks of the network. The request is a
    command to the core, which reaches the source or says why not, Tor
    included; by default TanStack holds a refresh back while the
    webview reads offline, and the query keeps its old answer and its
    success, with no error for anyone to see. */
const PRICE_NETWORK_MODE = "always";

/** The currencies and price sources the settings offer, and how often
    the price is asked. The core's table: it only changes with the app. */
export function usePriceTable() {
  return useQuery({
    queryKey: keys.priceTable,
    queryFn: ipc.priceTable,
    staleTime: Infinity,
  });
}

/** The query key of the current price: what the price is asked by. */
const priceKey = (source: PriceSource, currency: FiatCurrency) =>
  ["price", source, currency] as const;

/** Current BTC price reading, by the currency and source of the
    preferences, asked again at the core's cadence while fiat display
    is on. The key carries what the price is asked by, which the store
    only takes once the vault stored it: a new key is a price the core
    asks by it.

    No retry here: a source that fails is answered by the core, which
    keeps the last quote, spaces its asks and honours a rate limit. A
    second request a second after a failure was a burst against that
    very limit. */
export function useFiatRate() {
  const { fiatEnabled, fiatSource, fiatCurrency } = useUi();
  const every = usePriceTable().data?.refresh_secs;
  return useQuery({
    queryKey: priceKey(fiatSource, fiatCurrency),
    queryFn: () => ipc.fetchPrice(),
    enabled: fiatEnabled,
    networkMode: PRICE_NETWORK_MODE,
    refetchInterval: every === undefined ? false : every * 1000,
    // Fresh for a little less than the cadence, so the next turn of
    // the clock always asks.
    staleTime: every === undefined ? 0 : every * 1000 - 5_000,
    retry: false,
  });
}

/** The reading a price display may use: the core's last one. A call
    that failed is no source trouble (those are in the reading) but the
    core refusing to answer, and the reading before it is no longer
    aged by the core: none then. */
export function priceReading(query: {
  isError: boolean;
  data: PriceReading | undefined;
}): PriceReading | null {
  return query.isError ? null : (query.data ?? null);
}

/** The quote an amount may be priced with: the reading's, fresh or
    kept, and in the currency chosen, or a dollar figure would sit
    behind a euro sign. The core keeps a quote six hours at most, so
    the app does not age it. */
export function quoteOf(
  reading: PriceReading | null,
  currency: FiatCurrency,
): PriceQuote | null {
  if (!reading || reading.state === "missing") return null;
  return reading.quote.currency === currency ? reading.quote : null;
}

/** The settings' "Try again": the source asked now, its reading put in
    place of the current one. A call that fails leaves the reading
    before it. The key is taken when pressed, so a reading never lands
    under a currency chosen meanwhile. */
export function useRetryPrice() {
  const client = useQueryClient();
  const { fiatSource, fiatCurrency } = useUi();
  const mutation = useMutation({
    mutationFn: (_key: ReturnType<typeof priceKey>) => ipc.retryPrice(),
    onSuccess: (reading, key) => client.setQueryData(key, reading),
  });
  const retry = useCallback(
    () => mutation.mutate(priceKey(fiatSource, fiatCurrency)),
    [mutation.mutate, fiatSource, fiatCurrency],
  );
  return { retry, isPending: mutation.isPending };
}

/** The series the price card may show. A refresh that fails keeps the
    series before it in the cache: it stays on screen while it is the
    chosen currency's and source's and younger than what the core keeps
    a quote (`keep_secs`), and says it is `kept`, so the card can date
    it. Older, it would read as today's price. */
export function shownSeries(
  query: { isError: boolean; data: PriceHistory | undefined },
  chosen: { currency: FiatCurrency; source: PriceSource },
  keepSecs: number | undefined,
  nowMs: number,
): { series: PriceHistory; kept: boolean } | null {
  const series = query.data;
  if (!series || series.currency !== chosen.currency || series.source !== chosen.source) {
    return null;
  }
  if (!query.isError) return { series, kept: false };
  if (keepSecs === undefined || nowMs / 1000 - series.at >= keepSecs) return null;
  return { series, kept: true };
}

/** Price series for the overview chart, from the configured source in
    the configured currency, which the core reads from the preferences.
 *
 *  `enabled` is the fiat setting and nothing else. A price request is a
 *  request to a third party from this machine at the moment Gerfaut
 *  opened, in the clear unless a backend is a `.onion` address, when
 *  the core sends it through Tor. Fiat display is off by default
 *  because of exactly that, so the chart asks for nothing until the
 *  setting says yes. */
export function usePriceHistory(range: PriceRange, enabled: boolean) {
  const { fiatSource, fiatCurrency } = useUi();
  return useQuery({
    queryKey: ["price-history", fiatSource, fiatCurrency, range],
    queryFn: () => ipc.fetchPriceHistory(range),
    enabled,
    networkMode: PRICE_NETWORK_MODE,
    staleTime: range === "day" ? 5 * 60_000 : 30 * 60_000,
    // The core spaces asks to a source that fails, and refuses a
    // series outright while the source asked to wait.
    retry: false,
  });
}

/** Decodes a pasted, imported or scanned transaction into its preview. */
export function usePreviewTransaction() {
  return useMutation({
    mutationFn: (args: { input: string; network: Network }) =>
      ipc.previewTransaction(args.input, args.network),
  });
}

/** Sends a ready transaction through the configured backend. The vault
    keeps what the network took, so the list of past broadcasts is read
    again. */
export function useBroadcastTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { network: Network; hex: string }) =>
      ipc.broadcastTransaction(args.network, args.hex),
    onSuccess: (_, args) => {
      void client.invalidateQueries({ queryKey: keys.recentBroadcasts(args.network) });
    },
  });
}

/** The transactions this app sent on `network`, newest first, as the
    vault keeps them. A read of the vault and nothing else: it is
    answered offline too, where the default would hold it back. */
export function useRecentBroadcasts(network: Network) {
  return useQuery({
    queryKey: keys.recentBroadcasts(network),
    queryFn: () => ipc.recentBroadcasts(network),
    networkMode: "always",
  });
}

/** Drops the vault's record of a broadcast on `network`. A refusal
    stays in the mutation's state, and the card it was asked from says
    it. */
export function useForgetBroadcast(network: Network) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (txid: string) => ipc.forgetBroadcast(txid),
    onSettled: () => client.invalidateQueries({ queryKey: keys.recentBroadcasts(network) }),
  });
}

/** Follows a broadcast transaction: every 30 seconds while pending,
    stopping once it has confirmed. */
export function useTransactionStatus(network: Network, hex: string | null) {
  return useQuery({
    queryKey: keys.broadcastStatus(network, hex),
    queryFn: () => ipc.transactionStatus(network, hex!),
    enabled: hex !== null,
    refetchInterval: (query) => (query.state.data?.standing === "confirmed" ? false : 30_000),
    retry: 1,
  });
}

export function useCheckUpdate() {
  return useMutation({ mutationFn: () => ipc.checkUpdate() });
}

export function useAddWallet() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (args: { name: string; parsed: ParsedInput; network: Network }) =>
      ipc.addWallet(args.name, args.parsed, args.network),
    onSuccess: () => invalidate(),
  });
}

/** What the window holds in memory for one wallet, none of it kept
    once the wallet is removed: its cached reads, and the store's page,
    transaction and sync state. The transactions sent on the network
    are read again, as the vault drops the ones that touched it. */
export function forgetWallet(client: QueryClient, id: string): void {
  for (const key of walletKeys(id)) {
    client.removeQueries({ queryKey: key });
  }
  client.setQueriesData<WalletMeta[]>({ queryKey: ["wallets"] }, (list) =>
    list?.filter((wallet) => wallet.id !== id),
  );
  client.removeQueries({ queryKey: ["recent-broadcasts"] });
  client.removeQueries({ queryKey: ["broadcast-status"] });
  useUi.getState().forgetWallet(id);
}

export function useRemoveWallet() {
  const client = useQueryClient();
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (id: string) => ipc.removeWallet(id),
    onSuccess: (_data, id) => {
      forgetWallet(client, id);
      invalidate();
    },
  });
}

export function useRenameWallet() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (args: { id: string; name: string }) => ipc.renameWallet(args.id, args.name),
    onSuccess: () => invalidate(),
  });
}

/** An icon lives in the wallet list and in the wallet's own snapshot;
    nothing on chain moved, so nothing else is read again. */
export function useSetWalletIcon() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; icon: WalletIconId }) =>
      ipc.setWalletIcon(args.id, args.icon),
    onSuccess: (_data, { id }) => {
      void client.invalidateQueries({ queryKey: ["wallets"] });
      void client.invalidateQueries({ queryKey: keys.snapshot(id) });
    },
  });
}

/** A pin lives in the wallet list; the live watch takes it at once and
    its status says how much of each wallet it now hears. */
export function useSetWalletLivePinned() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; pinned: boolean }) =>
      ipc.setWalletLivePinned(args.id, args.pinned),
    // Settled once the list has been read back, so the switch shows
    // what the vault holds and never flips back for a frame.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.liveStatus });
      return client.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}

/** The order is a fact of the list alone. Settled only once the list
    has been read back, so a caller's own callbacks see the vault's
    order in the cache. */
export function useReorderWallets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => ipc.reorderWallets(ids),
    onSuccess: () => client.invalidateQueries({ queryKey: ["wallets"] }),
  });
}

export function useSetActiveNetwork() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (network: Network) => ipc.setActiveNetwork(network),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  });
}

export function useSetGapLimit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (gapLimit: number) => ipc.setGapLimit(gapLimit),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.settings });
      // Metas carry the effective gap limit.
      void client.invalidateQueries({ queryKey: ["wallets"] });
      void client.invalidateQueries({ queryKey: ["snapshot"] });
    },
  });
}

export function useSetBackend() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { network: Network; config: BackendConfig }) =>
      ipc.setBackend(args.network, args.config),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  });
}

/** Asks what an Electrum server's certificate amounts to. Reads only:
    accepting one is [useSetBackendTrusting]. */
export function useInspectCertificate() {
  return useMutation({ mutationFn: (url: string) => ipc.inspectCertificate(url) });
}

/** Stores a backend with the certificate accepted for its server, in
    one write: both or neither. */
export function useSetBackendTrusting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { network: Network; config: BackendConfig; url: string; fingerprint: string }) =>
      ipc.setBackendTrusting(args.network, args.config, args.url, args.fingerprint),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  });
}

export function useSetAppLock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { kind: LockKind; secret: string; current?: string }) =>
      ipc.setAppLock(args.kind, args.secret, args.current),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  });
}

export function useClearAppLock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (current: string) => ipc.clearAppLock(current),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  });
}

export function useForgetCertificate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (host: string) => ipc.forgetCertificate(host),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  });
}
