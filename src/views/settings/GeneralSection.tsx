import { Coins, Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { useCreditFor } from "../../components/PriceCredit";
import { Select } from "../../components/Select";
import type { CurrencyReach, PriceSource, PriceTrouble } from "../../lib/ipc";
import { formatCurrency, relativeTime } from "../../lib/format";
import {
  priceReading,
  quoteOf,
  useFiatRate,
  usePriceTable,
  useRetryPrice,
} from "../../state/queries";
import { useNow } from "../../state/clock";
import { useUi } from "../../state/store";
import type { ThemePref } from "../../state/store";
import { SectionCard, Segmented, SettingRow, Toggle } from "./primitives";

/** The heading each currency is listed under: how many sources quote
    it, as the core's table says. */
const REACH_GROUP: Record<CurrencyReach, string> = {
  every: "Every source",
  coingecko_only: "CoinGecko only",
};

/** How the app reads: amounts and theme. */
export function GeneralSection() {
  return (
    <>
      <DisplayCard />
      <AppearanceCard />
    </>
  );
}

/** Unit, fiat value, currency and price source: how amounts read. */
function DisplayCard() {
  const {
    unit,
    setUnit,
    fiatEnabled,
    setFiatEnabled,
    fiatCurrency,
    setFiatCurrency,
    fiatSource,
    setFiatSource,
  } = useUi();
  // What is on offer, in the core's order: the currencies with the
  // sources that quote each, and the sources by name.
  const table = usePriceTable().data;
  const chosen = table?.currencies.find((entry) => entry.currency === fiatCurrency);
  const quotedBy = chosen?.sources ?? [];

  return (
    <SectionCard icon={<Coins size={18} strokeWidth={1.5} />} title="Display">
      <div className="flex flex-col gap-4">
        <SettingRow title="Unit" hint="Applies to every amount in the app.">
          <Segmented
            label="Amount unit"
            value={unit}
            onChange={setUnit}
            options={[
              { value: "btc", label: "BTC" },
              { value: "sats", label: "sats" },
            ]}
          />
        </SettingRow>
        <SettingRow
          title="Fiat value"
          hint="Shows the fiat value next to every amount."
        >
          <Toggle checked={fiatEnabled} onChange={setFiatEnabled} label="Show fiat value" />
        </SettingRow>
        <SettingRow title="Currency">
          <Select
            id="fiat-currency"
            label="Fiat currency"
            size="sm"
            // The list is wider than the field, which ends its row at the
            // card's right edge: kept to that edge, it opens leftwards
            // instead of running past the card and the window.
            align="end"
            className="w-40"
            value={fiatCurrency}
            onChange={setFiatCurrency}
            options={(table?.currencies ?? []).map((entry) => ({
              value: entry.currency,
              label: entry.code,
              hint: entry.name,
              group: REACH_GROUP[entry.reach],
            }))}
          />
        </SettingRow>
        <div>
          <SettingRow
            title="Price source"
            hint="Serves the fiat value and the overview price."
          >
            <Segmented
              label="Price source"
              value={fiatSource}
              onChange={setFiatSource}
              options={(table?.sources ?? []).map((entry) => ({
                value: entry.source,
                label: entry.label,
                disabled: !quotedBy.includes(entry.source),
              }))}
            />
          </SettingRow>
          {chosen?.reach === "coingecko_only" && (
            <p className="mt-1.5 font-ui text-xs text-muted">
              CoinGecko is the only source that quotes{" "}
              {chosen.code}.
            </p>
          )}
        </div>
        {fiatEnabled && <RatePreview />}
      </div>
    </SectionCard>
  );
}

/** The theme: light by default, dark, or the system's. */
function AppearanceCard() {
  const { theme, setTheme } = useUi();

  return (
    <SectionCard icon={<SunMoon size={18} strokeWidth={1.5} />} title="Appearance">
      <SettingRow title="Theme">
        <Segmented
          label="Theme"
          value={theme}
          onChange={(value) => setTheme(value as ThemePref)}
          options={[
            {
              value: "light",
              label: "Light",
              icon: <Sun size={15} strokeWidth={1.5} />,
            },
            {
              value: "dark",
              label: "Dark",
              icon: <Moon size={15} strokeWidth={1.5} />,
            },
            {
              value: "system",
              label: "System",
              icon: <Monitor size={15} strokeWidth={1.5} />,
            },
          ]}
        />
      </SettingRow>
    </SectionCard>
  );
}

function RatePreview() {
  const reading = priceReading(useFiatRate());
  const { fiatCurrency } = useUi();
  const now = useNow();
  // The line says what the amounts do: the same quote, by the same
  // rule. A kept quote reads like a fresh one, its age growing from
  // `quote.at`: one failure says nothing, the core keeps the price.
  const quote = quoteOf(reading, fiatCurrency);
  // The rate on screen is the source's: the screen credits it.
  useCreditFor(quote?.source);
  // Only a trouble the core calls lasting is said: two failures in a
  // row, or Tor missing.
  const trouble =
    reading && reading.state !== "fresh" && reading.trouble.lasting ? reading.trouble : null;
  return (
    <div className="flex flex-col gap-2">
      {quote ? (
        // The price itself, not a wallet's amount: it stays what
        // bitcoin fetches whichever network is open.
        <p className="tabular text-xs text-muted">
          1 BTC = {formatCurrency(quote.rate, fiatCurrency)} · updated{" "}
          {relativeTime(quote.at, now)}
        </p>
      ) : (
        !trouble && <p className="font-ui text-xs text-muted">Fetching the current price…</p>
      )}
      {trouble && <PriceTroubleNote trouble={trouble} kept={quote !== null} nowMs={now} />}
    </div>
  );
}

/** What a source that keeps failing means for the amounts, and what
    the person can do about it. */
function PriceTroubleNote({
  trouble,
  kept,
  nowMs,
}: {
  trouble: PriceTrouble;
  /** Whether the amounts still use a kept quote. */
  kept: boolean;
  nowMs: number;
}) {
  const { fiatCurrency, fiatSource } = useUi();
  const table = usePriceTable().data;
  const { retry, isPending } = useRetryPrice();
  const label = (source: PriceSource) =>
    table?.sources.find((entry) => entry.source === source)?.label ?? "The price source";
  const other = table?.currencies
    .find((entry) => entry.currency === fiatCurrency)
    ?.sources.find((source) => source !== fiatSource);
  const name = label(fiatSource);
  const tor = trouble.kind === "tor";
  const until = tor ? "until Tor is back." : "until it answers.";
  const sentences = [
    {
      rate_limited: `${name} is limiting requests from this connection.`,
      unreachable: `${name} is not answering.`,
      refused: `${name} refused the request.`,
      tor: "Tor is not available, so no price was asked.",
    }[trouble.kind],
    kept ? `Amounts use the last price ${until}` : `Amounts show without fiat ${until}`,
  ];
  if (trouble.kind === "rate_limited") {
    // The source named its wait: asking sooner would only be refused,
    // so the note says when the core asks, and offers no button.
    sentences.push(`Gerfaut asks again ${waitText(trouble.next_try, nowMs)}.`);
  } else if (!tor && other !== undefined) {
    sentences.push(`You can also switch to ${label(other)}.`);
  }
  return (
    // No live region: the note comes on its own after two failures, and
    // its wait changes every minute, which a screen reader would read
    // out each time. Its button carries the state of a retry.
    <Notice tone="info">
      {sentences.join(" ")}
      {trouble.kind !== "rate_limited" && (
        // Below the sentence, at the right, as the mobile's note puts
        // its actions: the sentence keeps the whole width.
        <div className="mt-2 flex justify-end">
          <Button variant="secondary" size="sm" onTint busy={isPending} onClick={retry}>
            {isPending ? "Trying…" : "Try again"}
          </Button>
        </div>
      )}
    </Notice>
  );
}

/** "in N min" to `nextTry`, rounded up, or "in a minute" under one. */
function waitText(nextTry: number, nowMs: number): string {
  const seconds = nextTry - nowMs / 1000;
  return seconds < 60 ? "in a minute" : `in ${Math.ceil(seconds / 60)} min`;
}
