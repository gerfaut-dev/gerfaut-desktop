import { useSpin } from "../lib/motion";
import { ChevronDown, ChevronUp, LoaderCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Button as UiButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Every labelled button is filled: a word alone with no fill and no
    edge does not read as something to press.

    - `primary` — an action that stands on its own: a card's action, a
      form that saves, the yes of a dialog.
    - `secondary` — the way out beside it (Cancel, Back, Later), one of
      several equal choices (two sources, two outputs), and the actions
      a list repeats on every row.
    - `danger` — the yes of a destructive confirmation only, never the
      button that opens it. */
type Variant = "primary" | "secondary" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the role is a choice made where the button is used. */
  variant: Variant;
  /** `sm` for a list row, a notice or a header line: 40px, the
      desktop's smallest target. */
  size?: "md" | "sm";
  /** The glyph before the label, which the spinner takes over while
      busy: one slot, so the label does not move. */
  icon?: LucideIcon;
  /** Working on it: a spinner, and the fill it had rather than the
      hollow of a button that is off. It is busy: clicks are ignored,
      but the button keeps the keyboard focus it was pressed with.
      Passed at all, even false, the button holds the spinner's place. */
  busy?: boolean;
  /** The words while busy, when they are not the label's ("Adding…"
      for "Add wallet"). Both are laid out at once, so the button is as
      wide as the longer one and nothing moves when they swap. */
  busyLabel?: ReactNode;
  /** A secondary on a tinted panel (a notice): Neige with a hairline,
      where Givre would read dirty. Dark keeps its fill. */
  onTint?: boolean;
  /** The element itself, for a caller that hands the focus back to it. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size = "md",
  icon: Icon,
  busy: busyProp,
  busyLabel,
  onTint = false,
  disabled = false,
  type = "button",
  onClick,
  className,
  children,
  ...rest
}: Props) {
  const busy = busyProp === true;
  // The spinner finishes the turn it started, even while it fades out.
  const spin = useSpin(busy);
  // A button that can be busy carries both states at once, stacked in
  // one grid row: the glyph column holds the icon and the spinner, the
  // label column the label and the busy words. What is not shown sits
  // at opacity 0 and keeps its room, so the old state fades into the
  // new one on the spot. A label without busy words of its own stays
  // put; with no icon it spans the glyph column, centred, so a button
  // at rest does not keep a blank where the spinner will come.
  const canBusy = busyProp !== undefined || busyLabel !== undefined;
  const busyWords = busyLabel ?? (Icon || !canBusy ? undefined : children);
  const swaps = busyWords !== undefined;
  const glyphColumn = Icon !== undefined || canBusy;
  return (
    <UiButton
      // First, so nothing passed here can undo the busy state below.
      {...rest}
      variant={variant}
      size={size}
      type={type}
      // A busy button stays focusable; a submit one is switched off
      // outright, or Enter in a field of its form would send it again.
      disabled={disabled || (busy && type === "submit")}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={busy ? (event) => event.preventDefault() : onClick}
      className={cn(
        variant === "secondary" &&
          onTint &&
          "bg-surface shadow-[inset_0_0_0_1px_var(--color-border)] live:hover:bg-background dark:bg-sunken dark:shadow-none dark:live:hover:bg-border",
        className,
      )}
    >
      <span className={cn("grid items-center", glyphColumn && "grid-cols-[auto_auto] gap-x-2")}>
        {Icon && (
          <Icon
            size={ICON_SIZE}
            strokeWidth={1.5}
            aria-hidden
            className={cn("col-start-1 row-start-1", fade(!busy))}
          />
        )}
        {canBusy && (
          <LoaderCircle
            size={ICON_SIZE}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "col-start-1 row-start-1",
              fade(busy),
              spin.spinning && "motion-safe:animate-spin",
            )}
            onAnimationIteration={spin.onAnimationIteration}
          />
        )}
        <span
          aria-hidden={(swaps && busy) || undefined}
          className={cn(
            "row-start-1",
            Icon ? "col-start-2" : glyphColumn && "col-span-2 col-start-1 justify-self-center",
            swaps && fade(!busy),
          )}
        >
          {children}
        </span>
        {swaps && (
          <span
            aria-hidden={!busy || undefined}
            className={cn("col-start-2 row-start-1", fade(busy))}
          >
            {busyWords}
          </span>
        )}
      </span>
    </UiButton>
  );
}

/** The glyph of a labelled button, and of its spinner. */
const ICON_SIZE = 16;

/** One state of a busy button fading into the other, on the spot: the
    state pace, and an opacity only, so reduced motion keeps it. */
function fade(shown: boolean) {
  return cn("transition-opacity duration-base", !shown && "opacity-0");
}

/** 40px square icon button for toolbars. */
export function IconButton({
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <UiButton
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={className}
      {...rest}
    />
  );
}

/** Shows or hides the part of the page under it. Not an action, so no
    fill: it keeps the voice of a heading, with the chevron that says it
    opens. The one labelled button left without a fill. */
export function Disclosure({
  open,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { open: boolean }) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <UiButton
      variant="ghost"
      aria-expanded={open}
      // The voice of a heading, not of an action: no press scale.
      className={cn("h-10 px-2 live:active:scale-100", className)}
      {...rest}
    >
      <Chevron size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />
      {children}
    </UiButton>
  );
}
