import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { TorStatus } from "../../lib/ipc";
import { TorSection } from "./TorSection";

const STATUS: TorStatus = {
  mode: "auto",
  socks_proxy: "127.0.0.1:9050",
  via: null,
  socks: null,
  running: false,
  bootstrapped: false,
  bootstrap_percent: 0,
  error: null,
  embedded_available: true,
  system_socks_owner: null,
};

/** The section, with a vault whose answer to a new mode the test gives
    when it wants. */
function mount(status: Partial<TorStatus> = {}) {
  let settle: { resolve: () => void; reject: (error: unknown) => void } | null = null;
  mockIPC((cmd) => {
    if (cmd === "tor_status") return { ...STATUS, ...status };
    if (cmd === "set_tor_settings") {
      return new Promise<void>((resolve, reject) => {
        settle = { resolve, reject };
      });
    }
    return undefined;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TorSection tor={{ mode: status.mode ?? "auto", socks_proxy: null }} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), settle: () => settle!, unmount: view.unmount };
}

const radio = (name: string) => screen.getByRole("radio", { name });

describe("the Tor card", () => {
  /** The price is one more request that follows the syncs. */
  it("says the price goes through Tor too", () => {
    mount();
    expect(
      screen.getByText(
        /When a backend is a \.onion address, the price goes through Tor too, or is not fetched while Tor is out of reach\./,
      ),
    ).toBeInTheDocument();
  });
});

describe("the Tor mode", () => {
  /** The vault answers once the live watch has taken the new route, a
      second or more on a remote server: the choice does not wait. */
  it("shows the mode chosen before the vault answers", async () => {
    const { user, settle } = mount();
    await waitFor(() => expect(radio("Built-in")).toBeEnabled());

    await user.click(radio("Built-in"));
    expect(radio("Built-in")).toHaveAttribute("aria-checked", "true");
    expect(radio("Automatic")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/^Only the built-in Tor\./)).toBeInTheDocument();
    expect(screen.queryByLabelText("SOCKS address")).not.toBeInTheDocument();
    settle().resolve();
  });

  it("puts the vault's mode back when it refuses the new one", async () => {
    const { user, settle } = mount();
    await waitFor(() => expect(radio("System Tor")).toBeEnabled());

    await user.click(radio("System Tor"));
    expect(radio("System Tor")).toHaveAttribute("aria-checked", "true");
    settle().reject({ kind: "internal", message: "the vault could not be written" });
    await screen.findByText("the vault could not be written");
    expect(radio("Automatic")).toHaveAttribute("aria-checked", "true");
  });
});

/** A proxy on a loopback address that another account runs is not
    taken for the person's own Tor. The card says why, with the way
    out, and what it says follows what is at stake: amber when Gerfaut
    has already moved to its own Tor, red when the traffic does go
    through someone else's proxy. */
describe("the proxy of another account", () => {
  const AUTO_OTHER =
    "Another account on this computer runs the proxy at 127.0.0.1:9050, so Gerfaut uses its built-in Tor. If that proxy is yours, choose System Tor.";

  it("is said in Automatic, in amber, with the choice that overrides it", async () => {
    mount({ system_socks_owner: "other_account" });
    const note = await screen.findByText(AUTO_OTHER);
    expect(note.closest("div.rounded-md")).toHaveClass("text-pending");
  });

  it("says Gerfaut cannot tell, when it could not read who runs the proxy", async () => {
    mount({ system_socks_owner: "unknown" });
    const note = await screen.findByText(
      "Gerfaut can't tell which account runs the proxy at 127.0.0.1:9050, so it uses its built-in Tor. If that proxy is yours, choose System Tor.",
    );
    expect(note.closest("div.rounded-md")).toHaveClass("text-pending");
  });

  it("is said in System Tor, in red, because the traffic goes through it", async () => {
    mount({ mode: "system", system_socks_owner: "other_account" });
    const note = await screen.findByText(
      "Another account on this computer runs this proxy. It can see which servers Gerfaut reaches.",
    );
    expect(note.closest("div.rounded-md")).toHaveClass("text-alert");
  });

  /** A warning is a panel of its own: the card it is about does not
      hold it. */
  it("is a panel under the card, not a line inside it", async () => {
    mount({ system_socks_owner: "other_account" });
    const note = await screen.findByText(/Another account on this computer runs the proxy/);
    const panel = note.closest("div.rounded-md")!;
    expect(panel.closest("section")).toBeNull();
    expect(screen.getByText("Test the connection").closest("section")).not.toBeNull();
  });

  it("is said in the line under Automatic that the Tor must also be the person's own", async () => {
    mount();
    expect(
      await screen.findByText(
        "The Tor on this machine if it answers and is yours, the built-in one otherwise.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing for a proxy of this account or the system, or when there is none to read", async () => {
    for (const owner of ["this_account", "system", null] as const) {
      const { unmount } = mount({ system_socks_owner: owner });
      // The status has been read once the built-in choice opens.
      await waitFor(() => expect(radio("Built-in")).toBeEnabled());
      expect(screen.queryByText(/Another account|can't tell which account/)).not.toBeInTheDocument();
      unmount();
    }
    // System Tor on a proxy nobody could be read for: no claim either.
    mount({ mode: "system", system_socks_owner: "unknown" });
    await waitFor(() => expect(radio("Built-in")).toBeEnabled());
    expect(screen.queryByText(/Another account|can't tell which account/)).not.toBeInTheDocument();
  });
});
