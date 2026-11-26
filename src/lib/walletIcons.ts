// The glyph a wallet wears, wherever its name is shown: the switcher,
// the settings rows, the picker. One map, so no view draws its own.
// The symbols are Lucide's own; the devices are drawn for this app in
// Lucide's grammar (drawnWalletIcons.ts) and built with Lucide's own
// factory, so both take the same props and render the same way.

import { Key, Landmark, MapPin, PiggyBank, Shield, Snowflake, Wallet, createLucideIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DRAWN_WALLET_ICONS } from "./drawnWalletIcons";
import type { DrawnWalletIconId } from "./drawnWalletIcons";
import { WALLET_ICONS } from "./ipc";
import type { WalletIconId } from "./ipc";

interface IconEntry {
  icon: LucideIcon;
  label: string;
}

/** Lucide draws every id that is not a drawn one, so an id the core
    adds without a drawing has to be given a Lucide icon here. */
const SYMBOLS: Record<Exclude<WalletIconId, DrawnWalletIconId>, IconEntry> = {
  wallet: { icon: Wallet, label: "Wallet" },
  key: { icon: Key, label: "Key" },
  shield: { icon: Shield, label: "Shield" },
  map_pin: { icon: MapPin, label: "Pin" },
  snowflake: { icon: Snowflake, label: "Snowflake" },
  landmark: { icon: Landmark, label: "Landmark" },
  piggy_bank: { icon: PiggyBank, label: "Piggy bank" },
};

/** The drawn ids, held to the core's: a drawing whose id the core does
    not store fails to compile here. */
const DRAWN_IDS: readonly WalletIconId[] = Object.keys(DRAWN_WALLET_ICONS) as DrawnWalletIconId[];

const DEVICES = Object.fromEntries(
  Object.entries(DRAWN_WALLET_ICONS).map(([id, { label, node }]) => [
    id,
    // Prefixed, so its `lucide-device-<name>` class never meets one of
    // Lucide's own (Lucide has a calculator too).
    { icon: createLucideIcon(`device-${id.replaceAll("_", "-")}`, [...node]), label },
  ]),
) as Record<DrawnWalletIconId, IconEntry>;

const ENTRIES: Record<WalletIconId, IconEntry> = { ...SYMBOLS, ...DEVICES };

/** The icon component behind each id the core stores. */
export const WALLET_ICON = Object.fromEntries(
  WALLET_ICONS.map((id) => [id, ENTRIES[id].icon]),
) as Record<WalletIconId, LucideIcon>;

/** How each icon is named, to a screen reader and in a tooltip. */
export const WALLET_ICON_LABEL = Object.fromEntries(
  WALLET_ICONS.map((id) => [id, ENTRIES[id].label]),
) as Record<WalletIconId, string>;

/** The picker's two sections, each in the order of `WALLET_ICONS`. */
export const WALLET_ICON_SECTIONS: readonly { title: string; icons: readonly WalletIconId[] }[] = [
  { title: "Symbols", icons: WALLET_ICONS.filter((id) => !DRAWN_IDS.includes(id)) },
  { title: "Devices", icons: WALLET_ICONS.filter((id) => DRAWN_IDS.includes(id)) },
];

/** The glyph of a wallet, the plain wallet for anything unknown. */
export function walletGlyph(icon: WalletIconId): LucideIcon {
  return WALLET_ICON[icon] ?? Wallet;
}
