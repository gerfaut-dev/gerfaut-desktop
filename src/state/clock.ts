// The time the lines that say "… ago" are drawn at.
//
// "Synced 2 min ago" is worked out when it is drawn, and nothing else
// draws a page left open again: it said "just now" an hour later. One
// timer for every line that reads the time, running while the window is
// visible and something reads it, and a beat at once when the window
// comes back into view.

import { useSyncExternalStore } from "react";

/** How often the lines move on: minutes are what they print. */
export const CLOCK_TICK_MS = 30_000;

let now = Date.now();
const readers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function visible(): boolean {
  return document.visibilityState === "visible";
}

function beat(): void {
  now = Date.now();
  for (const reader of readers) reader();
}

/** Runs the timer exactly while it has a reader and a visible window. */
function arm(): void {
  if (timer !== null) clearInterval(timer);
  timer = readers.size > 0 && visible() ? setInterval(beat, CLOCK_TICK_MS) : null;
}

function onVisibility(): void {
  if (visible()) beat();
  arm();
}

function subscribe(reader: () => void): () => void {
  readers.add(reader);
  if (readers.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    arm();
  }
  return () => {
    readers.delete(reader);
    if (readers.size === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      arm();
    }
  };
}

function snapshot(): number {
  // Nobody kept the time while nobody read it: the first line drawn
  // after that would date a sync from hours ago "just now". Taken again
  // only when a second has gone by, so two reads in one render agree;
  // either way, for a system clock set back.
  if (readers.size === 0 && Math.abs(Date.now() - now) >= 1000) now = Date.now();
  return now;
}

/** Calls `listener` on every beat: every `CLOCK_TICK_MS` while the
    window is visible, and at once when it comes back into view. For
    what runs on the time without drawing it. */
export function onBeat(listener: () => void): () => void {
  return subscribe(listener);
}

/** The time, in milliseconds, moving on every `CLOCK_TICK_MS`. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot);
}
