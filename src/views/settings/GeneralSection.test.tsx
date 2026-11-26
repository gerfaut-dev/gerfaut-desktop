import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFiatValue } from "../../components/Amount";
import type { PriceQuote, PriceReading, PriceTrouble } from "../../lib/ipc";
import { usePriceHistory } from "../../state/queries";
import { useUi } from "../../state/store";
import { coreCase } from "../../test/core";
import { LASTING_TROUBLE, PRICE_TABLE, QUIET_TROUBLE, fresh, kept } from "../../test/fixtures";
import { GeneralSection } from "./GeneralSection";

// The settings' price line and its note, and the fiat value of an
// amount beside them: both read the same reading of the core.

const FRESH = coreCase<PriceReading>("PriceReading", "fresh");
const QUIET_KEPT = coreCase<PriceReading>("PriceReading", "kept");
const LASTING_MISSING = coreCase<PriceReading>("PriceReading", "missing");
/** The core's quote, a mempool.space price in euros. */
const QUOTE = (FRESH as Extract<PriceReading, { state: "fresh" }>).quote;
/** The fiat value of 0.01 BTC at that quote. */
const FIAT = "€920.34";

const nowSecs = () => Math.floor(Date.now() / 1000);
/** The same quote, `minutes` old. */
// Ten seconds past the minute, so a draw a moment later still reads it.
const aged = (minutes: number): PriceQuote => ({ ...QUOTE, at: nowSecs() - minutes * 60 - 10 });
const lasting = (kind: PriceTrouble["kind"], nextTryIn = 600): PriceTrouble => ({
  ...LASTING_TROUBLE,
  kind,
  next_try: nowSecs() + nextTryIn,
});

let reading: PriceReading;
let retry: () => Promise<PriceReading>;
let asked: string[];

beforeEach(() => {
  asked = [];
  retry = () => Promise.resolve(reading);
  mockIPC((cmd) => {
    asked.push(cmd);
    if (cmd === "price_table") return PRICE_TABLE;
    if (cmd === "get_settings") return { active_network: "mainnet", app_prefs: {} };
    if (cmd === "fetch_price") return reading;
    if (cmd === "retry_price") return retry();
    return undefined;
  });
  useUi.setState({ fiatEnabled: true, fiatCurrency: "eur", fiatSource: "mempool_space", masked: false });
});

afterEach(() => clearMocks());

function Fiat() {
  return <p data-testid="fiat">{useFiatValue(1_000_000) ?? "no fiat"}</p>;
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GeneralSection />
      <Fiat />
    </QueryClientProvider>,
  );
  return client;
}

