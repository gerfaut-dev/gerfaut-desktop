import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BackendCheck,
  BackendConfig,
  PreferencesChange,
  ScannedBackend,
  Settings,
  WalletMeta,
} from "../lib/ipc";
import { PRIVATE_KEY_NOT_A_SERVER } from "../lib/ipc";
import { useBackendSave } from "../state/backendSave";
import { useWallets } from "../state/queries";
import { useUi } from "../state/store";
import { coreCase } from "../test/core";
import { PREFERENCES, PRICE_TABLE } from "../test/fixtures";
import { BackendSection } from "./settings/BackendSection";
import { SettingsView } from "./SettingsView";

// The camera is a button that hands one code over, the way the scanner
// does once its frames assemble. What it takes to decode them is the
// scanner's own test; what the form does with the result is this one.
const scan = vi.hoisted(() => ({ code: "", privateKey: undefined as string | undefined }));

vi.mock("../components/ScanQrModal", () => ({
  ScanQrModal: ({
    open,
    onScan,
    onClose,
    privateKey,
  }: {
    open: boolean;
    onScan: (text: string) => void;
    onClose: () => void;
    privateKey?: string;
  }) => {
    // What the screen asks the scanner to say of a private key.
    scan.privateKey = privateKey;
    return open ? (
      <button
        type="button"
        onClick={() => {
          onScan(scan.code);
          onClose();
        }}
      >
        code in view
      </button>
    ) : null;
  },
}));

/** A workspace already pointed at an Electrum server over TLS: the form
    a scan comes to overwrite. */
const SETTINGS: Settings = {
  active_network: "mainnet",
  backends: { mainnet: { type: "custom_electrum", url: "ssl://node.local:50002" } },
  gap_limit: 20,
  app_prefs: {},
  electrum_certs: {},
  app_lock: null,
  tor: { mode: "auto", socks_proxy: null },
  preferences: PREFERENCES,
};

function renderBackend(
  onSave: (config: BackendConfig) => void = () => {},
  settings: Settings = SETTINGS,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BackendSection
        network="mainnet"
        settings={settings}
        onSave={async (config) => onSave(config)}
      />
    </QueryClientProvider>,
  );
}

/** Answers the commands the section makes on its own, plus the address
    the core reads out of the scan. */
/** What the core's watch takes, for the words under "This is my node". */
const LIVE_LIMITS = {
  any: { per_wallet: 200, total: 2_000 },
  own_node: { per_wallet: 20_000, total: 20_000 },
};

function mockBackendIpc(reply: ScannedBackend | { error: string; kind?: string }) {
  const calls: { cmd: string; args: unknown }[] = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "public_servers") return [];
    if (cmd === "inspect_certificate")
      return { host: "node.local:50002", status: { type: "trusted" } };
    if (cmd === "parse_backend") {
      if ("error" in reply)
        return Promise.reject({ kind: reply.kind ?? "server", message: reply.error }) as never;
      return reply;
    }
    if (cmd === "live_limits") return LIVE_LIMITS;
    throw new Error(`unexpected command ${cmd}`);
  });
  return calls;
}

async function scanCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  scan.code = code;
  await user.click(screen.getByRole("button", { name: /scan a server address/i }));
  await user.click(await screen.findByRole("button", { name: "code in view" }));
}

/** What a field holds right now. */
function field(name: string): HTMLInputElement {
  return screen.getByLabelText(name) as HTMLInputElement;
}

function toggle(name: string): HTMLElement {
  return screen.getByRole("switch", { name });
}

afterEach(() => {
  vi.clearAllMocks();
  useBackendSave.setState(useBackendSave.getInitialState());
});

