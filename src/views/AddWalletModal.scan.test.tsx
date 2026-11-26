import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { encode } from "uqr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedInput, QrProgress, RecognizedKind } from "../lib/ipc";
import { useUi } from "../state/store";
import { AddWalletModal } from "./AddWalletModal";

// Unlike the other scanner tests, nothing stands in for the decoder
// here: a real QR code is drawn into the camera frame and the scanner's
// own jsQR reads it, so what reaches the core is what a camera pointed
// at that code would give. Keys are the public BIP-32 and BIP-84 test
// vectors; the checksums are the ones the core computes for them. How
// the core classifies a descriptor is the core's own tests' concern.
const ABANDON = "[73c5da0a/84'/0'/0']xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V";
const VECTOR_1_0H = "[3442193e/0']xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw";
const VECTOR_1 = "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
const VECTOR_2 = "xpub661MyMwAqRbcFW31YEwpkMuc5THy2PSt5bDMsktWQcFF8syAmRUapSCGu8ED9W6oDMSgv6Zz8idoc4a6mr8BDzTJY47LJhkJ8UB7WEGuduB";
const VECTOR_3 = "xpub661MyMwAqRbcEZVB4dScxMAdx6d4nFc9nvyvH3v4gJL378CSRZiYmhRoP7mBy6gSPSCYk6SzXPTf3ND1cZAceL7SfJ1Z3GC8vBgp2epUt13";

const SINGLE_KEY = `wpkh(${ABANDON}/0/*)#wc3n3van`;
const MULTISIG = `wsh(sortedmulti(2,${ABANDON}/<0;1>/*,${VECTOR_1_0H}/<0;1>/*,${VECTOR_2}/<0;1>/*))#zwweshjl`;
/** Four keys and a timelocked recovery key: a dense code, version 18
    at the lowest error correction. */
const LIANA = `wsh(or_d(multi(2,${ABANDON}/<0;1>/*,${VECTOR_1_0H}/<0;1>/*,${VECTOR_2}/<0;1>/*,${VECTOR_1}/<0;1>/*),and_v(v:pkh(${VECTOR_3}/<0;1>/*),older(52560))))#ldtr8t0z`;

const WIDTH = 640;
const HEIGHT = 480;

/** A camera frame holding `text` as a QR code, dark on light, centred. */
function cameraFrame(text: string): Uint8ClampedArray {
  const { data, size } = encode(text, { ecc: "L", border: 4 });
  const scale = Math.floor(Math.min(WIDTH, HEIGHT) / size);
  const left = Math.floor((WIDTH - size * scale) / 2);
  const top = Math.floor((HEIGHT - size * scale) / 2);
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(255);
  for (let y = 0; y < size * scale; y++) {
    for (let x = 0; x < size * scale; x++) {
      if (!data[Math.floor(y / scale)][Math.floor(x / scale)]) continue;
      const at = ((top + y) * WIDTH + left + x) * 4;
      pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
    }
  }
  return pixels;
}

/** The camera, showing `text` as a QR code on every frame. */
function pointCameraAt(text: string) {
  const pixels = cameraFrame(text);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 4,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => WIDTH,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => HEIGHT,
  });
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels, width: WIDTH, height: HEIGHT })),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  // Frames 200 ms apart, past the scanner's decode throttle.
  let now = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback((now += 200)), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
}

/** What the core answers: the descriptor for the descriptor's text,
    and for any other text, the address a scanner that kept the wrong
    part of the code would have led to. */
function parsedAs(kind: RecognizedKind, input: string, descriptor: string): ParsedInput {
  if (input.trim() !== descriptor) {
    return {
      kind: "address",
      networks: ["mainnet"],
      payload: { type: "address", address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu" },
      warnings: [],
      script_options: [],
      derivation: null,
      derivation_editable: false,
      preview_address: null,
    };
  }
  return {
    kind,
    networks: ["mainnet"],
    payload: {
      type: "descriptors",
      external: "wsh(...)#aaaaaaaa",
      internal: "wsh(...)#bbbbbbbb",
      script: "witness_script",
    },
    warnings: [],
    script_options: [],
    derivation: null,
    derivation_editable: false,
    preview_address: "bc1qpreview",
  };
}

describe("AddWalletModal, a descriptor scanned from a plain QR code", () => {
  beforeEach(() => {
    useUi.setState({ addWalletOpen: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A trailing line break is how some wallets end the text, and the
  // decoder hands it over with the rest.
  it.each([
    ["a single-key descriptor", SINGLE_KEY, SINGLE_KEY, "descriptor", "Output descriptor"],
    ["a multipath multisig", MULTISIG, MULTISIG, "multipath_descriptor", "Multipath descriptor (BIP-389)"],
    ["a dense Liana policy", LIANA, LIANA, "multipath_descriptor", "Multipath descriptor (BIP-389)"],
    ["a text ending in a line break", `${LIANA}\r\n`, LIANA, "multipath_descriptor", "Multipath descriptor (BIP-389)"],
  ] as const)("%s reaches the core as the same text pasted", { timeout: 15_000 }, async (_, text, descriptor, kind, label) => {
    pointCameraAt(text);
    const asked: string[] = [];
    mockIPC((cmd, args) => {
      switch (cmd) {
        case "open_qr_scan":
          return 1;
        case "close_qr_scan":
          return null;
        // What the core answers for a plain frame: the frame itself.
        case "push_qr_frame": {
          const { frame } = args as { frame: string };
          const progress: QrProgress = {
            format: "plain",
            received: 1,
            total: 1,
            complete: true,
            text: frame,
            warnings: [],
          };
          return progress;
        }
        case "parse_input":
          asked.push((args as { input: string }).input);
          return parsedAs(kind, (args as { input: string }).input, descriptor);
        default:
          return undefined;
      }
    });
    useUi.setState({ addWalletOpen: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AddWalletModal activeNetwork="mainnet" />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText(/descriptor, extended public key/i), {
      target: { value: text },
    });
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/recognized as/i);
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.click(screen.getByRole("button", { name: /scan a qr code/i }));
    await vi.waitFor(() => expect(asked).toHaveLength(2), { timeout: 5000 });
    const [pasted, scanned] = asked;
    // The core reads both after trimming them.
    expect(scanned).toBe(descriptor);
    expect(pasted.trim()).toBe(descriptor);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText("Single address")).not.toBeInTheDocument();
  });
});
