import { afterEach, describe, expect, it, vi } from "vitest";
import { beginExcursion, excursionSince, onExcursionEnd, openFilePicker } from "./excursion";
import { OPENS_A_WINDOW } from "./ipc";

const files = import.meta.glob(["../../src-tauri/src/lib.rs"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const lib = Object.values(files)[0];

/** The commands of the Rust side whose body opens a file dialog. A
    command's body runs from its `fn` to the first brace closing at the
    start of a line. */
function commandsOpeningADialog(source: string): string[] {
  const found: string[] = [];
  const command = /#\[tauri::command\][^]*?\bfn (\w+)\b([^]*?)\n\}/g;
  for (const [, name, body] of source.matchAll(command)) {
    if (/\bfile_dialog\(/.test(body)) found.push(name);
  }
  return found.sort();
}

describe("the windows Gerfaut opens itself", () => {
  it("calls every command that opens a dialog as an excursion", () => {
    // A new one left out would lock the window behind its own dialog
    // under "Immediately", and count the time spent in it as away.
    expect(commandsOpeningADialog(lib)).toEqual([...OPENS_A_WINDOW].sort());
  });
});

describe("an excursion begun by hand", () => {
  it("ends once, however often its end is called", () => {
    const ended = vi.fn();
    const stop = onExcursionEnd(ended);
    const end = beginExcursion();
    const other = beginExcursion();
    end();
    end();
    // The second is still open: a double end must not close it.
    expect(excursionSince()).not.toBeNull();
    expect(ended).not.toHaveBeenCalled();
    other();
    expect(excursionSince()).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("the file picker of an input", () => {
  let input: HTMLInputElement;
  const ended = vi.fn();
  let stop = () => {};

  function open() {
    input = document.createElement("input");
    input.type = "file";
    document.body.append(input);
    stop = onExcursionEnd(ended);
    const clicked = vi.fn();
    input.addEventListener("click", clicked);
    openFilePicker(input);
    expect(clicked).toHaveBeenCalled();
    expect(excursionSince()).not.toBeNull();
  }

  afterEach(() => {
    window.dispatchEvent(new FocusEvent("focus"));
    input.remove();
    stop();
    ended.mockClear();
  });

  it("is an excursion until a file is chosen", () => {
    open();
    input.dispatchEvent(new Event("change"));
    expect(excursionSince()).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("is an excursion until the picker is cancelled", () => {
    open();
    input.dispatchEvent(new Event("cancel"));
    expect(excursionSince()).toBeNull();
  });

  it("is an excursion until the window has the focus back, whichever comes first", () => {
    open();
    window.dispatchEvent(new FocusEvent("focus"));
    expect(excursionSince()).toBeNull();
    // The change that follows the focus ends nothing more.
    const other = beginExcursion();
    input.dispatchEvent(new Event("change"));
    expect(excursionSince()).not.toBeNull();
    other();
    expect(ended).toHaveBeenCalledTimes(2);
  });
});