describe("saving a server address", () => {
  /** The webview offers back what was typed in a field before: the
      address of someone's node is kept out of that memory, and out of
      the spell checker. */
  it("keeps the address out of the webview's memory", () => {
    mockBackendIpc({ error: "unused" });
    renderBackend();
    for (const name of ["Host", "Port"]) {
      expect(field(name)).toHaveAttribute("autocomplete", "off");
    }
    expect(field("Host")).toHaveAttribute("spellcheck", "false");
    cleanup();
    renderBackend(() => {}, {
      ...SETTINGS,
      backends: { mainnet: { type: "custom_esplora", url: "https://node.local/api" } },
    });
    expect(field("Server URL")).toHaveAttribute("autocomplete", "off");
    expect(field("Server URL")).toHaveAttribute("spellcheck", "false");
  });

  /** An Esplora server read over plain HTTP is in the clear as much as
      an Electrum one without TLS, and says so the same way; over Tor,
      or over HTTPS, it is not. */
  it("says an http Esplora server travels in the clear", async () => {
    mockBackendIpc({ error: "unused" });
    renderBackend(() => {}, {
      ...SETTINGS,
      backends: { mainnet: { type: "custom_esplora", url: "https://node.local/api" } },
    });
    const clear = /everything travels in the clear/;
    expect(screen.queryByText(clear)).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.clear(field("Server URL"));
    await user.type(field("Server URL"), "http://192.168.1.20:3002/api");
    expect(screen.getByText(clear)).toBeInTheDocument();
    await user.clear(field("Server URL"));
    await user.type(field("Server URL"), "http://abcdef.ONION/api");
    expect(screen.queryByText(clear)).not.toBeInTheDocument();
  });

  /** A port typed into the host field: the core would only call the
      whole a bad IPv6 literal, so the section says where the port goes
      before anything is asked of it. */
  it("says the port belongs in its own field", async () => {
    const calls = mockBackendIpc({ error: "unused" });
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config));
    const user = userEvent.setup();
    await user.clear(field("Host"));
    await user.type(field("Host"), "abcdef.onion:50001");
    await user.click(screen.getByRole("button", { name: "Save backend" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The host holds a port. Put abcdef.onion in the host field and the port in its own.",
    );
    expect(saved).toEqual([]);
    expect(calls.map((call) => call.cmd)).not.toContain("inspect_certificate");

    // Typing drops the note: it no longer describes the field.
    await user.type(field("Host"), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /** A key or a seed typed as the host, its port after it, is the
      core's to refuse as private material: the note on the port would
      quote it back, under the button and on every page. */
  it.each([
    ["an extended private key", "xprv9s21ZrQH143Kexample:50002"],
    ["a seed phrase", `${Array(11).fill("abandon").join(" ")} about:50002`],
  ])("never quotes %s typed with a port", async (_, typed) => {
    const calls = mockBackendIpc({
      kind: "private_material",
      error: "input contains private key material and was rejected",
    });
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config));
    const user = userEvent.setup();
    await user.clear(field("Host"));
    await user.type(field("Host"), typed);
    await user.click(screen.getByRole("button", { name: "Save backend" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(PRIVATE_KEY_NOT_A_SERVER);
    expect(alert.textContent).not.toContain(typed.split(":")[0]!.split(" ")[0]);
    expect(useBackendSave.getState().refusals.mainnet?.message).toBe(PRIVATE_KEY_NOT_A_SERVER);
    expect(saved).toEqual([]);
    expect(calls.map((call) => call.cmd)).not.toContain("inspect_certificate");
  });

  /** Words are no host name: the core says the address has a space in
      it, and the note on the port does not quote them back. */
  it("never quotes words typed with a port", async () => {
    const reason = "invalid server address: the address has a space in it";
    mockBackendIpc({ error: reason });
    renderBackend(() => undefined);
    const user = userEvent.setup();
    await user.clear(field("Host"));
    await user.type(field("Host"), `${Array(10).fill("abandon").join(" ")} about:50002`);
    await user.click(screen.getByRole("button", { name: "Save backend" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(reason);
  });

  /** An address the core refuses is refused before its certificate is
      looked at: taken for a server that did not answer, it read
      "Saved" while nothing was. */
  it("says in the core's words why an address is refused, and saves nothing", async () => {
    const reason =
      "invalid server: [abcdef.onion:50001] is not a host name: invalid IPv6 address";
    const calls = mockBackendIpc({ error: reason });
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config));
    const user = userEvent.setup();
    await user.clear(field("Host"));
    await user.type(field("Host"), "[[abcdef.onion:50001]");
    await user.click(screen.getByRole("button", { name: "Save backend" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(reason);
    expect(saved).toEqual([]);
    expect(calls.map((call) => call.cmd)).not.toContain("inspect_certificate");
  });

  // One refusal used to stand for every network: a refusal on one
  // replaced the other's, and back on the first the form showed the
  // stored server with no reason at all.
  it("keeps a refusal per network", async () => {
    mockBackendIpc({ error: "unused" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const on = (network: "mainnet" | "signet") => (
      <QueryClientProvider client={client}>
        <BackendSection network={network} settings={SETTINGS} onSave={async () => {}} />
      </QueryClientProvider>
    );
    const { rerender } = render(on("mainnet"));
    const user = userEvent.setup();
    const refuseHere = async (host: string) => {
      await user.click(screen.getByRole("radio", { name: /my own electrum server/i }));
      await user.clear(field("Host"));
      await user.type(field("Host"), host);
      await user.click(screen.getByRole("button", { name: "Save backend" }));
    };

    await refuseHere("main.example.org:50002");
    expect(await screen.findByRole("alert")).toHaveTextContent("Put main.example.org in the host");

    rerender(on("signet"));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await refuseHere("test.example.org:50002");
    expect(await screen.findByRole("alert")).toHaveTextContent("Put test.example.org in the host");

    rerender(on("mainnet"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Put main.example.org in the host");
    expect(field("Host")).toHaveValue("main.example.org:50002");

    // Typing on mainnet takes back mainnet's line, and signet's stays.
    await user.type(field("Host"), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(on("signet"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Put test.example.org in the host");
  });

  /** A public server the catalogue no longer lists is no longer
      asked: the core tries the public servers in turn, and the card
      says so rather than showing Automatic as if it had been the
      choice. The note is about the value chosen: it goes at the first
      other choice, Automatic included, and is a panel under the card. */
  describe("a server the catalogue no longer offers", () => {
    const RETIRED = {
      ...SETTINGS,
      backends: {
        mainnet: { type: "public_esplora", server: "electrum:retired.example.org" },
      },
      retired_servers: { mainnet: "retired.example.org" },
    } as Settings;
    const SAYS =
      /The server you chose, retired\.example\.org, is no longer offered\. Gerfaut tries the public servers in turn until you choose another\./;

    function mockServers() {
      mockIPC((cmd) => {
        if (cmd === "public_servers")
          return [
            {
              id: "electrum:other.example.org",
              label: "other.example.org",
              protocol: "electrum",
              url: "ssl://other.example.org:50002",
              self_signed: false,
            },
          ];
        return undefined;
      });
    }

    it("is said under the card, and the list holds it as the value chosen", async () => {
      mockServers();
      renderBackend(() => {}, RETIRED);
      const note = await screen.findByText(SAYS);
      expect(note.closest("section")).toBeNull();
      expect(screen.getByRole("combobox", { name: "Public server" })).toHaveTextContent(
        "retired.example.org",
      );
    });

    it("goes at the first server picked", async () => {
      mockServers();
      renderBackend(() => {}, RETIRED);
      const user = userEvent.setup();
      expect(await screen.findByText(SAYS)).toBeInTheDocument();
      await user.click(screen.getByRole("combobox", { name: "Public server" }));
      await user.click(await screen.findByRole("option", { name: /other\.example\.org/ }));
      expect(screen.queryByText(/is no longer offered/)).not.toBeInTheDocument();
    });

    it("goes when Automatic is picked, without a save", async () => {
      mockServers();
      renderBackend(() => {}, RETIRED);
      const user = userEvent.setup();
      expect(await screen.findByText(SAYS)).toBeInTheDocument();
      await user.click(screen.getByRole("combobox", { name: "Public server" }));
      await user.click(await screen.findByRole("option", { name: /Automatic/ }));
      expect(screen.queryByText(/is no longer offered/)).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Public server" })).toHaveTextContent("Automatic");
    });
  });

  it("says nothing of a retired server for a network that has none", async () => {
    mockIPC((cmd) => (cmd === "public_servers" ? [] : undefined));
    renderBackend(() => {}, {
      ...SETTINGS,
      backends: { mainnet: { type: "public_esplora" } },
      retired_servers: { signet: "retired.example.org" },
    });
    await screen.findByRole("combobox", { name: "Public server" });
    expect(screen.queryByText(/is no longer offered/)).not.toBeInTheDocument();
  });

  it("says why the core would not store a setting", async () => {
    mockBackendIpc({
      kind: "electrum",
      url: "ssl://node.local:50002",
      host: "node.local",
      port: 50002,
      tls: true,
      onion: false,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <BackendSection
          network="mainnet"
          settings={SETTINGS}
          onSave={() => Promise.reject({ kind: "vault", message: "vault i/o error: disk full" })}
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save backend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("vault i/o error: disk full");
  });
});

describe("testing the backend once saved", () => {
  /** The section's own commands, an address the core reads as given,
      and a test answered when the test chooses. */
  function mockCheckIpc(
    options: { stored?: () => Promise<void>; cancelled?: () => Promise<boolean> } = {},
  ) {
    const checks: unknown[] = [];
    const cancels: unknown[] = [];
    let answer: (check: BackendCheck) => void = () => {};
    let fail: (error: unknown) => void = () => {};
    mockIPC((cmd, args) => {
      if (cmd === "cancel_backend_check") {
        cancels.push(args);
        return options.cancelled?.() ?? true;
      }
      if (cmd === "public_servers") return [];
      if (cmd === "live_limits") return LIVE_LIMITS;
      if (cmd === "inspect_certificate") return { host: "node.local:50002", status: "trusted" };
      if (cmd === "parse_backend") return { kind: "electrum", url: "", host: "", port: null, tls: true, onion: false };
      if (cmd === "check_backend") {
        checks.push(args);
        return new Promise<BackendCheck>((resolve, reject) => {
          answer = resolve;
          fail = reject;
        });
      }
      throw new Error(`unexpected command ${cmd}`);
    });
    return {
      checks,
      cancels,
      answer: (check: BackendCheck) => act(async () => answer(check)),
      fail: (error: unknown) => act(async () => fail(error)),
      stored: options.stored,
    };
  }

  function renderStored(config: BackendConfig, onSave: () => Promise<void> = async () => {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <BackendSection
          network="mainnet"
          settings={{ ...SETTINGS, backends: { mainnet: config } }}
          onSave={onSave}
        />
      </QueryClientProvider>,
    );
  }

  const ELECTRUM: BackendConfig = { type: "custom_electrum", url: "ssl://node.local:50002" };
  const save = () => screen.getByRole("button", { name: "Save backend" });
  const status = () => screen.getByRole("status");

  it("says it is testing, then what the server answered", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());

    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));
    expect(core.checks).toEqual([{ network: "mainnet" }]);
    // One test at a time: the button that would start another is busy.
    expect(save()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Test again" })).not.toBeInTheDocument();

    await core.answer(coreCase<BackendCheck>("BackendCheck", "reached_electrum"));
    expect(status()).toHaveTextContent("Connected to electrum.example.org:50002");
    expect(status()).toHaveTextContent("Block 912 345 · Fulcrum 2.1.3 · 840 ms");
    expect(save()).not.toHaveAttribute("aria-busy");
    // The note the test replaced is gone for good.
    expect(screen.queryByText(/certificate is unchecked/)).not.toBeInTheDocument();
  });

  it("warns that a test through Tor takes longer, and says it went through Tor", async () => {
    const core = mockCheckIpc();
    renderStored({
      type: "custom_esplora",
      url: "http://fixturefixturefixturefixturefixturefixturefixturefixture.onion/api",
    });
    const user = userEvent.setup();
    await user.click(save());

    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Testing the connection through Tor. This can take a minute or two.",
      ),
    );
    await core.answer(coreCase<BackendCheck>("BackendCheck", "reached_esplora_over_tor"));
    expect(status()).toHaveTextContent("Block 912 345 · through Tor · 14.2 s");
  });

  const failed = (fields: Partial<Extract<BackendCheck, { outcome: "failed" }>>): BackendCheck => ({
    outcome: "failed",
    host: "node.local:50002",
    problem: "failed",
    detail: "",
    server_network: null,
    tor: false,
    ...fields,
  });
  const ESPLORA: BackendConfig = { type: "custom_esplora", url: "https://node.local/api" };

  it.each<[string, BackendConfig, BackendCheck, string, string]>([
    [
      "a closed port",
      ELECTRUM,
      coreCase<BackendCheck>("BackendCheck", "refused"),
      "Could not connect to electrum.example.org:50001",
      "The server refused the connection. Check the port, and that the server is running.",
    ],
    [
      "a server of another network",
      ELECTRUM,
      coreCase<BackendCheck>("BackendCheck", "another_network"),
      "Could not connect to electrum.example.org:50002",
      "This server follows Testnet 4, not Mainnet. Use a Mainnet server.",
    ],
    [
      "TLS on an Electrum port without it",
      ELECTRUM,
      failed({ problem: "not_tls" }),
      "Could not connect to node.local:50002",
      "This port does not use TLS. Turn TLS off, or use the server's TLS port (often 50002).",
    ],
    [
      "https on an Esplora server without it",
      ESPLORA,
      failed({ host: "node.local", problem: "not_tls" }),
      "Could not connect to node.local",
      "This address does not use HTTPS. Use http:// instead.",
    ],
    [
      "an onion with no Tor to be had",
      ELECTRUM,
      failed({ host: "", problem: "tor", detail: "no Tor proxy answers at 127.0.0.1:9050", tor: true }),
      "Could not connect",
      "Tor is not available: no Tor proxy answers at 127.0.0.1:9050. Check Settings › Network › Tor, then test again.",
    ],
    [
      "an onion service that does not answer",
      ELECTRUM,
      failed({ host: "abcdef.onion:50001", problem: "no_answer", tor: true }),
      "Could not connect to abcdef.onion:50001",
      "The onion service does not answer. Check the address and that your node is online, then test again.",
    ],
    [
      "a certificate Esplora cannot accept",
      ESPLORA,
      failed({ host: "node.local", problem: "certificate" }),
      "Could not connect to node.local",
      "No public authority vouches for this server's certificate. Use one that a public authority signed, or reach the server through Tor.",
    ],
  ])("says what to do about %s", async (_, config, check, title, advice) => {
    const core = mockCheckIpc();
    renderStored(config);
    const user = userEvent.setup();
    await user.click(save());
    await core.answer(check);

    expect(status()).toHaveTextContent(title);
    expect(status()).toHaveTextContent(advice);
    expect(screen.getByRole("button", { name: "Test again" })).toBeInTheDocument();
  });

  /** A backend that does not work costs no funds and tells no one
      anything: amber, the colour of what is worth reading, not red. */
  it("reads a failure in amber, never in red", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await core.answer(coreCase<BackendCheck>("BackendCheck", "refused"));
    const notice = within(status()).getByText(/The server refused the connection/).closest("div.border")!;
    expect(notice.className).toContain("text-pending");
    expect(notice.className).not.toContain("text-alert");
  });

  it("says a test the core could not run failed, in its words", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await core.fail({ kind: "vault", message: "vault i/o error: unreadable settings" });

    expect(status()).toHaveTextContent("Could not connect");
    expect(status()).toHaveTextContent("The test failed: vault i/o error: unreadable settings");
  });

  it("tests the stored backend again on request", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await core.answer(coreCase<BackendCheck>("BackendCheck", "refused"));

    await user.click(screen.getByRole("button", { name: "Test again" }));
    expect(core.checks).toEqual([{ network: "mainnet" }, { network: "mainnet" }]);
    expect(status()).toHaveTextContent("Testing the connection…");
    expect(status()).not.toHaveTextContent("refused the connection");
    // The keyboard stays on the form while Test again is away.
    expect(save()).toHaveFocus();
    expect(save()).toHaveAttribute("aria-busy", "true");
    await user.click(save());
    expect(core.checks).toHaveLength(2);

    await core.answer(coreCase<BackendCheck>("BackendCheck", "reached_electrum"));
    expect(status()).toHaveTextContent("Connected to electrum.example.org:50002");
  });

  it("takes the result back once the form changes", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await core.answer(coreCase<BackendCheck>("BackendCheck", "refused"));
    expect(status()).toHaveTextContent("refused the connection");

    await user.type(field("Port"), "1");
    expect(status()).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: "Test again" })).not.toBeInTheDocument();
  });

  const cancel = () => screen.getByRole("button", { name: "Cancel the connection test" });
  const CANCELLED = coreCase<BackendCheck>("BackendCheck", "cancelled");

  /** What a cancelled test leaves: the backend saved, said untested. */
  function expectCancelled() {
    expect(status()).toHaveTextContent("Test cancelled");
    expect(status()).toHaveTextContent("The backend is saved, but not tested.");
    expect(within(status()).getByRole("button", { name: "Test again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel the connection test" })).not.toBeInTheDocument();
  }

  it("stops the test under way on Cancel, in the core and on screen", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));
    // The word on the button is the plain one; its name says what it stops.
    expect(cancel()).toHaveTextContent(/^Cancel$/);

    await user.click(cancel());
    expectCancelled();
    expect(core.cancels).toEqual([{ network: "mainnet" }]);
    expect(save()).not.toHaveAttribute("aria-busy");
  });

  it.each<[string, BackendCheck]>([
    ["a server that answered", coreCase<BackendCheck>("BackendCheck", "reached_electrum")],
    ["a server that refused", coreCase<BackendCheck>("BackendCheck", "refused")],
  ])("keeps a cancelled test cancelled when %s lands late", async (_, late) => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));
    await user.click(cancel());

    await core.answer(late);
    expectCancelled();
  });

  it("says a test the core cancelled itself was cancelled", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await core.answer(CANCELLED);

    expectCancelled();
    expect(save()).not.toHaveAttribute("aria-busy");
  });

  it("starts the next test once the core has stopped the cancelled one", async () => {
    let stopped: (was: boolean) => void = () => {};
    const core = mockCheckIpc({
      cancelled: () =>
        new Promise<boolean>((resolve) => {
          stopped = resolve;
        }),
    });
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(core.checks).toHaveLength(1));
    await user.click(cancel());
    await user.click(screen.getByRole("button", { name: "Test again" }));
    expect(status()).toHaveTextContent("Testing the connection…");
    // Sent first, the new test would be the one the cancel stops.
    expect(core.checks).toHaveLength(1);

    await act(async () => stopped(true));
    expect(core.checks).toHaveLength(2);
  });

  it("hands the keyboard from Cancel to Test again", async () => {
    mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));
    // Save backend keeps the focus it was pressed with, busy, and Tab
    // goes on to Cancel.
    expect(save()).toHaveFocus();
    await user.tab();
    expect(cancel()).toHaveFocus();

    await user.keyboard("{Enter}");
    expectCancelled();
    expect(within(status()).getByRole("button", { name: "Test again" })).toHaveFocus();
  });

  it("hands the keyboard on to Test again when the test ends under Cancel", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));
    await user.tab();
    expect(cancel()).toHaveFocus();

    await core.answer(coreCase<BackendCheck>("BackendCheck", "reached_electrum"));
    expect(screen.getByRole("button", { name: "Test again" })).toHaveFocus();
  });

  it("leaves the focus where it is when the test ends elsewhere", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));

    await core.answer(coreCase<BackendCheck>("BackendCheck", "reached_electrum"));
    expect(save()).toHaveFocus();
  });

  it("cancels the test under way once the form changes", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM);
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));

    await user.type(field("Port"), "1");
    expect(core.cancels).toEqual([{ network: "mainnet" }]);
    expect(status()).toHaveTextContent("");
    expect(save()).not.toHaveAttribute("aria-busy");
    // What the core still answers is about an address no longer shown.
    await core.answer(CANCELLED);
    expect(status()).toHaveTextContent("");
  });

  it("leaves another network's test alone when a form changes", async () => {
    const core = mockCheckIpc();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const on = (network: "mainnet" | "signet") => (
      <QueryClientProvider client={client}>
        <BackendSection
          network={network}
          settings={{ ...SETTINGS, backends: { mainnet: ELECTRUM, signet: ELECTRUM } }}
          onSave={async () => {}}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(on("mainnet"));
    const user = userEvent.setup();
    await user.click(save());
    await waitFor(() => expect(status()).toHaveTextContent("Testing the connection…"));

    rerender(on("signet"));
    await user.type(field("Port"), "1");
    expect(core.cancels).toEqual([]);
    rerender(on("mainnet"));
    expect(status()).toHaveTextContent("Testing the connection…");
    await core.answer(coreCase<BackendCheck>("BackendCheck", "reached_electrum"));
    expect(status()).toHaveTextContent("Connected to electrum.example.org:50002");
  });

  it("tests nothing the vault would not store", async () => {
    const core = mockCheckIpc();
    renderStored(ELECTRUM, () => Promise.reject({ kind: "vault", message: "vault i/o error: disk full" }));
    const user = userEvent.setup();
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("vault i/o error: disk full");
    expect(core.checks).toEqual([]);
    expect(status()).toHaveTextContent("");
  });

  it("keeps the result of each network to its own form", async () => {
    const core = mockCheckIpc();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const on = (network: "mainnet" | "signet") => (
      <QueryClientProvider client={client}>
        <BackendSection
          network={network}
          settings={{ ...SETTINGS, backends: { mainnet: ELECTRUM, signet: ELECTRUM } }}
          onSave={async () => {}}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(on("mainnet"));
    const user = userEvent.setup();
    await user.click(save());
    await core.answer(coreCase<BackendCheck>("BackendCheck", "refused"));

    rerender(on("signet"));
    expect(status()).toHaveTextContent("");
    expect(save()).not.toHaveAttribute("aria-busy");
    rerender(on("mainnet"));
    expect(status()).toHaveTextContent("refused the connection");
  });
});

