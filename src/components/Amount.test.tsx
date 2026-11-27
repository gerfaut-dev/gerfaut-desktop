import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Balance } from "./Amount";
import { formatFiat } from "../lib/format";
import { useUi } from "../state/store";
import { PRICE_TABLE, fresh } from "../test/fixtures";

const RATE = 100_000;
const SATS = 150_000;

function mount() {
  mockIPC((cmd) => {
    if (cmd === "get_settings") return { active_network: "mainnet", app_prefs: {} };
    if (cmd === "price_table") return PRICE_TABLE;
    if (cmd === "fetch_price") {
      return fresh({ rate: RATE, currency: "eur", source: "coingecko", at: 1_755_000_000 });
    }
    return undefined;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Balance sats={SATS} />
    </QueryClientProvider>,
  );
}

const fiatText = formatFiat(SATS, RATE, "eur", "mainnet");

describe("Balance", () => {
  beforeEach(() => {
    useUi.setState({ fiatEnabled: true, fiatCurrency: "eur", fiatSource: "coingecko", masked: false });
  });
  afterEach(cleanup);

  it("fades the fiat line in when it arrives with the price", async () => {
    mount();
    const line = await screen.findByText(fiatText);
    expect(line).toHaveClass("animate-swap");
  });

  it("shows the fiat line at once when balances are shown again", async () => {
    mount();
    await screen.findByText(fiatText);
    act(() => useUi.setState({ masked: true }));
    expect(screen.queryByText(fiatText)).not.toBeInTheDocument();
    act(() => useUi.setState({ masked: false }));
    // The reader's own gesture: no arrival to mark.
    expect(screen.getByText(fiatText)).not.toHaveClass("animate-swap");
  });
});
