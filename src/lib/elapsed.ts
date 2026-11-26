// Time gone by, read on two clocks at once.
//
// The wall clock is what the system says the time is, and anyone at
// the keyboard can turn it back. The monotonic one cannot be turned
// back, but it may stand still while the computer sleeps. Each covers
// the other: a span has run out when either says so, and a wall clock
// that went backwards, or now counts less than the monotonic one, is
// read as run out too. A clock that runs fast only ends the span
// early, which is the safe side.

/** A moment, on both clocks, in milliseconds. */
export interface Stamp {
  wall: number;
  mono: number;
}

/** How far the wall clock may fall behind the monotonic one before it
    reads as turned back: the two drift apart by a little on their own. */
const DRIFT_MS = 2_000;

export function stamp(): Stamp {
  return { wall: Date.now(), mono: performance.now() };
}

/** Whether `seconds` have gone by since `since`, or the wall clock was
    turned back since. */
export function reached(since: Stamp, seconds: number, at: Stamp = stamp()): boolean {
  const wall = at.wall - since.wall;
  const mono = at.mono - since.mono;
  const limit = seconds * 1_000;
  return wall >= limit || mono >= limit || wall < 0 || wall < mono - DRIFT_MS;
}