describe("the TLS switch of a server typed by hand", () => {
  /** The core's reading of an address with no scheme, as `parse_backend`
      gives it: a conventional plain port, or an onion on any other one,
      means no TLS; a name it cannot read yet is refused. */
  function readLikeTheCore(input: string): ScannedBackend {
    const colon = input.lastIndexOf(":");
    const host = input.slice(0, colon);
    const port = Number(input.slice(colon + 1));
    if (!host.includes(".")) throw new Error(`${host} does not look like a server address`);
    const onion = host.endsWith(".onion");
    const tls = [50001, 60001, 20001, 50003].includes(port)
      ? false
      : [50002, 60002, 20002, 50004].includes(port)
        ? true
        : !onion;
    return { kind: "electrum", url: `${tls ? "ssl" : "tcp"}://${input}`, host, port, tls, onion };
  }

  function mockReading() {
    const read: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "public_servers") return [];
      if (cmd === "inspect_certificate") return { host: "", status: { type: "trusted" } };
      if (cmd === "live_limits") return LIVE_LIMITS;
      if (cmd === "parse_backend") {
        const input = (args as { input: string }).input;
        read.push(input);
        try {
          return readLikeTheCore(input);
        } catch (error) {
          return Promise.reject({ kind: "server", message: String(error) }) as never;
        }
      }
      throw new Error(`unexpected command ${cmd}`);
    });
    return read;
  }

  /** An empty Electrum form: nothing of one's own stored yet. */
  async function emptyForm(saved: BackendConfig[] = []) {
    renderBackend((config) => saved.push(config), { ...SETTINGS, backends: {} });
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /my own electrum server/i }));
    expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true");
    return user;
  }

  async function typePort(user: ReturnType<typeof userEvent.setup>, port: string) {
    await user.clear(field("Port"));
    await user.type(field("Port"), port);
  }

  it("turns TLS off for an onion on the plain port, and says why", async () => {
    const read = mockReading();
    const saved: BackendConfig[] = [];
    const user = await emptyForm(saved);
    await user.type(field("Host"), "gerfautexample123.onion");
    await typePort(user, "50001");

    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "false"));
    expect(
      screen.getByText("TLS turned off: Tor already encrypts the connection to an onion server."),
    ).toBeInTheDocument();
    // Read by the core, as a scanned address with no scheme.
    expect(read.at(-1)).toBe("gerfautexample123.onion:50001");

    await user.click(screen.getByRole("button", { name: "Save backend" }));
    expect(saved).toEqual([
      { type: "custom_electrum", url: "tcp://gerfautexample123.onion:50001" },
    ]);
  });

  it("follows the port back and forth, and names it", async () => {
    mockReading();
    const user = await emptyForm();
    await user.type(field("Host"), "node.example.org");
    await typePort(user, "50001");
    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("TLS turned off: port 50001 usually runs without it.")).toBeInTheDocument();

    await typePort(user, "50002");
    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByText(/TLS turned off/)).not.toBeInTheDocument();
  });

  /** A name of the local network, with no dot: the core does not read
      it as an address, so the port decides alone. */
  it("lets the port decide for a bare host name", async () => {
    const read = mockReading();
    const user = await emptyForm();
    await user.type(field("Host"), "umbrel");
    await typePort(user, "50001");

    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("TLS turned off: port 50001 usually runs without it.")).toBeInTheDocument();
    expect(read).toContain("electrum.invalid:50001");
  });

  /** An onion turned TLS off; the host is then replaced by one the
      onion reason no longer covers. The switch must not stay off with
      a reason that is no longer true. */
  it("turns TLS back on when the address that turned it off is gone", async () => {
    mockReading();
    const user = await emptyForm();
    await user.type(field("Host"), "gerfautexample123.onion");
    await typePort(user, "50005");
    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "false"));

    await user.clear(field("Host"));
    await user.type(field("Host"), "umbrel");
    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByText(/TLS turned off/)).not.toBeInTheDocument();

    // And with no address left to read at all.
    await user.type(field("Host"), ".onion");
    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "false"));
    await user.clear(field("Port"));
    await waitFor(() => expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByText(/TLS turned off/)).not.toBeInTheDocument();
  });

  it("never overrides a switch the person set", async () => {
    mockReading();
    const user = await emptyForm();
    await user.type(field("Host"), "node.example.org");
    await user.click(toggle("Use TLS"));
    await user.click(toggle("Use TLS"));
    await typePort(user, "50001");

    // Nothing to wait for: the core is no longer asked.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/TLS turned off/)).not.toBeInTheDocument();
  });

  it("leaves the switch of a stored server as it was saved", async () => {
    const read = mockReading();
    renderBackend();
    const user = userEvent.setup();
    expect(field("Host")).toHaveValue("node.local");
    await typePort(user, "50001");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true");
    expect(read).toEqual([]);
  });
});

