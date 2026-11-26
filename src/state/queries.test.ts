import { createElement } from "react";
import type { ReactNode } from "react";
import { MutationCache, QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FALSE_PROOF } from "../lib/ipc";
import type { PriceHistory, PriceQuote, PriceReading, SyncAllReport, WalletMeta } from "../lib/ipc";
import { coreCase } from "../test/core";
import { useUi } from "./store";
import {
  keys,
  priceReading,
  quoteOf,
  shownSeries,
  useRemoveWallet,
  useSyncAll,
  useSyncWallet,
} from "./queries";

const FRESH = coreCase<PriceReading>("PriceReading", "fresh");
const KEPT = coreCase<PriceReading>("PriceReading", "kept");
const MISSING = coreCase<PriceReading>("PriceReading", "missing");
const QUOTE: PriceQuote = (FRESH as Extract<PriceReading, { state: "fresh" }>).quote;

/** A price display prices with the core's quote, fresh or kept. */
describe("the price a display may use", () => {
  const quote = (reading: PriceReading | undefined, currency = QUOTE.currency) =>
    quoteOf(priceReading({ isError: false, data: reading }), currency);

  it("is the fresh quote, in the chosen currency", () => {
    expect(quote(FRESH)).toEqual(QUOTE);
  });

  /** One failed refresh used to drop the price everywhere: the core
      now keeps the last quote, and so do the amounts. */
  it("is the kept quote while the source fails", () => {
    expect(quote(KEPT)).toEqual(QUOTE);
  });

  it("is none when the core has no quote to keep", () => {
    expect(quote(MISSING)).toBeNull();
  });

  it("is none before the first reading", () => {
    expect(quote(undefined)).toBeNull();
  });

  it("is none in another currency than the one chosen", () => {
    expect(quote(FRESH, "usd")).toBeNull();
  });

  /** Source trouble is in the reading; a failed call is the core
      refusing, and the reading before it is no longer aged by it. */
  it("is none once a call to the core failed, whatever the cache holds", () => {
    expect(quoteOf(priceReading({ isError: true, data: FRESH }), QUOTE.currency)).toBeNull();
  });
});

/** The overview card keeps a series through a failed refresh, while
    the core would still keep a quote that old. */
describe("the price series the card may show", () => {
  const KEEP = 21_600;
  const SERIES: PriceHistory = {
    points: [{ t: 1_750_000_000, rate: 92_000 }],
    currency: "eur",
    source: "coingecko",
    range: "month",
    at: 1_750_000_000,
  };
  const chosen = { currency: "eur", source: "coingecko" } as const;
  const at = (secondsLater: number) => (SERIES.at + secondsLater) * 1000;

  it("is the series, not kept, while its refresh went through", () => {
    expect(shownSeries({ isError: false, data: SERIES }, chosen, KEEP, at(60))).toEqual({
      series: SERIES,
      kept: false,
    });
  });

  it("is the series before a failed refresh, marked kept", () => {
    expect(shownSeries({ isError: true, data: SERIES }, chosen, KEEP, at(KEEP - 1))).toEqual({
      series: SERIES,
      kept: true,
    });
  });

  it("is none once the kept series is as old as the core keeps a quote", () => {
    expect(shownSeries({ isError: true, data: SERIES }, chosen, KEEP, at(KEEP))).toBeNull();
  });

  it("is none in another currency or from another source than chosen", () => {
    expect(
      shownSeries({ isError: false, data: SERIES }, { ...chosen, currency: "usd" }, KEEP, at(60)),
    ).toBeNull();
    expect(
      shownSeries({ isError: true, data: SERIES }, { ...chosen, source: "mempool_space" }, KEEP, at(60)),
    ).toBeNull();
  });
});

/** A sync the core gave up on for a server's false proof: the wallet
    says it in the app's words, not in the core's, which name a check a
    person cannot act on. */
describe("a sync refused for a false proof", () => {
  afterEach(() => clearMocks());

  it("is said in the app's words under the wallet", async () => {
    mockIPC((cmd) => {
      if (cmd === "sync_wallet") return Promise.reject(coreCase("CoreError", "false_proof"));
      throw new Error(`unexpected command ${cmd}`);
    });
    useUi.setState({ syncErrors: {} });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useSyncWallet(), { wrapper });

    result.current.mutate("w1");
    await waitFor(() => expect(useUi.getState().syncErrors.w1).toBe(FALSE_PROOF));
  });

  /** A sync of every wallet hands its failures over as data, each with
      the code of its failure: the same sentence, by the same code. */
  it("is said in the app's words when every wallet is synced", async () => {
    const report = coreCase<SyncAllReport>("SyncAllReport", "one_failed");
    const proof = coreCase<SyncAllReport["failures"][number]>("SyncFailure", "false_proof");
    report.failures = [{ ...proof, wallet_id: "w1" }, { ...report.failures[0], wallet_id: "w2" }];
    mockIPC((cmd) => {
      if (cmd === "sync_all") return Promise.resolve(report);
      throw new Error(`unexpected command ${cmd}`);
    });
    useUi.setState({ syncErrors: {} });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    result.current("signet");
    await waitFor(() => expect(useUi.getState().syncErrors.w1).toBe(FALSE_PROOF));
    expect(useUi.getState().syncErrors.w2).toBe(report.failures[1].message);
  });
});

