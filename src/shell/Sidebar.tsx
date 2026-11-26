import { clsx } from "clsx";
import {
  ArrowLeftRight,
  Check,
  FileDown,
  ChevronsUpDown,
  Coins,
  Eye,
  EyeOff,
  GripVertical,
  House,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Route,
  Settings,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DropLine, useDragReorder } from "../components/DragReorder";
import { SyncGlyph } from "../components/SyncIndicator";
import { MASKED, NETWORK_LABEL, UNKNOWN, formatAmount, relativeTime } from "../lib/format";
import type { Network, SyncStamp, WalletMeta } from "../lib/ipc";
import { freshnessOf, isFirstSync, leastFresh } from "../lib/syncState";
import type { Freshness } from "../lib/syncState";
import { walletGlyph } from "../lib/walletIcons";
import { useNow } from "../state/clock";
import type { CanvasView } from "../state/store";
import { useUi } from "../state/store";
import { useWalletOrder } from "../state/walletOrder";
import { useWalletSyncOf } from "../state/walletSync";
import mark from "../assets/gerfaut-mark-accent-dark.svg";

/** The wallet pages of the sidebar: one word, one icon, every wallet. */
const PAGES: { view: CanvasView; label: string; icon: ReactNode }[] = [
  { view: "home", label: "Overview", icon: <House size={18} strokeWidth={1.5} aria-hidden /> },
  {
    view: "transactions",
    label: "Transactions",
    icon: <ArrowLeftRight size={18} strokeWidth={1.5} aria-hidden />,
  },
  { view: "utxos", label: "UTXOs", icon: <Coins size={18} strokeWidth={1.5} aria-hidden /> },
  { view: "policy", label: "Policy", icon: <Route size={18} strokeWidth={1.5} aria-hidden /> },
  { view: "receive", label: "Receive", icon: <QrCode size={18} strokeWidth={1.5} aria-hidden /> },
  {
    view: "broadcast",
    label: "Broadcast",
    icon: <Radio size={18} strokeWidth={1.5} aria-hidden />,
  },
  {
    view: "export",
    label: "Export",
    icon: <FileDown size={18} strokeWidth={1.5} aria-hidden />,
  },
];

/** The dark sidebar: brand, wallet switcher, pages, global actions.
    It sits directly on the shell base and can collapse to an icon
    rail; the canvas floats beside it. */