describe("scanning a server address", () => {
  it("fills the form from the one-liner a node prints", async () => {
    const calls = mockBackendIpc({
      kind: "electrum",
      url: "tcp://gerfautexample123.onion:50001",
      host: "gerfautexample123.onion",
      port: 50001,
      tls: false,
      onion: true,
    });
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config));
    const user = userEvent.setup();
    expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true");

    await scanCode(user, "gerfautexample123.onion:50001:t");

    // Read by the core, never by the view.
    expect(calls.at(-1)).toEqual({
      cmd: "parse_backend",
      args: { input: "gerfautexample123.onion:50001:t" },
    });
    expect(field("Host")).toHaveValue("gerfautexample123.onion");
    expect(field("Port")).toHaveValue("50001");
    expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "false");
    // Filled, not saved: the person still presses Save.
    expect(saved).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Save backend" }));
    expect(saved).toEqual([
      { type: "custom_electrum", url: "tcp://gerfautexample123.onion:50001" },
    ]);
  });

  it("switches to Esplora when that is what was scanned", async () => {
    mockBackendIpc({
      kind: "esplora",
      url: "https://esplora.example.org/api",
      host: "esplora.example.org",
      port: null,
      tls: true,
      onion: false,
    });
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config));
    const user = userEvent.setup();
    expect(screen.getByRole("radio", { name: /my own electrum server/i })).toBeChecked();

    await scanCode(user, "https://esplora.example.org/api");

    // Refusing it would be pedantic: the QR says which backend it is.
    expect(screen.getByRole("radio", { name: /my own esplora/i })).toBeChecked();
    expect(field("Server URL")).toHaveValue("https://esplora.example.org/api");
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save backend" }));
    expect(saved).toEqual([
      { type: "custom_esplora", url: "https://esplora.example.org/api" },
    ]);
  });

  it("refuses wallet material in the words of the core", async () => {
    const reason = "this is an extended public key, not the address of a server";
    mockBackendIpc({ error: reason });
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config));
    const user = userEvent.setup();

    await scanCode(user, "xpub661MyMwAqRbcFexample");

    expect(await screen.findByRole("alert")).toHaveTextContent(reason);
    // Not one field moved, and the choice is where it was.
    expect(screen.getByRole("radio", { name: /my own electrum server/i })).toBeChecked();
    expect(field("Host")).toHaveValue("node.local");
    expect(field("Port")).toHaveValue("50002");
    expect(toggle("Use TLS")).toHaveAttribute("aria-checked", "true");
    expect(saved).toEqual([]);

    // Typing drops the refusal: it no longer describes the field.
    await user.type(field("Host"), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /** A private key scanned as plain text is told what this screen
      waits for, not what the wallet import does. */
  it("refuses a private key in the words of the server settings", async () => {
    mockBackendIpc({
      kind: "private_material",
      error: "input contains private key material and was rejected",
    });
    renderBackend(() => undefined);
    const user = userEvent.setup();

    await scanCode(user, "xprv9s21ZrQH143Kexample");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This holds a private key, not the address of a server. Gerfaut never takes a key: show the QR code your node prints instead.",
    );
  });

  /** The scanner it opens says a private key in this screen's words. */
  it("hands the scanner the server settings' words for a private key", async () => {
    mockBackendIpc({ error: "unused" });
    renderBackend(() => undefined);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /scan a server address/i }));
    expect(scan.privateKey).toBe(PRIVATE_KEY_NOT_A_SERVER);
  });

  it("says when the address scanned is a Tor hidden service", async () => {
    mockBackendIpc({
      kind: "electrum",
      url: "tcp://gerfautexample123.onion:50001",
      host: "gerfautexample123.onion",
      port: 50001,
      tls: false,
      onion: true,
    });
    renderBackend(() => {}, { ...SETTINGS, tor: { mode: "system", socks_proxy: null } });
    const user = userEvent.setup();
    expect(screen.queryByText(/A Tor hidden service/)).not.toBeInTheDocument();

    await scanCode(user, "gerfautexample123.onion:50001:t");

    // The core read it as an onion; the form says what that means, under
    // the onion the Tor card wears. Which Tor is that card's to say.
    const note = screen.getByText("A Tor hidden service: reached through Tor only.");
    expect(note).toBeInTheDocument();
    expect(note.querySelector("svg.gerfaut-onion")).not.toBe(null);
    expect(note.querySelector("svg.lucide-eye-off")).toBe(null);

    // A fact about the address scanned, not about whatever is typed next.
    await user.type(field("Host"), "x");
    expect(screen.queryByText(/A Tor hidden service/)).not.toBeInTheDocument();
  });

  it("says nothing of Tor for a clearnet host", async () => {
    mockBackendIpc({
      kind: "electrum",
      url: "ssl://electrum.example.org:50002",
      host: "electrum.example.org",
      port: 50002,
      tls: true,
      onion: false,
    });
    renderBackend();
    const user = userEvent.setup();

    await scanCode(user, "electrum.example.org:50002:s");

    expect(field("Host")).toHaveValue("electrum.example.org");
    expect(screen.queryByText(/A Tor hidden service/)).not.toBeInTheDocument();
  });
});