describe("a sync of every wallet", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    clearMocks();
  });

  function mount(client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })) {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    return renderHook(() => ({ all: useSyncAll(), one: useSyncWallet() }), { wrapper });
  }

  beforeEach(() => {
    useUi.setState({ syncErrors: {}, syncTurns: {}, syncingAll: null, syncAllEnded: {}, toast: null });
  });

  /** Whatever looks right after, the refresh at startup among them,
      sees it started, however the mutation gets going: here a cache
      that runs its own hook first, which defers the mutation's. */
  it("is said running the moment it is started", () => {
    mockIPC(() => new Promise(() => {}));
    const client = new QueryClient({ mutationCache: new MutationCache({ onMutate: () => undefined }) });
    const { result } = mount(client);
    result.current.all("signet");
    expect(useUi.getState().syncingAll).not.toBeNull();
  });

  /** The core reaches a node on this machine, or Tor, whatever the
      webview thinks of the network, and says why when it cannot. */
  it("is asked of the core while the webview reads offline, and its failure said", async () => {
    onlineManager.setOnline(false);
    let asked = 0;
    mockIPC((cmd) => {
      if (cmd === "sync_all" || cmd === "sync_wallet") {
        asked += 1;
        return Promise.reject({ kind: "sync", message: "no route to host" });
      }
      throw new Error(`unexpected command ${cmd}`);
    });
    const { result } = mount();
    act(() => result.current.all("signet"));
    await waitFor(() => expect(useUi.getState().syncingAll).toBeNull());
    act(() => result.current.one.mutate("w1"));
    await waitFor(() => expect(useUi.getState().syncErrors.w1).toBe("no route to host"));
    expect(useUi.getState().syncTurns.w1?.running).toBe(false);
    expect(asked).toBe(2);
  });

  /** Asked for, it says how it went; the refresh nobody asked for says
      nothing, and leaves the toast on screen where it is. */
  it("says how it went when asked for, and nothing when quiet", async () => {
    mockIPC((cmd) => {
      if (cmd === "sync_all") return Promise.resolve({ reports: [{ wallet_id: "w1" }, { wallet_id: "w2" }], failures: [] });
      throw new Error(`unexpected command ${cmd}`);
    });
    const { result } = mount();
    act(() => useUi.getState().showToast("Copied"));
    act(() => result.current.all("signet", { quiet: true }));
    await waitFor(() => expect(useUi.getState().syncingAll).toBeNull());
    expect(useUi.getState().toast).toBe("Copied");
    act(() => result.current.all("signet"));
    await waitFor(() => expect(useUi.getState().toast).toBe("2 wallets synced"));
  });
});

/** A removed wallet leaves nothing of itself in the window: the vault
    forgets it, and so does the cache and the store, where its page,
    its transaction and the state of its syncs would otherwise stay
    until the app closes. What belongs to the wallets that stay is
    kept. */
describe("a removed wallet", () => {
  afterEach(() => clearMocks());

  it("leaves nothing in the cache or the store, and the others keep theirs", async () => {
    mockIPC((cmd) => {
      if (cmd === "remove_wallet") return Promise.resolve();
      if (cmd === "list_wallets") return Promise.resolve([{ id: "w2", name: "Savings" }]);
      throw new Error(`unexpected command ${cmd}`);
    });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wallets = [
      { id: "w1", name: "Cold storage" },
      { id: "w2", name: "Savings" },
    ] as WalletMeta[];
    client.setQueryData(keys.wallets("signet"), wallets);
    for (const id of ["w1", "w2"]) {
      client.setQueryData(keys.snapshot(id), { id });
      client.setQueryData(keys.utxos(id), []);
      client.setQueryData(keys.policy(id), {});
      client.setQueryData(keys.receive(id), {});
      client.setQueryData(keys.txDetail(id, "aa"), {});
      client.setQueryData(["addresses", id, "receive"], []);
    }
    client.setQueryData(["recent-broadcasts", "signet"], [{ txid: "aa" }]);
    client.setQueryData(["broadcast-status", "signet", "0200"], {});
    useUi.setState({
      activeWalletId: "w1",
      selectedTxid: "aa",
      syncErrors: { w1: "timed out", w2: "timed out" },
      syncTurns: { w1: { ticket: 1, running: false }, w2: { ticket: 2, running: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useRemoveWallet(), { wrapper });

    result.current.mutate("w1");
    await waitFor(() => expect(useUi.getState().activeWalletId).toBeNull());

    expect(useUi.getState().selectedTxid).toBeNull();
    expect(useUi.getState().syncErrors).toEqual({ w2: "timed out" });
    expect(Object.keys(useUi.getState().syncTurns)).toEqual(["w2"]);
    const held = client
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.queryKey));
    expect(held.filter((key) => key.includes("w1"))).toEqual([]);
    expect(held.filter((key) => key.includes("w2")).length).toBe(6);
    expect(held.some((key) => key.includes("recent-broadcasts"))).toBe(false);
    expect(held.some((key) => key.includes("broadcast-status"))).toBe(false);
    expect(client.getQueryData<WalletMeta[]>(keys.wallets("signet"))).toEqual([wallets[1]]);
  });
});
