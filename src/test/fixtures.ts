// What gerfaut-core answers about the preferences and the price table,
// read from its reference JSON (see core.ts), as the tests need it.

import type {
  Preferences,
  PreferencesChange,
  PriceQuote,
  PriceReading,
  PriceTable,
  PriceTrouble,
} from "../lib/ipc";
import { coreCase } from "./core";

/** What `fetch_price` answers when the source just gave `quote`. */
export const fresh = (quote: PriceQuote): PriceReading => ({ state: "fresh", quote });

/** What `fetch_price` answers while the source fails and the core
    keeps `quote` in its place. */
export const kept = (quote: PriceQuote, trouble: PriceTrouble): PriceReading => ({
  state: "kept",
  quote,
  trouble,
});

/** The core's trouble cases: one failure, quiet, and one it says. */
export const QUIET_TROUBLE = coreCase<PriceTrouble>("PriceTrouble", "quiet");
export const LASTING_TROUBLE = coreCase<PriceTrouble>("PriceTrouble", "lasting");

/** The preferences of a vault that never stored any: the core's
    defaults, as it sends them. */
export const PREFERENCES = coreCase<Preferences>("Preferences", "default");

/** The core's table, whole, in its shape and order. */
export const PRICE_TABLE = coreCase<PriceTable>("PriceTable", "table");

/** A stand-in for the core's `set_preferences`: the change applied to
    what it holds, answered whole. Nothing more: a test of a rule the
    core applies answers what the core would. */
export function preferencesHeld(initial: Preferences = PREFERENCES) {
  let held = { ...initial };
  return (change: PreferencesChange): Preferences => {
    held = { ...held, ...change };
    return held;
  };
}
