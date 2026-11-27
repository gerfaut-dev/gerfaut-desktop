import { clsx } from "clsx";
import { useState } from "react";
import {
  MASKED,
  formatAmount,
  formatAmountSigned,
  formatBtc,
  formatFiat,
  formatSats,
} from "../lib/format";
import { priceReading, quoteOf, useFiatRate, useSettings } from "../state/queries";
import { useUi } from "../state/store";
import { useCreditFor } from "./PriceCredit";

/** An amount as plain text, for a heading or a fact where a component
    would not fit: the chosen unit, masked when the display is, `n/a`
    when nobody could tell us the value. */
export function useAmountText(sats: number | null): string {
  const { masked, unit } = useUi();
  if (sats === null) return "n/a";
  return masked ? MASKED : formatAmount(sats, unit);
}

/** Fiat value of an amount, when the display is enabled and the core
    has a quote, fresh or kept from a source that fails since, in the
    chosen currency.
    Degrades to nothing, never to an error. Every fiat value
    on screen comes from here, so the network is read here once: the
    pages show the wallets of the active network and no other, which
    makes it the network of every amount they hold. Not known yet, it
    shows nothing rather than a price a test coin does not have.

    A value it gives is on screen, priced by its source: it marks the
    source for the credit of the screen (`CreditSlot`). Off mainnet the
    value is zero, which no source priced, and it marks nothing. */
export function useFiatValue(sats: number): string | null {
  const { fiatEnabled, fiatCurrency, masked } = useUi();
  const quote = quoteOf(priceReading(useFiatRate()), fiatCurrency);
  const network = useSettings().data?.active_network;
  const shown = fiatEnabled && !masked && quote !== null && network !== undefined;
  useCreditFor(shown && network === "mainnet" ? quote.source : null);
  if (!shown) return null;
  return formatFiat(sats, quote.rate, fiatCurrency, network);
}

/** The fade of a fiat line that arrives with the price, after the page
    waited for it. A value that changes keeps its line and is replaced
    at once; turning the display on or showing balances again is the
    reader's own gesture, not an arrival, and cuts. */
function useFiatArrival(fiat: string | null): string {
  const { fiatEnabled, masked } = useUi();
  const [awaited, setAwaited] = useState(false);
  const waiting = fiatEnabled && !masked && fiat === null;
  if (waiting && !awaited) setAwaited(true);
  if ((!fiatEnabled || masked) && awaited) setAwaited(false);
  return awaited && fiat !== null ? "animate-swap" : "";
}

/** Headline balance figure: UI face with tabular figures, masked-aware.
    One line in the chosen unit — never both units — with the fiat value
    below when that display is on. Sized to read, not to shout. */
export function Balance({ sats }: { sats: number }) {
  const { masked, unit } = useUi();
  const fiat = useFiatValue(sats);
  const arrive = useFiatArrival(fiat);
  const primary = unit === "btc" ? formatBtc(sats) : formatSats(sats);
  return (
    <div className="selectable">
      <div className="tabular text-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-text">
        {masked ? MASKED : primary}
        {unit === "btc" && (
          <span className="ml-1.5 font-ui text-[13px] font-normal text-muted">BTC</span>
        )}
      </div>
      {fiat && <div className={clsx("mt-1.5 tabular text-[13px] text-muted", arrive)}>{fiat}</div>}
    </div>
  );
}

/** Signed list amount with an optional fiat subline. Direction is also
    carried by icon and sign elsewhere in the row. */
export function ListAmount({ sats, pending }: { sats: number; pending?: boolean }) {
  const { masked, unit } = useUi();
  const fiat = useFiatValue(sats);
  const arrive = useFiatArrival(fiat);
  return (
    <span className="inline-flex flex-col items-end">
      <span
        className={clsx(
          "tabular text-[13px] font-medium",
          sats > 0 && !pending ? "text-confirmed" : "text-text",
        )}
      >
        {masked ? MASKED : formatAmountSigned(sats, unit)}
      </span>
      {fiat && <span className={clsx("tabular text-[11px] text-muted", arrive)}>{fiat}</span>}
    </span>
  );
}

/** One line of a transaction's inputs or outputs: the chosen unit and
    nothing else. No fiat here on purpose — beside a single input nobody
    can tell whether a figure in euros is the value the coin had when it
    moved or the value it has now, and a figure nobody can date is worse
    than no figure. The fiat belongs on the net amount, above. */
export function UnitAmount({ sats }: { sats: number | null }) {
  const { masked, unit } = useUi();
  if (sats === null) return <span className="font-ui text-[13px] text-muted">n/a</span>;
  return (
    <span className="selectable whitespace-nowrap tabular text-[13px] font-medium text-text">
      {masked ? MASKED : formatAmount(sats, unit)}
    </span>
  );
}

/** Unsigned amount stacked over its fiat value, for table cells: the
    amount never wraps, the fiat line carries the small print. */
export function StackedAmount({ sats }: { sats: number }) {
  const { masked, unit } = useUi();
  const fiat = useFiatValue(sats);
  const arrive = useFiatArrival(fiat);
  return (
    <span className="inline-flex flex-col items-end">
      <span className="selectable whitespace-nowrap tabular text-[13px] font-medium text-text">
        {masked ? MASKED : formatAmount(sats, unit)}
      </span>
      {fiat && (
        <span className={clsx("whitespace-nowrap tabular text-[11px] text-muted", arrive)}>
          {fiat}
        </span>
      )}
    </span>
  );
}
