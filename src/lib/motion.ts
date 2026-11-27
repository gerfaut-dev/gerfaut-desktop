import { useEffect, useRef, useState } from "react";
import tokens from "../styles/tokens.css?raw";

export type MotionDuration = "fast" | "base" | "slow" | "turn" | "hold";

/** A duration token, in milliseconds, read from tokens.css itself: a
    timer that waits on a motion (the "Copied" hold, a surface leaving)
    keeps the same value as the stylesheet, with no copy of it here. */
function read(token: MotionDuration): number {
  const match = new RegExp(`--motion-${token}:\\s*([\\d.]+)(m?s);`).exec(tokens);
  if (!match) throw new Error(`tokens.css has no --motion-${token}`);
  const value = Number(match[1]);
  return match[2] === "s" ? value * 1000 : value;
}

export const motionMs: Record<MotionDuration, number> = {
  fast: read("fast"),
  base: read("base"),
  slow: read("slow"),
  turn: read("turn"),
  hold: read("hold"),
};

/** Keeps a surface Radix does not manage (a menu, the toast, the lock)
    in the tree while it leaves. `mounted` stays true for `exit` after
    `open` turns false; `leaving` marks that time, when the surface is
    already gone for the keyboard and for assistive technologies. */
export function useExit(open: boolean, exit: MotionDuration) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    const timer = setTimeout(() => setMounted(false), motionMs[exit]);
    return () => clearTimeout(timer);
  }, [open, mounted, exit]);

  return { mounted: open || mounted, leaving: !open && mounted };
}

/** The fade on the spot of a block whose state changes after it first
    showed: loading to content, an icon to its confirmation, no data yet
    to a figure. The first render cuts, so a view opened on a state
    already known does not fade in. Key the block on the same state, so
    each change replays the fade. */
export function useSwap(state: unknown): string {
  const [first] = useState(state);
  const [moved, setMoved] = useState(false);
  const changed = !Object.is(state, first);
  if (changed && !moved) setMoved(true);
  return moved || changed ? "animate-swap" : "";
}

/** The loop of an action in progress: it keeps turning until the turn
    under way is over, so the icon never snaps back mid-turn: the end
    of the turn is the animation's next iteration, or one full turn if
    that event never comes. Under reduced motion it stops at once. */
export function useSpin(active: boolean) {
  const [spinning, setSpinning] = useState(active);
  if (active && !spinning) setSpinning(true);

  useEffect(() => {
    if (active || !spinning) return;
    // Standing still, there is no turn to finish.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setSpinning(false), still ? 0 : motionMs.turn);
    return () => clearTimeout(timer);
  }, [active, spinning]);

  return {
    spinning: active || spinning,
    onAnimationIteration: active ? undefined : () => setSpinning(false),
  };
}

const EASE = /--motion-ease:\s*([^;]+);/.exec(tokens)?.[1];

/** The fade on the spot for a block that must stay the same element
    (a live region is only read out reliably if it is not replaced):
    it replays the fade on the element itself when `state` changes. */
export function useFadeOnChange<T extends Element>(state: unknown) {
  const ref = useRef<T>(null);
  const last = useRef(state);
  useEffect(() => {
    if (Object.is(last.current, state)) return;
    last.current = state;
    ref.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
      duration: motionMs.base,
      easing: EASE,
    });
  }, [state]);
  return ref;
}
