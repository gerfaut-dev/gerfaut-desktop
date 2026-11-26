import { Shapes } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { clsx } from "clsx";
import { Button } from "../../components/Button";
import type { WalletIconId } from "../../lib/ipc";
import { WALLET_ICON, WALLET_ICON_LABEL, WALLET_ICON_SECTIONS } from "../../lib/walletIcons";

/** Tiles in a row of the grid, in every section. */
const COLUMNS = 8;

/** The grid as the eye reads it: each section's icons cut into rows of
    eight, the sections one under the other. */
const ROWS: readonly (readonly WalletIconId[])[] = WALLET_ICON_SECTIONS.flatMap(({ icons }) =>
  Array.from({ length: Math.ceil(icons.length / COLUMNS) }, (_, row) =>
    icons.slice(row * COLUMNS, (row + 1) * COLUMNS),
  ),
);

/** Every icon in reading order, for Left, Right, Home and End. */
const ORDER: readonly WalletIconId[] = ROWS.flat();

/** Where an arrow key goes from an icon. Left and Right walk the reading
    order and wrap; Up and Down keep the column, landing on the last tile
    of a shorter row, and stop at the first and last rows. */
function step(from: WalletIconId, key: string): WalletIconId {
  if (key === "ArrowRight" || key === "ArrowLeft") {
    const index = ORDER.indexOf(from) + (key === "ArrowRight" ? 1 : -1);
    return ORDER[(index + ORDER.length) % ORDER.length];
  }
  const row = ROWS.findIndex((icons) => icons.includes(from));
  const target = ROWS[row + (key === "ArrowDown" ? 1 : -1)];
  if (!target) return from;
  return target[Math.min(ROWS[row].indexOf(from), target.length - 1)];
}

/** Gap kept between the popover and the edge of what shows it. */
const EDGE = 8;

/** The part of the window an element can show in: the window cut by
    every ancestor that clips its overflow. */
function visibleBounds(node: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  const bounds = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const rect = parent.getBoundingClientRect();
    bounds.top = Math.max(bounds.top, rect.top);
    bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    bounds.left = Math.max(bounds.left, rect.left);
    bounds.right = Math.min(bounds.right, rect.right);
  }
  return bounds;
}

/** The Icon action of a wallet row and the popover it opens: the icons
    in a grid of eight, under two section titles, the current one marked.
    Arrow keys move, Enter and Space choose, Escape, Tab and a click
    outside close, and focus returns to the action. The popover opens
    under the action, or above it when there is no room below. */
export function WalletIconPicker({
  name,
  value,
  disabled = false,
  onChoose,
}: {
  /** The wallet's name, for the group's accessible name. */
  name: string;
  value: WalletIconId;
  disabled?: boolean;
  onChoose: (icon: WalletIconId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const groupId = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) rootRef.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus();
  };

  // Placed before it paints: under the action when it fits, above it
  // when only that side does, else on whichever side has more room,
  // cut to that room and scrolled inside, so no row is out of reach.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const group = groupRef.current;
    if (!open || !root || !group) return;
    const anchor = root.getBoundingClientRect();
    const height = group.scrollHeight;
    const bounds = visibleBounds(root);
    const below = bounds.bottom - anchor.bottom - EDGE;
    const over = anchor.top - bounds.top - EDGE;
    const up = height > below && over > below;
    const room = up ? over : below;
    setAbove(up);
    setMaxHeight(height > room ? room : undefined);
    setAlignLeft(anchor.right - group.offsetWidth < bounds.left + EDGE);
  }, [open]);

  // Focus lands on the current icon; a click anywhere else closes.
  useEffect(() => {
    if (!open) return;
    groupRef.current?.querySelector<HTMLElement>("[aria-checked='true']")?.focus();
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const focusIcon = (icon: WalletIconId) =>
    groupRef.current?.querySelector<HTMLElement>(`[data-icon='${icon}']`)?.focus();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = (document.activeElement as HTMLElement | null)?.dataset.icon as WalletIconId | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft":
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        focusIcon(from ? step(from, event.key) : value);
        break;
      case "Home":
        event.preventDefault();
        focusIcon(ORDER[0]);
        break;
      case "End":
        event.preventDefault();
        focusIcon(ORDER[ORDER.length - 1]);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        // Leaving closes, and the focus goes back to the action rather
        // than being dropped with the group it was standing in.
        event.preventDefault();
        close(true);
        break;
    }
  };

  const choose = (icon: WalletIconId) => {
    close(true);
    if (icon !== value) onChoose(icon);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? groupId : undefined}
        onClick={() => setOpen(!open)}
        icon={Shapes}
      >
        Icon
      </Button>
      {open && (
        <div
          ref={groupRef}
          id={groupId}
          role="radiogroup"
          aria-label={`Icon of ${name}`}
          onKeyDown={onKeyDown}
          style={maxHeight === undefined ? undefined : { maxHeight }}
          className={clsx(
            "absolute z-30 flex flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface p-1.5 shadow-overlay",
            above ? "bottom-full mb-1.5" : "top-full mt-1.5",
            alignLeft ? "left-0" : "right-0",
          )}
        >
          {WALLET_ICON_SECTIONS.map((section) => (
            <Section key={section.title} title={section.title} icons={section.icons} value={value} onChoose={choose} />
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icons,
  value,
  onChoose,
}: {
  title: string;
  icons: readonly WalletIconId[];
  value: WalletIconId;
  onChoose: (icon: WalletIconId) => void;
}) {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId}>
      <div id={titleId} className="px-1 pb-1 font-ui text-xs text-muted">
        {title}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLUMNS}, 2.5rem)` }}>
        {icons.map((icon) => {
          const Glyph = WALLET_ICON[icon];
          const current = icon === value;
          return (
            <button
              key={icon}
              type="button"
              role="radio"
              data-icon={icon}
              aria-checked={current}
              aria-label={WALLET_ICON_LABEL[icon]}
              title={WALLET_ICON_LABEL[icon]}
              tabIndex={current ? 0 : -1}
              onClick={() => onChoose(icon)}
              className={clsx(
                "inline-flex size-10 cursor-pointer items-center justify-center rounded-md",
                "transition-colors duration-150 ease-out active:scale-[0.96]",
                current
                  ? "bg-sunken text-primary ring-2 ring-inset ring-primary"
                  : "text-muted hover:bg-sunken hover:text-text",
              )}
            >
              <Glyph size={20} strokeWidth={1.5} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