describe("this is my node", () => {
  const TRUSTED: ScannedBackend = {
    kind: "electrum",
    url: "ssl://node.local:50002",
    host: "node.local",
    port: 50002,
    tls: true,
    onion: false,
  };

  /** The core leaves the switch out of a stored backend while it is
      off, so a form that rebuilt the config from the address alone
      turned it off at every save. It is read back and sent back. */
  it("stays on when the address is saved again", async () => {
    mockBackendIpc(TRUSTED);
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config), {
      ...SETTINGS,
      backends: {
        mainnet: { type: "custom_electrum", url: "ssl://node.local:50002", own_node: true },
      },
    });
    const user = userEvent.setup();
    expect(toggle("This is my node")).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: "Save backend" }));
    await waitFor(() =>
      expect(saved).toEqual([
        { type: "custom_electrum", url: "ssl://node.local:50002", own_node: true },
      ]),
    );
  });

  it("is off for a server stored before it existed, and goes along once turned on", async () => {
    mockBackendIpc(TRUSTED);
    const saved: BackendConfig[] = [];
    renderBackend((config) => saved.push(config), {
      ...SETTINGS,
      backends: { mainnet: { type: "custom_esplora", url: "https://node.local/api" } },
    });
    const user = userEvent.setup();
    const ownNode = toggle("This is my node");
    expect(ownNode).toHaveAttribute("aria-checked", "false");
    // What it does and when to leave it off, read out with its name,
    // in the limits the core keeps.
    await waitFor(() =>
      expect(ownNode).toHaveAccessibleDescription(
        "The live watch then follows up to 20 000 addresses instead of 2 000. Leave it off for a server you do not run: it would refuse most of them, and learn every one.",
      ),
    );

    await user.click(ownNode);
    await user.click(screen.getByRole("button", { name: "Save backend" }));
    await user.click(toggle("This is my node"));
    await user.click(screen.getByRole("button", { name: "Save backend" }));
    await waitFor(() =>
      expect(saved).toEqual([
        { type: "custom_esplora", url: "https://node.local/api", own_node: true },
        { type: "custom_esplora", url: "https://node.local/api" },
      ]),
    );
  });

  /** A code read is another server, unless it is the one stored: the
      switch does not carry over to it. */
  it("goes off for another server read from a code", async () => {
    const STORED: Settings = {
      ...SETTINGS,
      backends: {
        mainnet: { type: "custom_electrum", url: "ssl://node.local:50002", own_node: true },
      },
    };
    mockBackendIpc(TRUSTED);
    const { unmount } = renderBackend(undefined, STORED);
    const user = userEvent.setup();
    await scanCode(user, "node.local:50002:s");
    expect(toggle("This is my node")).toHaveAttribute("aria-checked", "true");
    unmount();

    mockBackendIpc({
      ...TRUSTED,
      url: "ssl://electrum.example.org:50002",
      host: "electrum.example.org",
    });
    renderBackend(undefined, STORED);
    await scanCode(user, "electrum.example.org:50002:s");
    expect(field("Host")).toHaveValue("electrum.example.org");
    expect(toggle("This is my node")).toHaveAttribute("aria-checked", "false");
  });

  it("is not offered for the public servers", async () => {
    mockBackendIpc(TRUSTED);
    renderBackend();
    const user = userEvent.setup();
    expect(toggle("This is my node")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /public api/i }));
    expect(screen.queryByRole("switch", { name: "This is my node" })).not.toBeInTheDocument();
  });
});

// --- the sections --------------------------------------------------------

/** What the core answers about Tor on a machine with no daemon. */
const TOR_STATUS = {
  mode: "auto",
  socks_proxy: "127.0.0.1:9050",
  via: null,
  socks: null,
  running: false,
  bootstrapped: false,
  bootstrap_percent: 0,
  error: null,
  embedded_available: false,
};

const WALLET: WalletMeta = {
  id: "w-1",
  name: "Cold storage",
  icon: "wallet",
  network: "mainnet",
  kind: {
    type: "descriptors",
    external: "wpkh(xpub.../0/*)#aaaaaaaa",
    internal: "wpkh(xpub.../1/*)#bbbbbbbb",
    script: "segwit",
  },
  recognized_as: "extended_key",
  created_at: 1_755_000_000,
  gap_limit: 20,
  scan_gap: 20,
  labels: {},
  last_sync: null,
  cached: {
    balance: {
      confirmed: 150_000,
      trusted_pending: 0,
      untrusted_pending: 0,
      pending_net_sats: null,
      immature: 0,
      total: 150_000,
    },
    tx_count: 1,
  },
};

function renderSettings(wallets: WalletMeta[] = [WALLET], settings: Settings = SETTINGS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsView settings={settings} wallets={wallets} />
    </QueryClientProvider>,
  );
}

