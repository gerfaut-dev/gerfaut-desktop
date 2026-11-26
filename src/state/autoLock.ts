// The lock coming back on its own once its owner has been away.
//
// On a computer, leaving is standing up: the window stays in front and
// never loses the focus, so a delay counted from a change of window
// would never lock in the case that matters. What is counted is the
// time since the last gesture in Gerfaut — a key, a click, and the
// mouse, the wheel or a touch over the focused window — whether the
// window is in front or not.
//
// "Immediately" locks as soon as the window loses the focus or is
// hidden, and after a minute without a gesture while it stays in
// front: immediately cannot mean no second of stillness in front of
// the person reading.
//
// The count lives in memory alone: a window closed and opened again
// asks for the secret whatever the delay.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Settings } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import { reached, stamp } from "../lib/elapsed";
import type { Stamp } from "../lib/elapsed";
import { excursionSince, onExcursionEnd } from "../lib/excursion";
import { useLock } from "./lock";
import { keys, useSettings } from "./queries";

/** The delays on offer, in seconds; 0 is "Immediately". */
export const LOCK_DELAYS = [0, 60, 300, 900] as const;
export type LockDelay = (typeof LOCK_DELAYS)[number];

/** Five minutes: long enough to read a transaction through, no longer
    than a workstation is expected to stay open unattended. */
export const DEFAULT_LOCK_DELAY: LockDelay = 300;

/** Where the delay is kept, among the preferences of this app. */
export const LOCK_DELAY_PREF = "lock.delay";

/** Without a gesture, "Immediately" still locks after this long while
    the window stays in front. */
const IMMEDIATE_IDLE_SECS = 60;

/** A window Gerfaut opened stops counting as Gerfaut in use after this
    long, open still or closed: the delay decides then, from the last
    gesture before it. */
const EXCURSION_LIMIT_SECS = 600;

const CHECK_EVERY_MS = 5_000;

/** How long after a window Gerfaut opened closes its own window may
    take to get the focus back. */
const FOCUS_SETTLE_MS = 2_000;

/** Gestures are noted at most this often: the mouse moving over the
    window fires many times a second. */
const NOTE_EVERY_MS = 1_000;

/** The delay a stored preference says; one absent or not on offer is
    the default. */
export function lockDelayOf(value: string | undefined): LockDelay {
  if (value === undefined || !/^\d+$/.test(value)) return DEFAULT_LOCK_DELAY;
  const seconds = Number(value);
  return LOCK_DELAYS.find((delay) => delay === seconds) ?? DEFAULT_LOCK_DELAY;
}

/** The delay the vault holds. */
export function useLockDelay(): LockDelay {
  return lockDelayOf(useSettings().data?.app_prefs[LOCK_DELAY_PREF]);
}

/** Writes the delay. The choice moves once the vault has taken it, so a
    refusal leaves the delay that still applies on screen. */
export function useSetLockDelay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (delay: LockDelay) => ipc.setAppPref(LOCK_DELAY_PREF, String(delay)),
    onSuccess: (_, delay) =>
      client.setQueryData<Settings>(keys.settings, (cached) =>
        cached === undefined
          ? cached
          : { ...cached, app_prefs: { ...cached.app_prefs, [LOCK_DELAY_PREF]: String(delay) } },
      ),
  });
}

/** Locks once the delay has run out since the last gesture. Runs while
    a lock exists and the app is open; a new delay counts from the
    moment it is chosen. */
export function useAutoLock(): void {
  const lock = useLock((state) => state.lock);
  const locked = useLock((state) => state.locked);
  const delay = useLockDelay();
  const active = lock !== null && !locked;

  useEffect(() => {
    if (!active) return;
    const idle = delay === 0 ? IMMEDIATE_IDLE_SECS : delay;
    let last: Stamp = stamp();

    // Away in a window Gerfaut opened, and not for too long yet.
    const excused = (at: Stamp) => {
      const since = excursionSince();
      return since !== null && !reached(since, EXCURSION_LIMIT_SECS, at);
    };
    const expired = (at: Stamp) => !excused(at) && reached(last, idle, at);

    const check = () => {
      if (expired(stamp())) useLock.getState().lockNow();
    };

    // A gesture after an absence is the one that comes back: the time
    // is checked before it is taken as Gerfaut in use, or a key pressed
    // on return would move the count on before the lock had its say.
    // True when it locked.
    const note = () => {
      const at = stamp();
      if (expired(at)) {
        useLock.getState().lockNow();
        return true;
      }
      if (at.mono - last.mono >= NOTE_EVERY_MS) last = at;
      return false;
    };
    // The key or the press that finds the delay run out locks, and goes
    // no further: Enter on a focused button, or a letter in a field,
    // would otherwise act on the app the lock is falling over.
    const noteAction = (event: Event) => {
      if (note()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    // The mouse moving, the wheel turning or a finger landing reach a
    // window behind another one too: they count only over the focused
    // window. A key or a press arrives with the focus, or gives it.
    // A pointer that did not move is no gesture: some webviews send a
    // move after a scroll, or when a popup passes under a still cursor.
    let pointer: { x: number; y: number } | null = null;
    const noteOver = (event: Event) => {
      if (event instanceof MouseEvent && event.type === "pointermove") {
        const moved = pointer === null || pointer.x !== event.screenX || pointer.y !== event.screenY;
        pointer = { x: event.screenX, y: event.screenY };
        if (!moved) return;
      }
      if (document.hasFocus()) note();
    };

    const away = () => {
      if (delay === 0 && !excused(stamp())) useLock.getState().lockNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") away();
      else check();
    };

    let settle: ReturnType<typeof setTimeout> | undefined;
    const stopEnds = onExcursionEnd((startedAt) => {
      if (reached(startedAt, EXCURSION_LIMIT_SECS)) check();
      else {
        last = stamp();
        // Under "Immediately", a window Gerfaut opened that closes while
        // another app has the focus leaves no blur to come. The focus
        // comes back from a dialog a beat around its answer: asked again
        // once that beat is over.
        if (delay === 0) {
          clearTimeout(settle);
          settle = setTimeout(() => {
            if (!document.hasFocus()) useLock.getState().lockNow();
          }, FOCUS_SETTLE_MS);
        }
      }
    });

    // Not passive: the one that locks is cancelled.
    const actions = ["keydown", "pointerdown"] as const;
    for (const name of actions) window.addEventListener(name, noteAction, { capture: true });
    const passing = ["pointermove", "wheel", "touchstart"] as const;
    for (const name of passing) {
      window.addEventListener(name, noteOver, { capture: true, passive: true });
    }
    window.addEventListener("blur", away);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(check, CHECK_EVERY_MS);

    return () => {
      for (const name of actions) window.removeEventListener(name, noteAction, { capture: true });
      for (const name of passing) window.removeEventListener(name, noteOver, { capture: true });
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(timer);
      clearTimeout(settle);
      stopEnds();
    };
  }, [active, delay]);
}