/** The next reading, as the next turn of the clock brings it. */
async function next(client: QueryClient, value: PriceReading) {
  reading = value;
  await act(() => client.refetchQueries({ queryKey: ["price"] }));
  // TanStack tells the screen on a later task: let it draw, so a
  // reading that changes nothing visible is still the one on screen.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

const fiat = () => screen.getByTestId("fiat").textContent;
const note = () => screen.queryByText(/until (it answers|Tor is back)\./);

describe("the price after a source failure", () => {
  /** What a 0.1.0 user saw: one failed refresh, a 429 or a timeout,
      and the price was gone, an orange line in its place. */
  it("keeps the price through one failure, then says so once it lasts", async () => {
    reading = fresh(aged(2));
    const client = renderSettings();
    expect(await screen.findByText(/^1 BTC = €92\s034\.25 · updated 2 min ago$/)).toBeInTheDocument();
    await waitFor(() => expect(fiat()).toBe(FIAT));

    await next(client, kept(aged(2), QUIET_TROUBLE));
    expect(screen.getByText(/^1 BTC = €92\s034\.25/)).toBeInTheDocument();
    expect(fiat()).toBe(FIAT);
    expect(note()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    await next(client, kept(aged(14), lasting("unreachable")));
    // Dated by the quote, not by the failure: the age keeps growing.
    expect(screen.getByText(/^1 BTC = €92\s034\.25 · updated 14 min ago$/)).toBeInTheDocument();
    expect(fiat()).toBe(FIAT);
    expect(
      screen.getByText(
        "mempool.space is not answering. Amounts use the last price until it answers. You can also switch to CoinGecko.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("reads the core's kept case like a fresh price, with no note", async () => {
    reading = QUIET_KEPT;
    renderSettings();
    expect(await screen.findByText(/^1 BTC = €92\s034\.25/)).toBeInTheDocument();
    await waitFor(() => expect(fiat()).toBe(FIAT));
    expect(note()).not.toBeInTheDocument();
  });

  it("says it is fetching, and prices nothing, after one failure with nothing kept", async () => {
    reading = { state: "missing", trouble: QUIET_TROUBLE };
    renderSettings();
    expect(await screen.findByText("Fetching the current price…")).toBeInTheDocument();
    expect(fiat()).toBe("no fiat");
    expect(note()).not.toBeInTheDocument();
  });

  it("says amounts show without fiat once a failure with nothing kept lasts", async () => {
    reading = LASTING_MISSING;
    renderSettings();
    expect(
      await screen.findByText(
        "mempool.space is not answering. Amounts show without fiat until it answers. You can also switch to CoinGecko.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^1 BTC =/)).not.toBeInTheDocument();
    expect(screen.queryByText("Fetching the current price…")).not.toBeInTheDocument();
    expect(fiat()).toBe("no fiat");
  });

  /** The source named its wait: a button would only be refused. */
  it("says when the core asks a rate-limited source again, with no button", async () => {
    reading = kept(aged(3), lasting("rate_limited", 150));
    const client = renderSettings();
    expect(
      await screen.findByText(
        "mempool.space is limiting requests from this connection. Amounts use the last price until it answers. Gerfaut asks again in 3 min.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    await next(client, kept(aged(3), lasting("rate_limited", 30)));
    expect(screen.getByText(/Gerfaut asks again in a minute\.$/)).toBeInTheDocument();
  });

  it("offers no other source for a currency only one source quotes", async () => {
    useUi.setState({ fiatCurrency: "inr", fiatSource: "coingecko" });
    reading = { state: "missing", trouble: lasting("refused") };
    renderSettings();
    expect(
      await screen.findByText(
        "CoinGecko refused the request. Amounts show without fiat until it answers.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  /** No other source helps: Tor is the route, not the source. */
  it("waits for Tor, not for the source, when Tor is missing", async () => {
    reading = { state: "missing", trouble: lasting("tor") };
    renderSettings();
    expect(
      await screen.findByText(
        "Tor is not available, so no price was asked. Amounts show without fiat until Tor is back.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("Try again", () => {
  it("asks the core now, and puts its reading in place", async () => {
    reading = kept(aged(20), lasting("unreachable"));
    let answer: (value: PriceReading) => void = () => {};
    retry = () => new Promise((resolve) => (answer = resolve));
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(asked).toContain("retry_price");
    // Busy, not off: it keeps its fill and the keyboard's focus, and a
    // second press while it runs asks nothing more.
    const trying = screen.getByRole("button", { name: "Trying…" });
    expect(trying).toHaveAttribute("aria-disabled", "true");
    await user.click(trying);
    expect(asked.filter((cmd) => cmd === "retry_price")).toHaveLength(1);

    await act(async () => answer(fresh(aged(0))));
    expect(await screen.findByText(/^1 BTC = €92\s034\.25 · updated just now$/)).toBeInTheDocument();
    expect(note()).not.toBeInTheDocument();
    expect(fiat()).toBe(FIAT);
  });

  it("leaves the reading before it when the call fails", async () => {
    reading = LASTING_MISSING;
    retry = () => Promise.reject({ kind: "internal", message: "internal: lock poisoned" });
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByText(/^mempool\.space is not answering\./)).toBeInTheDocument();
    expect(fiat()).toBe("no fiat");
  });
});

/** The core spaces its asks to a source that fails: a retry of the
    window's own, a second later, was a burst against a rate limit. */
describe("a failed price request", () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  // TanStack's own default: three retries, the first a second later.
  const retrying = () => new QueryClient();
  const count = (cmd: string) => asked.filter((name) => name === cmd).length;

  beforeEach(() => {
    mockIPC((cmd) => {
      asked.push(cmd);
      if (cmd === "price_table") return PRICE_TABLE;
      if (cmd === "get_settings") return { active_network: "mainnet", app_prefs: {} };
      return Promise.reject({ kind: "internal", message: "internal: lock poisoned" });
    });
  });

  it("is not asked again by the window for the price", async () => {
    render(
      <QueryClientProvider client={retrying()}>
        <GeneralSection />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(count("fetch_price")).toBe(1));
    await wait(1_300);
    expect(count("fetch_price")).toBe(1);
  });

  it("is not asked again by the window for the series", async () => {
    const client = retrying();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    renderHook(() => usePriceHistory("month", true), { wrapper });
    await waitFor(() => expect(count("fetch_price_history")).toBe(1));
    await wait(1_300);
    expect(count("fetch_price_history")).toBe(1);
  });
});