/** The view fed from the vault, as the app feeds it: what the wallets
    section shows after a write is what the list then says. */
function LiveSettings() {
  const wallets = useWallets();
  return <SettingsView settings={SETTINGS} wallets={wallets.data ?? []} />;
}

function renderLiveSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveSettings />
    </QueryClientProvider>,
  );
}

/** Answers what the sections ask on their own, and records every call. */
function mockSettingsIpc(
  overrides: Record<string, (args: Record<string, unknown>) => unknown> = {},
) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  mockIPC((cmd, args) => {
    const payload = (args ?? {}) as Record<string, unknown>;
    calls.push({ cmd, args: payload });
    if (overrides[cmd]) return overrides[cmd](payload);
    switch (cmd) {
      case "public_servers":
        return [];
      case "tor_status":
        return TOR_STATUS;
      case "list_wallets":
        return [WALLET];
      case "set_app_pref":
        return undefined;
      case "live_limits":
        return LIVE_LIMITS;
      case "set_preferences":
        return { ...PREFERENCES, ...(payload.change as PreferencesChange) };
      case "price_table":
        return PRICE_TABLE;
      case "live_status":
        return {
          enabled: false,
          status: {
            state: "off",
            transport: null,
            server: null,
            detail: null,
            watched_scripts: 0,
            pushed_scripts: 0,
            left_out_scripts: 0,
            left_out_wallets: 0,
            wallets: [],
          },
        };
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  });
  return calls;
}

function nav() {
  return within(screen.getByRole("navigation", { name: "Settings sections" }));
}

function heading(name: string | RegExp) {
  return screen.queryByRole("heading", { name });
}