export function Sidebar({
  wallets,
  activeWalletId,
  network,
  syncing,
  walletsReading,
  onSyncAll,
  onLock,
}: {
  wallets: WalletMeta[];
  /** Effective selection, derived by the app (fallback included). */
  activeWalletId: string | null;
  network: Network;
  syncing: boolean;
  /** The list of wallets is being read again: its dates may be from
      before the sync that just ended. */
  walletsReading: boolean;
  onSyncAll: () => void;
  /** Locks the app now; absent when no lock is set. */
  onLock?: () => void;
}) {
  const { view, setView, sidebarCollapsed, toggleSidebar, masked, toggleMasked } = useUi();
  const collapsed = sidebarCollapsed;
  const hasWallets = wallets.length > 0;
  const syncOf = useWalletSyncOf();
  const now = useNow();
  const syncLabel = syncing ? "Syncing…" : "Sync all";
  const syncLineId = useId();
  // One line dates every wallet of the network, from any page: the
  // least fresh of them, since it speaks for all. None without a wallet.
  const fresh = hasWallets
    ? freshnessOf(
        {
          stamp: leastFresh(wallets.map((wallet) => wallet.last_sync)),
          phase: syncing
            ? "syncing"
            : wallets.some((wallet) => syncOf(wallet.id).state === "failed")
              ? "failed"
              : "idle",
          settled: !walletsReading,
        },
        now,
      )
    : null;
  const lines = fresh ? syncLineOf(fresh, now) : [];

  const collapseButton = (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-sunken/60 hover:text-text"
    >
      {collapsed ? (
        <PanelLeftOpen size={17} strokeWidth={1.5} aria-hidden />
      ) : (
        <PanelLeftClose size={17} strokeWidth={1.5} aria-hidden />
      )}
    </button>
  );

  return (
    <nav
      aria-label="Navigation"
      className={clsx(
        "shell-rail flex h-full shrink-0 flex-col text-text",
        "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
        collapsed ? "w-16" : "w-[248px]",
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 pb-3 pt-5">
          <img src={mark} alt="" aria-hidden className="h-6 w-6" />
          {collapseButton}
        </div>
      ) : (
        // The mark stands on the axis the page icons share.
        <div className="flex items-center gap-2.5 py-4 pl-6 pr-3">
          <img src={mark} alt="" aria-hidden className="h-6 w-6 shrink-0" />
          <span className="font-display text-[15px] font-bold tracking-wide text-text">
            GERFAUT
          </span>
          <span className="ml-auto">{collapseButton}</span>
        </div>
      )}

      <WalletSwitcher
        wallets={wallets}
        activeWalletId={activeWalletId}
        collapsed={collapsed}
      />

      <ul className={clsx("mt-4 flex flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>
        {PAGES.map((page) => (
          <li key={page.view}>
            <NavItem
              label={page.label}
              icon={page.icon}
              collapsed={collapsed}
              active={view === page.view}
              // Without a wallet, the overview is the empty page, the
              // way back to adding the first one; the others are shut.
              disabled={!hasWallets && page.view !== "home"}
              onClick={() => setView(page.view)}
            />
          </li>
        ))}
      </ul>

      <div className="flex-1" />

      {network !== "mainnet" && (
        <div className={clsx("flex pb-2", collapsed ? "justify-center px-2" : "px-6")}>
          <span
            title={collapsed ? NETWORK_LABEL[network] : undefined}
            className={clsx(
              "rounded-full bg-sunken font-ui text-[11px] font-medium text-pending",
              collapsed ? "px-1.5 py-0.5" : "px-2 py-0.5",
            )}
          >
            {collapsed ? NETWORK_LABEL[network].charAt(0) : NETWORK_LABEL[network]}
          </span>
        </div>
      )}
      <div
        aria-hidden
        className="mx-3 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />

      <div className={clsx("flex flex-col gap-0.5 py-2 pb-3", collapsed ? "px-2" : "px-3")}>
        {onLock && (
          <NavItem
            label="Lock"
            icon={<Lock size={18} strokeWidth={1.5} aria-hidden />}
            collapsed={collapsed}
            active={false}
            onClick={onLock}
          />
        )}
        <NavItem
          label="Settings"
          icon={<Settings size={18} strokeWidth={1.5} aria-hidden />}
          collapsed={collapsed}
          active={view === "settings"}
          onClick={() => setView("settings")}
        />
        <NavItem
          label={syncLabel}
          hint={fresh ? [syncLabel, ...lines].join(" · ") : undefined}
          describedBy={collapsed && lines.length > 0 ? syncLineId : undefined}
          icon={
            <span className="relative inline-flex">
              <RefreshCw
                size={18}
                strokeWidth={1.5}
                aria-hidden
                className={syncing ? "motion-safe:animate-spin" : undefined}
              />
              {/* Folded, the line below is gone: an old or failed sync
                  stays in sight as a mark on the icon, never as its
                  colour alone. */}
              {collapsed && fresh && (fresh.state === "failed" || fresh.state === "stale") && (
                <span
                  aria-hidden
                  data-mark={fresh.state}
                  className="absolute -bottom-1 -right-1.5 rounded-full bg-shell text-pending"
                >
                  <SyncGlyph state={fresh.state} />
                </span>
              )}
            </span>
          }
          collapsed={collapsed}
          active={false}
          disabled={syncing || !hasWallets}
          busy={syncing}
          onClick={onSyncAll}
        />
        {fresh && (
          <SyncLine id={syncLineId} fresh={fresh} lines={lines} collapsed={collapsed} />
        )}
        <NavItem
          label={masked ? "Show amounts" : "Hide amounts"}
          icon={
            masked ? (
              <EyeOff size={18} strokeWidth={1.5} aria-hidden className="text-primary" />
            ) : (
              <Eye size={18} strokeWidth={1.5} aria-hidden />
            )
          }
          collapsed={collapsed}
          active={false}
          pressed={masked}
          onClick={toggleMasked}
        />
      </div>
    </nav>
  );
}

/** What the sync line says, a line each. While a sync runs, the row
    says "Syncing…" and the line adds the date before it, if any. */
function syncLineOf(fresh: Freshness, now: number): string[] {
  const ago = (stamp: SyncStamp) => relativeTime(stamp.at, now);
  switch (fresh.state) {
    case "syncing":
      return fresh.stamp ? [`last sync ${ago(fresh.stamp)}`] : [];
    case "failed":
      return fresh.stamp ? ["Sync failed", `last sync ${ago(fresh.stamp)}`] : ["Sync failed"];
    case "stale":
    case "fresh":
      return [`Synced ${ago(fresh.stamp)}`];
    case "never":
      return ["Never synced"];
  }
}

/** The date of the wallets' last sync, under the row that syncs them:
    text, not a second button. Not announced: the page's own line says
    it when the page dates the data, and two would say it twice. Folded,
    the rail has no room for it: it stays for a screen reader only, as
    the row's description, and the row's tooltip carries it. The reason
    of a failure stays on the Overview. */
function SyncLine({
  id,
  fresh,
  lines,
  collapsed,
}: {
  id: string;
  fresh: Freshness;
  lines: string[];
  collapsed: boolean;
}) {
  const warned = fresh.state === "failed" || fresh.state === "stale" ? fresh.state : null;
  return (
    <p
      id={id}
      data-sync-line={fresh.state}
      className={clsx(
        "font-ui text-xs font-medium tracking-wide",
        warned ? "text-pending" : "text-muted",
        // Under the row's label, on its axis. A line tall even when a
        // first sync leaves it nothing to say, so the rows below stay put.
        collapsed ? "sr-only" : "flex min-h-[1.375rem] gap-1.5 pb-1.5 pl-10 pr-3",
      )}
    >
      {warned && !collapsed && (
        // As tall as a line of text, so the glyph sits on the first.
        <span className="flex h-4 items-center">
          <SyncGlyph state={warned} />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </p>
  );
}

function NavItem({
  label,
  hint,
  describedBy,
  icon,
  collapsed,
  active,
  disabled = false,
  busy = false,
  pressed,
  onClick,
}: {
  label: string;
  /** Folded, the tooltip: the label and what the row has to say beside
      it. The name stays the label: what it says beside it is read from
      `describedBy`, once. */
  hint?: string;
  /** Folded, the element that says what the row has to say beside its
      label. */
  describedBy?: string;
  icon: ReactNode;
  collapsed: boolean;
  active: boolean;
  disabled?: boolean;
  /** Working right now: not clickable, but not dimmed either. Dimmed
      reads as unavailable, and a turning icon at 40 % looks broken. */
  busy?: boolean;
  /** For toggle rows (hide amounts): state without the page accent. */
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-current={active ? "page" : undefined}
      aria-pressed={pressed}
      title={collapsed ? (hint ?? label) : undefined}
      aria-label={collapsed ? label : undefined}
      aria-describedby={describedBy}
      className={clsx(
        "group relative flex w-full cursor-pointer items-center rounded-md text-left font-ui text-sm font-medium",
        "transition-colors duration-150 disabled:cursor-default",
        !busy && "disabled:opacity-40",
        collapsed ? "h-10 justify-center" : "gap-2.5 px-3 py-2",
        active
          ? "bg-sunken text-text"
          : "text-muted enabled:hover:bg-sunken/60 enabled:hover:text-text",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <span className={clsx("shrink-0", active && "text-primary")}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

/** The wallet selector at the top of the sidebar: each wallet under
    its own icon; the dropdown switches the whole app to another wallet,
    and its rows can be dragged into the order the vault then keeps. */
function WalletSwitcher({
  wallets,
  activeWalletId,
  collapsed,
}: {
  wallets: WalletMeta[];
  activeWalletId: string | null;
  collapsed: boolean;
}) {
  const { openWallet, setAddWalletOpen, masked, unit } = useUi();
  const syncOf = useWalletSyncOf();
  // Under a name, its balance: hidden when amounts are, and a dash
  // until the wallet's first sync has answered.
  const balanceOf = (wallet: WalletMeta) =>
    masked
      ? MASKED
      : isFirstSync(syncOf(wallet.id), wallet)
        ? UNKNOWN
        : formatAmount(wallet.cached.balance.total, unit);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = wallets.find((wallet) => wallet.id === activeWalletId) ?? null;
  const ActiveGlyph = walletGlyph(active?.icon ?? "wallet");
  // Moved from here or from the settings, the new order shows at once.
  const { shown, reorder } = useWalletOrder(wallets);
  const drag = useDragReorder(shown, reorder);
  const movable = shown.length > 1;

  // Click outside and Escape both close; focus returns to the trigger.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [
          ...(menuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []),
        ];
        if (items.length === 0) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next =
          event.key === "ArrowDown"
            ? items[(index + 1) % items.length]
            : items[(index - 1 + items.length) % items.length];
        next.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLElement>("[aria-checked='true']")?.focus();
    }
  }, [open]);

  if (wallets.length === 0) {
    return (
      <div className={collapsed ? "px-2" : "px-3"}>
        <button
          type="button"
          onClick={() => setAddWalletOpen(true)}
          title={collapsed ? "Add a wallet" : undefined}
          aria-label="Add a wallet"
          className={clsx(
            "flex w-full cursor-pointer items-center rounded-md border border-dashed border-border",
            "font-ui text-sm text-muted transition-colors duration-150 hover:bg-sunken/60 hover:text-text",
            collapsed ? "h-10 justify-center" : "gap-2 px-3 py-2.5",
          )}
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
          {!collapsed && "Add a wallet"}
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={clsx("relative", collapsed ? "px-2" : "px-3")}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? (active ? active.name : "Switch wallet") : undefined}
        aria-label={active ? `Wallet: ${active.name}` : "Switch wallet"}
        className={clsx(
          "flex w-full cursor-pointer items-center rounded-md bg-sunken/70",
          "transition-colors duration-150 hover:bg-sunken",
          collapsed ? "h-10 justify-center" : "gap-2.5 px-3 py-2",
        )}
      >
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-primary"
        >
          {/* `data-icon` names the glyph for a test, which should not read
              a class. */}
          <ActiveGlyph size={15} strokeWidth={1.5} data-icon={active?.icon ?? "wallet"} />
        </span>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate font-ui text-sm font-medium text-text">
                {active?.name ?? "Select a wallet"}
              </span>
              {active && (
                <span className="tabular truncate text-[11px] text-muted">
                  {balanceOf(active)}
                </span>
              )}
            </span>
            <ChevronsUpDown
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="shrink-0 text-muted"
            />
          </>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Wallets"
          className={clsx(
            "absolute z-40 flex max-h-[60vh] flex-col rounded-md bg-surface p-1.5 shadow-overlay",
            collapsed ? "left-full top-0 ml-2 w-64" : "left-3 right-3 top-full mt-1.5",
          )}
        >
          {/* Only the wallets scroll: "Add a wallet" stays in sight under
              them, however many there are. */}
          <div ref={drag.listRef} role="none" className="relative min-h-0 overflow-y-auto">
          {shown.map((wallet, index) => {
            const current = wallet.id === activeWalletId;
            const Glyph = walletGlyph(wallet.icon);
            const dragging = drag.dragging === index;
            return (
              // The grip sits beside the item, not in it: a button holds
              // no second control, and a drag must not switch wallets. The
              // wrapper is nothing to the menu: its items are the buttons.
              <div
                key={wallet.id}
                role="none"
                {...drag.rowProps(index)}
                className={clsx(
                  "group relative",
                  dragging && "z-10 rounded-md bg-surface opacity-80",
                )}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  tabIndex={-1}
                  onClick={() => {
                    setOpen(false);
                    openWallet(wallet.id);
                  }}
                  className={clsx(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-md py-2 pl-2.5 text-left",
                    "transition-colors duration-150 group-hover:bg-sunken/70",
                    movable ? "pr-10" : "pr-2.5",
                    current ? "bg-sunken/50" : undefined,
                  )}
                >
                  <Glyph
                    size={15}
                    strokeWidth={1.5}
                    aria-hidden
                    data-icon={wallet.icon}
                    className="shrink-0 text-muted"
                  />
                  {/* Two lines: the name gets the full width, the balance
                      reads below it — names are the thing being chosen. */}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-ui text-sm font-medium text-text">
                      {wallet.name}
                    </span>
                    <span className="tabular truncate text-[11px] text-muted">
                      {balanceOf(wallet)}
                    </span>
                  </span>
                  {current && (
                    <Check
                      size={14}
                      strokeWidth={2}
                      aria-hidden
                      className="shrink-0 text-primary"
                    />
                  )}
                </button>
                {movable && (
                  // A 40px hand for a 14px glyph: the desktop minimum target.
                  <span
                    aria-hidden
                    title="Drag to reorder"
                    {...drag.handleProps(index)}
                    className={clsx(
                      "absolute right-0 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-sm text-muted",
                      "transition-opacity duration-150 group-hover:opacity-100",
                      dragging ? "cursor-grabbing opacity-100" : "cursor-grab opacity-0",
                    )}
                  >
                    <GripVertical size={14} strokeWidth={1.5} />
                  </span>
                )}
              </div>
            );
          })}
          <DropLine y={drag.lineY} />
          </div>
          <div aria-hidden className="mx-1 my-1 h-px shrink-0 bg-border/60" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              setAddWalletOpen(true);
            }}
            className="flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left font-ui text-sm text-muted transition-colors duration-150 hover:bg-sunken/70 hover:text-text"
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden className="shrink-0" />
            Add a wallet
          </button>
        </div>
      )}
    </div>
  );
}
