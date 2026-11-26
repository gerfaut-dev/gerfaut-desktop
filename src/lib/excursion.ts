// The windows Gerfaut opens itself: a file dialog, a save dialog, the
// system's file picker, and the camera while the scanner shows it.
//
// While one is open the window loses the focus and nobody touches it,
// and neither is someone leaving the desk: the auto-lock reads neither
// as an absence. The commands that open one are wrapped in `ipc.ts`,
// in one place, so no caller can forget to say it; a file input opens
// its picker through `openFilePicker`.

import { stamp } from "./elapsed";
import type { Stamp } from "./elapsed";

let open = 0;
let since: Stamp | null = null;
const ends = new Set<(startedAt: Stamp) => void>();

/** Since when a window Gerfaut opened has been in front of it; null
    when none is. */
export function excursionSince(): Stamp | null {
  return since;
}

/** Calls `listener` each time the last open window closes, with the
    moment the first one opened. */
export function onExcursionEnd(listener: (startedAt: Stamp) => void): () => void {
  ends.add(listener);
  return () => ends.delete(listener);
}

/** Starts an excursion, and hands back what ends it. Ending it twice
    is ending it once. */
export function beginExcursion(): () => void {
  if (open++ === 0) since = stamp();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    if (--open === 0 && since !== null) {
      const startedAt = since;
      since = null;
      for (const listener of ends) listener(startedAt);
    }
  };
}

/** Runs `run`, which opens a window of its own, as an excursion: from
    the call to its answer, however it ends. */
export async function excursion<T>(run: () => Promise<T>): Promise<T> {
  const end = beginExcursion();
  try {
    return await run();
  } finally {
    end();
  }
}

/** Opens the system's file picker behind `input` as an excursion, from
    the click to the first of: a file chosen, the picker cancelled, the
    focus back on the window. The last covers an engine that tells of no
    cancel; a picker that never opens is ended by the auto-lock's limit
    on excursions. */
export function openFilePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  const end = beginExcursion();
  const back = () => {
    end();
    input.removeEventListener("change", back);
    input.removeEventListener("cancel", back);
    window.removeEventListener("focus", back);
  };
  input.addEventListener("change", back);
  input.addEventListener("cancel", back);
  window.addEventListener("focus", back);
  input.click();
}