describe("settings sections", () => {
  beforeEach(() => {
    useUi.setState({ view: "settings", settingsSection: "general" });
  });

  it("shows one section at a time and moves between them", async () => {
    mockSettingsIpc();
    renderSettings();
    const user = userEvent.setup();

    // General first: how the app reads, and nothing of the network.
    expect(heading("Display")).toBeInTheDocument();
    expect(heading("Appearance")).toBeInTheDocument();
    expect(heading("Network")).not.toBeInTheDocument();
    expect(heading("Wallets")).not.toBeInTheDocument();
    expect(nav().getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");

    await user.click(nav().getByRole("button", { name: "Network" }));
    expect(heading("Network")).toBeInTheDocument();
    expect(heading(/^Backend/)).toBeInTheDocument();
    expect(heading("Tor")).toBeInTheDocument();
    expect(heading("Display")).not.toBeInTheDocument();
    expect(nav().getByRole("button", { name: "Network" })).toHaveAttribute("aria-current", "page");
    expect(nav().getByRole("button", { name: "General" })).not.toHaveAttribute("aria-current");
    expect(useUi.getState().settingsSection).toBe("network");

    // Each of the others holds its own card and no other.
    for (const name of ["Wallets", "Security", "Notifications", "Backup & sync", "About"]) {
      await user.click(nav().getByRole("button", { name }));
      expect(heading(name)).toBeInTheDocument();
      expect(heading("Network")).not.toBeInTheDocument();
      expect(heading("Display")).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();

    // The backup card says what a backup holds in the words the phone uses.
    await user.click(nav().getByRole("button", { name: "Backup & sync" }));
    expect(
      screen.getByText(/A backup holds descriptors and addresses, never a private key or seed\.$/),
    ).toBeInTheDocument();
  });

  it("lists the seven sections in order, each with an icon", () => {
    mockSettingsIpc();
    renderSettings();
    const items = nav().getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual([
      "General",
      "Network",
      "Wallets",
      "Security",
      "Notifications",
      "Backup & sync",
      "About",
    ]);
    for (const item of items) expect(item.querySelector("svg")).not.toBeNull();
  });

  it("opens straight on the section asked for", () => {
    mockSettingsIpc();
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    expect(useUi.getState().view).toBe("settings");
    expect(heading("Wallets")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Gap limit" })).toBeInTheDocument();
    expect(screen.getByText("Cold storage")).toBeInTheDocument();
    expect(heading("Display")).not.toBeInTheDocument();
    expect(nav().getByRole("button", { name: "Wallets" })).toHaveAttribute("aria-current", "page");
  });

  it("changes a wallet's icon from the picker", async () => {
    const calls = mockSettingsIpc({ set_wallet_icon: () => undefined });
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    const user = userEvent.setup();
    const row = screen.getByText("Cold storage").closest("li")!;
    // The row wears the icon the core stores.
    expect(row.querySelector("svg.lucide-wallet")).not.toBeNull();

    await user.click(within(row).getByRole("button", { name: "Change icon of Cold storage" }));
    const group = screen.getByRole("radiogroup", { name: "Icon of Cold storage" });
    expect(within(group).getAllByRole("radio")).toHaveLength(32);
    const wallet = within(group).getByRole("radio", { name: "Wallet" });
    expect(wallet).toHaveAttribute("aria-checked", "true");
    expect(wallet).toHaveFocus();

    // Arrows move without choosing; Enter chooses.
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(within(group).getByRole("radio", { name: "Snowflake" })).toHaveFocus();
    expect(calls.filter((call) => call.cmd === "set_wallet_icon")).toHaveLength(0);
    await user.keyboard("{Enter}");
    expect(calls.filter((call) => call.cmd === "set_wallet_icon").map((call) => call.args)).toEqual([
      { id: "w-1", icon: "snowflake" },
    ]);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Change icon of Cold storage" })).toHaveFocus();
  });

  it("closes the icon picker on Escape or a click outside, choosing nothing", async () => {
    const calls = mockSettingsIpc();
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Change icon of Cold storage" });
    await user.click(trigger);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    // Left from the first icon wraps to the last one.
    await user.keyboard("{ArrowLeft}");
    const radios = screen.getAllByRole("radio");
    expect(radios[radios.length - 1]).toHaveFocus();
    await user.click(screen.getByRole("heading", { name: "Wallets" }));
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(calls.some((call) => call.cmd === "set_wallet_icon")).toBe(false);
  });

  it("closes the icon picker on Tab and hands the focus back to the action", async () => {
    const calls = mockSettingsIpc();
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Change icon of Cold storage" });
    await user.click(trigger);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(calls.some((call) => call.cmd === "set_wallet_icon")).toBe(false);
  });

  it("moves a wallet down the list from the keyboard and keeps that order", async () => {
    const second: WalletMeta = { ...WALLET, id: "w-2", name: "Lightning float", icon: "key" };
    // The vault lists the wallets in the order it was last given.
    let listed = [WALLET, second];
    const calls = mockSettingsIpc({
      reorder_wallets: (args) => {
        const ids = args.ids as string[];
        listed = ids.map((id) => listed.find((wallet) => wallet.id === id)!);
        return undefined;
      },
      list_wallets: () => listed,
    });
    act(() => useUi.getState().openSettings("wallets"));
    renderLiveSettings();
    const user = userEvent.setup();
    const card = (await screen.findByRole("heading", { name: "Wallets" })).closest("section")!;
    const names = () =>
      within(card)
        .getAllByRole("listitem")
        .map((row) => within(row).getByText(/storage|float/).textContent);
    await waitFor(() => expect(names()).toEqual(["Cold storage", "Lightning float"]));

    const row = screen.getByText("Cold storage").closest("li")!;
    // Nowhere up to go from the top; down, then, and the order is sent whole.
    expect(within(row).getByRole("button", { name: "Move up" })).toHaveAttribute("aria-disabled", "true");
    await user.click(within(row).getByRole("button", { name: "Move up" }));
    expect(calls.some((call) => call.cmd === "reorder_wallets")).toBe(false);
    // The move shows before the vault answers, and stays once it has.
    const down = within(row).getByRole("button", { name: "Move down" });
    down.focus();
    fireEvent.click(down);
    expect(names()).toEqual(["Lightning float", "Cold storage"]);
    await waitFor(() =>
      expect(calls.filter((call) => call.cmd === "reorder_wallets").map((call) => call.args)).toEqual([
        { ids: ["w-2", "w-1"] },
      ]),
    );
    await waitFor(() => expect(calls.filter((call) => call.cmd === "list_wallets")).toHaveLength(2));
    expect(names()).toEqual(["Lightning float", "Cold storage"]);
    expect(within(row).getByRole("button", { name: "Move down" })).toHaveAttribute("aria-disabled", "true");
    // The row that moved keeps the focus, on the control still usable.
    expect(within(row).getByRole("button", { name: "Move down" })).toHaveFocus();
  });

  it("removes a wallet behind a confirmation that says what goes, red on the yes alone", async () => {
    const calls = mockSettingsIpc({ remove_wallet: () => undefined });
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    const user = userEvent.setup();
    const row = screen.getByText("Cold storage").closest("li")!;
    const remove = within(row).getByRole("button", { name: "Remove" });
    // A removal is a neutral action: Alerte is kept for coins moving.
    expect(remove.className).not.toMatch(/alert/);

    await user.click(remove);
    expect(calls.some((call) => call.cmd === "remove_wallet")).toBe(false);
    expect(within(row).getByText(/cannot be undone/)).toBeInTheDocument();
    // The yes of a destructive confirmation is the one button that
    // wears red; the note around it keeps its amber, and reads Cancel
    // first, the yes last.
    const confirm = within(row).getByRole("button", { name: "Remove wallet" });
    expect(confirm).toHaveClass("bg-alert");
    const notice = within(row).getByText(/cannot be undone/).closest<HTMLElement>(".bg-pending-surface");
    expect(notice).not.toBeNull();
    const [cancel, yes, ...others] = within(notice!).getAllByRole("button");
    expect(others).toEqual([]);
    expect(cancel).toHaveAccessibleName("Cancel");
    expect(yes).toBe(confirm);

    await user.click(within(row).getByRole("button", { name: "Cancel" }));
    expect(within(row).queryByRole("button", { name: "Remove wallet" })).not.toBeInTheDocument();
    expect(calls.some((call) => call.cmd === "remove_wallet")).toBe(false);

    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await user.click(within(row).getByRole("button", { name: "Remove wallet" }));
    await waitFor(() =>
      expect(calls.filter((call) => call.cmd === "remove_wallet").map((call) => call.args)).toEqual([
        { id: "w-1" },
      ]),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says why a removal failed, under its row, and keeps the question for a retry", async () => {
    let refuse = true;
    const calls = mockSettingsIpc({
      remove_wallet: () => {
        if (refuse) {
          refuse = false;
          return Promise.reject({ kind: "vault", message: "vault i/o error: disk full" });
        }
        return undefined;
      },
    });
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    const user = userEvent.setup();
    const row = screen.getByText("Cold storage").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await user.click(within(row).getByRole("button", { name: "Remove wallet" }));

    expect(await within(row).findByRole("alert")).toHaveTextContent(
      "Not removed: vault i/o error: disk full",
    );
    await user.click(within(row).getByRole("button", { name: "Remove wallet" }));
    await waitFor(() => expect(useUi.getState().toast).toBe("Wallet removed"));
    expect(calls.filter((call) => call.cmd === "remove_wallet")).toHaveLength(2);
    expect(within(row).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("badges each wallet with what the live watch hears, only while it is short of room", async () => {
    const short = {
      state: "connected",
      transport: "electrum",
      server: "electrum.example.org",
      detail: null,
      watched_scripts: 2_000,
      pushed_scripts: 2_000,
      left_out_scripts: 1_240,
      left_out_wallets: 2,
      wallets: [
        { wallet_id: "w-1", coverage: "partial", watched_scripts: 200, left_out_scripts: 1_040 },
        { wallet_id: "w-2", coverage: "sync_only", watched_scripts: 0, left_out_scripts: 200 },
        { wallet_id: "w-3", coverage: "live", watched_scripts: 12, left_out_scripts: 0 },
      ],
      left_out: {
        reason: "live_limit",
        limits: LIVE_LIMITS.any,
        own_node: false,
        remedy: { type: "own_node", limits: LIVE_LIMITS.own_node },
      },
    };
    mockSettingsIpc({ live_status: () => ({ enabled: true, status: short }) });
    useUi.setState({ settingsSection: "wallets" });
    renderSettings([
      WALLET,
      { ...WALLET, id: "w-2", name: "Savings" },
      { ...WALLET, id: "w-3", name: "Spending" },
    ]);
    const row = (name: string) => within(screen.getByText(name).closest("li")!);
    expect(await row("Cold storage").findByText("Partly live")).toBeInTheDocument();
    expect(row("Savings").getByText("At next sync")).toBeInTheDocument();
    expect(row("Spending").getByText("Live")).toBeInTheDocument();
    // The count rides along for a pointer, and is read out with the badge.
    expect(row("Savings").getByTitle("200 addresses wait for the next sync.")).toBeInTheDocument();
    expect(row("Spending").getByTitle("Every address is followed live.")).toBeInTheDocument();
  });

  it("puts no badge on a wallet while the live watch has room, or is off", async () => {
    mockSettingsIpc({
      live_status: () => ({
        enabled: false,
        status: {
          state: "off",
          transport: null,
          server: null,
          detail: null,
          watched_scripts: 0,
          pushed_scripts: 0,
          left_out_scripts: 0,
          left_out_wallets: 0,
          wallets: [],
        },
      }),
    });
    useUi.setState({ settingsSection: "wallets" });
    renderSettings();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Advanced/ })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^(Live|Partly live|At next sync)$/)).not.toBeInTheDocument();
  });

  /** An advanced setting, out of the way: folded until asked for. */
  it("pins a wallet to the live watch from a folded advanced list", async () => {
    let pinned = false;
    const calls = mockSettingsIpc({
      list_wallets: () => [{ ...WALLET, ...(pinned ? { live_pinned: true } : {}) }],
      set_wallet_live_pinned: (args) => {
        pinned = args.pinned as boolean;
        return undefined;
      },
    });
    useUi.setState({ settingsSection: "wallets" });
    renderLiveSettings();
    const user = userEvent.setup();
    const advanced = await screen.findByRole("button", { name: /^Advanced/ });
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("switch", { name: /live first/ })).not.toBeInTheDocument();

    await user.click(advanced);
    expect(advanced).toHaveAttribute("aria-expanded", "true");
    const pin = screen.getByRole("switch", { name: "Always watch Cold storage live first" });
    expect(pin).toHaveAttribute("aria-checked", "false");
    expect(pin).toHaveAccessibleDescription(
      "When the live watch cannot follow every address, the wallets turned on here are followed first.",
    );

    await user.click(pin);
    await waitFor(() => expect(pin).toHaveAttribute("aria-checked", "true"));
    expect(calls.filter((call) => call.cmd === "set_wallet_live_pinned")).toEqual([
      { cmd: "set_wallet_live_pinned", args: { id: "w-1", pinned: true } },
    ]);

    // Folded again, the count still says something is set.
    await user.click(advanced);
    expect(advanced).toHaveAccessibleName("Advanced · 1 wallet watched live first");
  });

  it("says why a pin was not saved, under its wallet", async () => {
    mockSettingsIpc({
      set_wallet_live_pinned: () =>
        Promise.reject({ kind: "vault", message: "vault i/o error: disk full" }),
    });
    useUi.setState({ settingsSection: "wallets" });
    renderSettings();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Advanced/ }));
    const pin = screen.getByRole("switch", { name: "Always watch Cold storage live first" });
    await user.click(pin);
    expect(await screen.findByRole("alert")).toHaveTextContent("vault i/o error: disk full");
    expect(pin).toHaveAttribute("aria-checked", "false");
  });

  it("lifts a dragged wallet on the overlay shadow and sets it down without it", async () => {
    const second: WalletMeta = { ...WALLET, id: "w-2", name: "Lightning float", icon: "key" };
    mockSettingsIpc({ list_wallets: () => [WALLET, second] });
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings([WALLET, second]);
    const row = (await screen.findByText("Cold storage")).closest("li")!;
    const grip = within(row).getByTitle("Drag to reorder");
    // At rest it lies flat, and only its shadow is ever set to move.
    expect(row).toHaveClass("transition-shadow");
    expect(row).not.toHaveClass("shadow-overlay");

    fireEvent.pointerDown(grip, { button: 0, clientY: 20 });
    fireEvent.pointerMove(grip, { clientY: 30 });
    // Its own surface and the shadow, nothing faded.
    expect(row).toHaveClass("shadow-overlay", "bg-surface");
    expect(row.className).not.toMatch(/opacity/);

    fireEvent.pointerUp(grip);
    expect(row).not.toHaveClass("shadow-overlay");
  });

  it("offers no reordering to a single wallet", () => {
    mockSettingsIpc();
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    expect(screen.queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Drag to reorder")).not.toBeInTheDocument();
  });

  it("walks the sections with the arrow keys", async () => {
    mockSettingsIpc();
    renderSettings();
    const user = userEvent.setup();
    nav().getByRole("button", { name: "General" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(nav().getByRole("button", { name: "Network" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(nav().getByRole("button", { name: "About" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(nav().getByRole("button", { name: "General" })).toHaveFocus();
    // Moving the focus is not choosing: Enter does that.
    expect(heading("Display")).toBeInTheDocument();
    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");
    expect(heading("Backup & sync")).toBeInTheDocument();
  });
});

/** A write the vault refuses — a full disk, a file an antivirus holds
    during the rename — is said under the setting, and the control shows
    what the vault holds, not what was asked. */
describe("a setting the vault refuses", () => {
  const refused = () => Promise.reject({ kind: "vault", message: "the vault could not be written" });

  beforeEach(() => {
    useUi.setState({ view: "settings", settingsSection: "general", notifyNewTx: false, toast: null });
  });

  it("puts the gap limit back and says why", async () => {
    mockSettingsIpc({ set_gap_limit: refused });
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Gap limit" });

    await user.clear(field);
    await user.type(field, "50{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not saved: the vault could not be written",
    );
    expect(field).toHaveValue(String(SETTINGS.gap_limit));
    expect(useUi.getState().toast).toBeNull();
  });

  it("keeps the rename open on the name typed", async () => {
    mockSettingsIpc({ rename_wallet: refused });
    act(() => useUi.getState().openSettings("wallets"));
    renderSettings();
    const user = userEvent.setup();
    const row = screen.getByText("Cold storage").closest("li")!;

    await user.click(within(row).getByRole("button", { name: "Rename" }));
    const name = within(row).getByRole("textbox", { name: "Wallet name" });
    await user.clear(name);
    await user.type(name, "Savings{Enter}");
    expect(await within(row).findByRole("alert")).toHaveTextContent("Not saved:");
    expect(within(row).getByRole("textbox", { name: "Wallet name" })).toHaveValue("Savings");
  });

  it("stays on the network the vault holds", async () => {
    mockSettingsIpc({ set_active_network: refused });
    act(() => useUi.getState().openSettings("network"));
    renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Signet/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved:");
    expect(screen.getByRole("button", { name: /^Mainnet/ })).toHaveAttribute("aria-pressed", "true");
  });

  /** The Rust side starts the watch on what the vault holds: a switch
      left on over a refused write would promise alerts nobody sends. */
  it("turns the alerts switch back off", async () => {
    mockSettingsIpc({ set_preferences: refused });
    act(() => useUi.getState().openSettings("notifications"));
    renderSettings();
    const user = userEvent.setup();
    const alerts = screen.getByRole("switch", { name: "Notify about new transactions" });

    await user.click(alerts);
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved:");
    expect(alerts).not.toBeChecked();
    expect(useUi.getState().notifyNewTx).toBe(false);
  });
});

describe("turning the app lock on", () => {
  beforeEach(() => {
    useUi.setState({ view: "settings", settingsSection: "general", toast: null });
  });

  /** A form: Enter sends it from any field, and what is wrong is read
      out with the fields it is about. */
  it("sends on Enter and says what is wrong out loud", async () => {
    const calls = mockSettingsIpc({ set_app_lock: () => undefined, get_settings: () => SETTINGS });
    act(() => useUi.getState().openSettings("security"));
    renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole("switch", { name: "App lock" }));
    const dialog = await screen.findByRole("dialog", { name: "Turn on the app lock" });
    const pin = within(dialog).getByLabelText("New PIN");
    const confirm = within(dialog).getByLabelText("Confirm");
    await user.type(pin, "246813");
    await user.type(confirm, "246812{Enter}");

    const problem = await within(dialog).findByRole("alert");
    expect(problem).toHaveTextContent("The two entries differ.");
    expect(confirm).toHaveAttribute("aria-invalid", "true");
    expect(confirm).toHaveAccessibleDescription("The two entries differ.");
    expect(calls.filter((call) => call.cmd === "set_app_lock")).toHaveLength(0);

    await user.clear(confirm);
    await user.type(confirm, "246813{Enter}");
    await waitFor(() =>
      expect(calls.filter((call) => call.cmd === "set_app_lock")).toEqual([
        { cmd: "set_app_lock", args: { kind: "pin", secret: "246813", current: null } },
      ]),
    );
  });
});

describe("the delay before the lock comes back", () => {
  const LOCKED: Settings = { ...SETTINGS, app_lock: { kind: "pin", biometric: false } };

  beforeEach(() => {
    useUi.setState({ view: "settings", settingsSection: "security", toast: null });
  });

  it("offers five minutes when none was chosen, and stores the one picked", async () => {
    const calls = mockSettingsIpc({ get_settings: () => LOCKED });
    renderSettings([WALLET], LOCKED);
    const user = userEvent.setup();
    const choice = await screen.findByRole("radiogroup", { name: "Lock when away" });
    await waitFor(() =>
      expect(within(choice).getByRole("radio", { name: "5 min" })).toBeChecked(),
    );

    await user.click(within(choice).getByRole("radio", { name: "1 min" }));

    await waitFor(() =>
      expect(within(choice).getByRole("radio", { name: "1 min" })).toBeChecked(),
    );
    expect(calls.filter((call) => call.cmd === "set_app_pref")).toEqual([
      { cmd: "set_app_pref", args: { key: "lock.delay", value: "60" } },
    ]);
    expect(useUi.getState().toast).toBe("Setting saved");
  });

  it("keeps the delay in force on screen when the vault refuses the new one", async () => {
    mockSettingsIpc({
      get_settings: () => LOCKED,
      set_app_pref: () => Promise.reject({ kind: "vault", message: "the vault could not be written" }),
    });
    renderSettings([WALLET], LOCKED);
    const user = userEvent.setup();
    const choice = await screen.findByRole("radiogroup", { name: "Lock when away" });

    await user.click(within(choice).getByRole("radio", { name: "Immediately" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved:");
    expect(within(choice).getByRole("radio", { name: "5 min" })).toBeChecked();
    expect(useUi.getState().toast).toBeNull();
  });

  it("takes one choice at a time while the vault writes it", async () => {
    let answer: () => void = () => {};
    const calls = mockSettingsIpc({
      get_settings: () => LOCKED,
      set_app_pref: () =>
        new Promise<null>((resolve) => {
          answer = () => resolve(null);
        }),
    });
    renderSettings([WALLET], LOCKED);
    const user = userEvent.setup();
    const choice = await screen.findByRole("radiogroup", { name: "Lock when away" });

    await user.click(within(choice).getByRole("radio", { name: "1 min" }));
    // A second choice before the first has landed would race it to the
    // vault, and the one written last is not always the one shown.
    await waitFor(() =>
      expect(within(choice).getByRole("radio", { name: "15 min" })).toBeDisabled(),
    );
    await user.click(within(choice).getByRole("radio", { name: "15 min" }));
    expect(calls.filter((call) => call.cmd === "set_app_pref")).toHaveLength(1);

    await act(async () => answer());
    await waitFor(() =>
      expect(within(choice).getByRole("radio", { name: "1 min" })).toBeChecked(),
    );
    expect(within(choice).getByRole("radio", { name: "15 min" })).toBeEnabled();
  });

  it("is not offered without a lock", () => {
    mockSettingsIpc({ get_settings: () => SETTINGS });
    renderSettings();
    expect(screen.queryByRole("radiogroup", { name: "Lock when away" })).toBeNull();
  });
});
