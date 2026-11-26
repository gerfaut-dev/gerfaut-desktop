import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLock, Settings } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import { coreCase } from "../test/core";
import { lockDelayOf, useAutoLock } from "./autoLock";
import { useLock } from "./lock";
import { keys } from "./queries";

const PIN: AppLock = { kind: "pin", biometric: false };
const realLockNow = useLock.getState().lockNow;

/** The vault, with the delay stored as `delay` or none at all. */
function settingsWith(delay?: string): Settings {
  return {
    ...coreCase<Settings>("Settings", "fresh"),
    app_lock: PIN,
    app_prefs: delay === undefined ? {} : { "lock.delay": delay },
  };
}

/** A file dialog the person has not answered yet. */
let closeDialog: () => void = () => {};

function mount(delay?: string) {
  let stored = settingsWith(delay);
  mockIPC((cmd) => {
    if (cmd === "get_settings") return stored;
    if (cmd === "lock_app") return undefined;
    if (cmd === "pick_backup_file") {
      return new Promise((resolve) => {
        closeDialog = () => resolve(null);
      });
    }
    throw new Error(`unexpected command ${cmd}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(keys.settings, stored);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useAutoLock(), { wrapper });
  return {
    /** The delay changed in Settings, as the vault now holds it. */
    choose: (next: string) => {
      stored = settingsWith(next);
      act(() => {
        client.setQueryData(keys.settings, stored);
        // The cache tells its readers on the next turn of the timers.
        vi.advanceTimersByTime(0);
      });
    },
  };
}

function wait(seconds: number) {
  act(() => vi.advanceTimersByTime(seconds * 1_000));
}

function press() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  });
}

function leaveWindow() {
  act(() => {
    window.dispatchEvent(new FocusEvent("blur"));
  });
}

const locked = () => useLock.getState().locked;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"],
  });
  useLock.setState({ lock: PIN, locked: false, seen: true, lockNow: realLockNow });
});

afterEach(async () => {
  // A dialog a test left open would hold the next test's lock off.
  closeDialog();
  await act(async () => {});
  vi.useRealTimers();
});

describe("the delay a stored preference says", () => {
  it("is five minutes when absent or not one on offer", () => {
    expect(lockDelayOf(undefined)).toBe(300);
    expect(lockDelayOf("45")).toBe(300);
    expect(lockDelayOf("")).toBe(300);
    expect(lockDelayOf("never")).toBe(300);
    expect(lockDelayOf("-60")).toBe(300);
  });

  it("is the one stored when it is on offer", () => {
    expect(lockDelayOf("0")).toBe(0);
    expect(lockDelayOf("60")).toBe(60);
    expect(lockDelayOf("900")).toBe(900);
  });
});

describe("locking when away", () => {
  it("locks after five minutes without a gesture when no delay was chosen", () => {
    mount();
    wait(299);
    expect(locked()).toBe(false);
    wait(2);
    expect(locked()).toBe(true);
  });

  it("follows the delay the vault holds", () => {
    mount("900");
    wait(895);
    expect(locked()).toBe(false);
    wait(10);
    expect(locked()).toBe(true);
  });

  it("counts from the last gesture", () => {
    mount();
    wait(200);
    press();
    wait(200);
    expect(locked()).toBe(false);
    wait(101);
    expect(locked()).toBe(true);
  });

  it("counts the mouse only over the focused window", () => {
    mount("60");
    const focus = vi.spyOn(document, "hasFocus");
    wait(50);
    focus.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove"));
    });
    wait(11);
    expect(locked()).toBe(true);

    useLock.setState({ locked: false });
    wait(50);
    focus.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove"));
    });
    wait(11);
    expect(locked()).toBe(false);
    focus.mockRestore();
  });

  it("counts the wheel and a touch only over the focused window", () => {
    mount("60");
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    wait(30);
    act(() => {
      window.dispatchEvent(new WheelEvent("wheel"));
    });
    wait(20);
    act(() => {
      window.dispatchEvent(new Event("touchstart"));
    });
    wait(11);
    expect(locked()).toBe(true);
    focus.mockRestore();
  });

  it("locks at the first key after an absence, before taking it as use", () => {
    // The check every few seconds may not have run while the window
    // sat behind another one; the key pressed on return must not move
    // the count on first.
    mount("60");
    act(() => vi.setSystemTime(Date.now() + 120_000));
    press();
    expect(locked()).toBe(true);
  });

  it("keeps the key or the press that locks from reaching the app", () => {
    mount("60");
    const reached: string[] = [];
    const listen = (event: Event) => reached.push(event.type);
    document.addEventListener("keydown", listen);
    document.addEventListener("pointerdown", listen);
    // Sent at the page, so it passes the window on the way down.
    const send = (event: Event) => {
      act(() => {
        document.body.dispatchEvent(event);
      });
      return event;
    };

    // In use: the gesture goes on to the app untouched.
    const key = send(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(key.defaultPrevented).toBe(false);

    act(() => vi.setSystemTime(Date.now() + 120_000));
    const enter = send(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(locked()).toBe(true);
    expect(enter.defaultPrevented).toBe(true);

    act(() => useLock.setState({ locked: false }));
    act(() => vi.setSystemTime(Date.now() + 120_000));
    const press = send(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    expect(locked()).toBe(true);
    expect(press.defaultPrevented).toBe(true);

    expect(reached).toEqual(["keydown"]);
    document.removeEventListener("keydown", listen);
    document.removeEventListener("pointerdown", listen);
  });

  it("locks when the clock is turned back", () => {
    // Turned back by less than the time gone by: the wall clock still
    // says time passed, only less than the monotonic one.
    mount();
    wait(100);
    act(() => vi.setSystemTime(Date.now() - 50_000));
    wait(5);
    expect(locked()).toBe(true);
  });

  it("locks when the clock is set before the last gesture", () => {
    // Read at once, when the window takes the focus back: no time has
    // gone by on the monotonic clock yet.
    mount();
    act(() => {
      vi.setSystemTime(Date.now() - 1_000);
      window.dispatchEvent(new FocusEvent("focus"));
    });
    expect(locked()).toBe(true);
  });

  it("locks on the monotonic clock when the wall clock says less", () => {
    mount();
    wait(298);
    // A second and a half taken off the wall clock: still within the
    // drift the two are allowed, so only the monotonic clock is past
    // the delay when the next check comes.
    act(() => vi.setSystemTime(Date.now() - 1_500));
    expect(locked()).toBe(false);
    wait(2);
    expect(locked()).toBe(true);
  });

  it("does not lock when the window loses the focus under a delay", () => {
    mount("60");
    leaveWindow();
    wait(30);
    expect(locked()).toBe(false);
  });

  it("starts the count again when the delay changes", () => {
    const vault = mount();
    wait(250);
    vault.choose("60");
    wait(59);
    expect(locked()).toBe(false);
    wait(2);
    expect(locked()).toBe(true);
  });
});

describe("locking immediately", () => {
  it("locks as soon as the window loses the focus", () => {
    mount("0");
    leaveWindow();
    expect(locked()).toBe(true);
  });

  it("locks as soon as the window is hidden", () => {
    mount("0");
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(locked()).toBe(true);
    visibility.mockRestore();
  });

  it("locks after a minute without a gesture while the window stays in front", () => {
    mount("0");
    wait(59);
    expect(locked()).toBe(false);
    wait(2);
    expect(locked()).toBe(true);
  });
});

describe("a window Gerfaut opens itself", () => {
  it("is not leaving: the focus it takes does not lock", async () => {
    mount("0");
    const picked = ipc.pickBackupFile();
    leaveWindow();
    wait(30);
    expect(locked()).toBe(false);

    closeDialog();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    await act(async () => {
      await picked;
    });
    // Back from the dialog counts as a gesture.
    wait(59);
    expect(locked()).toBe(false);
  });

  it("closing while another app has the focus locks under Immediately", async () => {
    mount("0");
    const picked = ipc.pickBackupFile();
    leaveWindow();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    closeDialog();
    await act(async () => {
      await picked;
    });
    expect(locked()).toBe(false);
    wait(3);
    expect(locked()).toBe(true);
  });

  it("does not count as time away", async () => {
    mount("60");
    const picked = ipc.pickBackupFile();
    wait(300);
    expect(locked()).toBe(false);

    closeDialog();
    await act(async () => {
      await picked;
    });
    wait(59);
    expect(locked()).toBe(false);
    wait(2);
    expect(locked()).toBe(true);
  });

  it("lets the delay decide once it has been up ten minutes", () => {
    mount();
    void ipc.pickBackupFile();
    wait(599);
    expect(locked()).toBe(false);
    wait(6);
    expect(locked()).toBe(true);
  });
});

describe("with nothing to lock", () => {
  it("runs no count without a lock, nor behind the lock screen", () => {
    const lockNow = vi.fn();
    useLock.setState({ lock: null, locked: false, lockNow });
    mount("0");
    leaveWindow();
    wait(3_600);
    expect(lockNow).not.toHaveBeenCalled();

    act(() => useLock.setState({ lock: PIN, locked: true }));
    leaveWindow();
    wait(3_600);
    expect(lockNow).not.toHaveBeenCalled();
  });
});
