import { SpinIcon } from "../../components/SpinIcon";
import { CircleCheck, LoaderCircle, ScanLine, Server } from "lucide-react";
import { clsx } from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, Ref, RefObject } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { ScanQrModal } from "../../components/ScanQrModal";
import { Select } from "../../components/Select";
import { OnionIcon } from "../../components/icons/OnionIcon";
import { NETWORK_LABEL, groupThousands } from "../../lib/format";
import { PRIVATE_KEY_NOT_A_SERVER, ipc, isCommandError, materialRefusal } from "../../lib/ipc";
import type { BackendCheck, BackendConfig, Network, PublicServer, Settings } from "../../lib/ipc";
import {
  cancelBackendTest,
  clearBackendRefusal,
  clearBackendTest,
  refuseBackend,
  testBackend,
  useBackendSave,
  viewBackendForm,
} from "../../state/backendSave";
import type { BackendTest, TestedBackend } from "../../state/backendSave";
import {
  useInspectCertificate,
  usePublicServers,
  useSetBackendTrusting,
} from "../../state/queries";
import { isOwnNode, useLiveLimits } from "../../state/live";
import { useUi } from "../../state/store";
import { CertificateDialog, SHELL_Z } from "./CertificatesSection";
import { FieldLabel, SectionCard, Toggle } from "./primitives";

/** The chains a workspace can watch, each with a word on what it is. */
export const NETWORKS: { value: Network; label: string; hint: string }[] = [
  { value: "mainnet", label: NETWORK_LABEL.mainnet, hint: "The Bitcoin network" },
  { value: "signet", label: NETWORK_LABEL.signet, hint: "Test network, reliable blocks" },
  { value: "testnet4", label: NETWORK_LABEL.testnet4, hint: "Public test network" },
  { value: "regtest", label: NETWORK_LABEL.regtest, hint: "Local development chain" },
];

// --- electrum url helpers ----------------------------------------------

/** A stored Electrum address back into the three fields of the form.
    An IPv6 literal is full of colons, so the port is only ever what
    follows the closing bracket, or the single colon of a name or an
    IPv4. The host comes back without its brackets, the way a scan
    hands it over; `buildElectrumUrl` puts them back. Anything that
    reads as neither leaves the port empty rather than guessing one. */
export function parseElectrumUrl(url: string): { host: string; port: string; tls: boolean } {
  const text = url.trim();
  const tls = !/^tcp:\/\//i.test(text);
  const rest = text.replace(/^(ssl|tcp):\/\//i, "").split(/[/?#]/)[0] ?? "";
  const digits = (value: string) => (/^\d+$/.test(value) ? value : "");
  const bracketed = /^\[([^\]]*)\](?::(.*))?$/.exec(rest);
  if (bracketed) return { host: bracketed[1] ?? "", port: digits(bracketed[2] ?? ""), tls };
  const colon = rest.indexOf(":");
  // No colon is a bare name; more than one is a bare IPv6, port and all
  // undecidable, so the whole of it is the host.
  if (colon === -1 || colon !== rest.lastIndexOf(":")) return { host: rest, port: "", tls };
  return { host: rest.slice(0, colon), port: digits(rest.slice(colon + 1)), tls };
}

/** Whether an Esplora address is read over plain HTTP outside Tor: an
    `http://` server whose host is not a `.onion`, which Tor carries
    encrypted whatever the scheme. What anything on the path reads is
    then what an Electrum server without TLS would give it. */
export function isPlainHttp(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  return !parsed.hostname.toLowerCase().replace(/\.$/, "").endsWith(".onion");
}

export function buildElectrumUrl(host: string, port: string, tls: boolean): string {
  const name = host.trim();
  // A bare IPv6 goes in brackets, or its last group reads as the port.
  const literal = name.includes(":") && !name.startsWith("[") ? `[${name}]` : name;
  return `${tls ? "ssl" : "tcp"}://${literal}:${port.trim()}`;
}

// --- the card -----------------------------------------------------------

export function BackendSection({
  network,
  settings,
  onSave,
}: {
  network: Network;
  settings: Settings;
  /** Settles once the core stored the setting; rejects with its
      refusal otherwise. */
  onSave: (config: BackendConfig) => Promise<void>;
}) {
  const current = settings.backends[network] ?? { type: "public_esplora" };
  /** What the form shows for a network: the backend a save still under
      way, waiting on its certificate or refused is about, else the
      stored one. Leaving the page during a save and coming back finds
      the choice that is being saved, or the one the core refused beside
      its reason, not the one it would have replaced. */
  const shown = (of: Network): BackendConfig => {
    const { saving, ask, refusals } = useBackendSave.getState();
    if (saving?.network === of) return saving.config;
    if (ask?.network === of) return ask.config;
    const refused = refusals[of];
    if (refused) return refused.config;
    return settings.backends[of] ?? { type: "public_esplora" };
  };
  const [seed] = useState(() => shown(network));
  const servers = usePublicServers(network);
  const [kind, setKind] = useState<BackendConfig["type"]>(seed.type);
  // "" is the automatic rotation over every public instance.
  const [publicServer, setPublicServer] = useState(
    seed.type === "public_esplora" ? (seed.server ?? "") : "",
  );
  const [esploraUrl, setEsploraUrl] = useState(seed.type === "custom_esplora" ? seed.url : "");
  const initialElectrum =
    seed.type === "custom_electrum"
      ? parseElectrumUrl(seed.url)
      : { host: "", port: "50002", tls: true };
  const [host, setHost] = useState(initialElectrum.host);
  const [port, setPort] = useState(initialElectrum.port);
  const [tls, setTls] = useState(initialElectrum.tls);
  // An empty form's switch follows the typed address, read the way a
  // scanned one is, until the person sets it: then it is theirs. A
  // stored server or a scan sets it too.
  const [tlsFollows, setTlsFollows] = useState(seed.type !== "custom_electrum");
  /** Why the address turned the switch off, while it stays so. */
  const [tlsNote, setTlsNote] = useState<string | null>(null);
  // Read from the stored backend and sent back with every save: the
  // core leaves it out while off, so a form that rebuilt the config
  // without it would turn it off each time the address is saved.
  const [ownNode, setOwnNode] = useState(isOwnNode(seed));
  const inspect = useInspectCertificate();
  const [scanOpen, setScanOpen] = useState(false);
  // Why the core refused the last code read, in its own words.
  const [scanError, setScanError] = useState<string | null>(null);
  // One save at a time, whichever network it is for.
  const saving = useBackendSave((state) => state.saving);
  /** Why the core would not store the address, under the button. */
  const saveError = useBackendSave((state) => state.refusals[network]?.message ?? null);
  /** Says why `config` was not stored for this network. */
  const refuse = (config: BackendConfig, message: string) =>
    refuseBackend(network, config, message);
  /** The test of this network's stored backend, under way or done. */
  const test = useBackendSave((state) => state.tests[network]);
  const testing = test?.state === "testing";
  /** Where the focus goes when Test again leaves for the wait: the
      button that stays, busy, rather than nowhere. */
  const saveButton = useRef<HTMLButtonElement>(null);
  /** Takes this network's refusal and test result back: the form no
      longer holds what they were about. Another network's are left
      alone. */
  const clearRefusal = () => {
    clearBackendRefusal(network);
    clearBackendTest(network);
  };
  // The last code read was a Tor hidden service: a fact about the
  // address the fields now hold, gone the moment one of them is edited.
  const [onion, setOnion] = useState(false);

  // On screen: a refusal for this network is said here, not over it.
  // Before the paint, so a notice mounted in the same render (after an
  // unlock) never shows for a frame.
  useLayoutEffect(() => viewBackendForm(network), [network]);

  // Re-seed the form when the workspace network changes, or the stored
  // backend does. A refusal stays: it is said for its own network only,
  // and a form found again after a refused save must still say why.
  useEffect(() => {
    const config = shown(network);
    setKind(config.type);
    setPublicServer(config.type === "public_esplora" ? (config.server ?? "") : "");
    setEsploraUrl(config.type === "custom_esplora" ? config.url : "");
    const electrum =
      config.type === "custom_electrum"
        ? parseElectrumUrl(config.url)
        : { host: "", port: "50002", tls: true };
    setHost(electrum.host);
    setPort(electrum.port);
    setTls(electrum.tls);
    setTlsFollows(config.type !== "custom_electrum");
    setTlsNote(null);
    setOwnNode(isOwnNode(config));
    setOnion(false);
    // `shown` reads the store as it stands, and the settings through
    // these two: nothing else to follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, settings.backends]);

  // The core reads host and port as it reads a scanned address with no
  // scheme: a port that conventionally runs in the clear, or an onion,
  // turns TLS off. A host it does not read as an address (a bare name
  // such as `umbrel`, half a name, an IPv6 literal out of its brackets)
  // leaves the port to decide alone. With no port to read either, or a
  // host holding a scheme of its own, the switch goes back on, as the
  // empty form had it: a reason given for an address since changed
  // would no longer be true. An answer about an address since retyped
  // is dropped.
  useEffect(() => {
    if (!tlsFollows) return;
    const typedHost = host.trim();
    const typedPort = port.trim();
    const unfollowed = () => {
      setTls(true);
      setTlsNote(null);
    };
    if (!typedHost || !/^\d+$/.test(typedPort) || typedHost.includes("://")) {
      unfollowed();
      return;
    }
    let stale = false;
    const read = (address: string) =>
      ipc.parseBackend(address).then(
        (backend) =>
          backend.kind === "electrum" && backend.port === Number(typedPort) ? backend : null,
        () => null,
      );
    void read(`${typedHost}:${typedPort}`)
      .then((backend) => backend ?? read(`electrum.invalid:${typedPort}`))
      .then((backend) => {
        if (stale) return;
        if (!backend) {
          unfollowed();
          return;
        }
        setTls(backend.tls);
        setTlsNote(
          backend.tls
            ? null
            : backend.onion
              ? "TLS turned off: Tor already encrypts the connection to an onion server."
              : `TLS turned off: port ${typedPort} usually runs without it.`,
        );
      });
    return () => {
      stale = true;
    };
  }, [host, port, tlsFollows]);

  const valid =
    kind === "public_esplora" ||
    (kind === "custom_esplora" && esploraUrl.trim().length > 0) ||
    (kind === "custom_electrum" && host.trim().length > 0 && /^\d+$/.test(port.trim()));

  // A server the app no longer lists falls back to the rotation, the
  // same resolution the core makes.
  const known = servers.data?.some((server) => server.id === publicServer) ?? false;
  const chosen = known ? publicServer : "";
  // The server the person chose is gone from the catalogue: the core
  // tries the public servers in turn, and a save from this form stores
  // Automatic. It stays in the list, greyed, for as long as it is the
  // value chosen, and the note under the card goes with it: at the
  // first other choice, Automatic included.
  const retired = settings.retired_servers?.[network];
  const storedId = current.type === "public_esplora" ? (current.server ?? "") : "";
  const retiredChosen =
    retired !== undefined &&
    kind === "public_esplora" &&
    storedId !== "" &&
    publicServer === storedId &&
    !known;

  /** What the form describes right now. The switch goes with every
      custom server, in the form the core stores: there while on, left
      out while off. */
  const draft = (): BackendConfig => {
    if (kind === "public_esplora")
      return chosen ? { type: "public_esplora", server: chosen } : { type: "public_esplora" };
    const mine = ownNode ? { own_node: true } : {};
    if (kind === "custom_esplora") return { type: "custom_esplora", url: esploraUrl.trim(), ...mine };
    return { type: "custom_electrum", url: buildElectrumUrl(host, port, tls), ...mine };
  };

  /** The Electrum address a configuration talks to, if any: the only case
      where a certificate has to be settled before saving. */
  const electrumUrlOf = (config: BackendConfig): string | null => {
    if (config.type === "custom_electrum") return config.url;
    if (config.type !== "public_esplora" || !config.server) return null;
    const server = servers.data?.find((entry) => entry.id === config.server);
    return server?.protocol === "electrum" ? server.url : null;
  };

  /** Fills the form from a scanned address. The core says which of the
      two backends it is and the choice follows: an `https://` read while
      Electrum is selected is plainly meant for Esplora, and refusing it
      would be pedantic. Nothing is saved; the person still presses Save. */
  const applyScan = async (text: string) => {
    try {
      const backend = await ipc.parseBackend(text);
      setScanError(null);
      clearRefusal();
      setOnion(backend.onion);
      // Another server is not the user's node until they say so: left
      // on, the switch would have the live watch hand it up to 20 000
      // addresses. The stored server read again keeps it.
      setOwnNode(isOwnNode(current) && "url" in current && current.url === backend.url);
      if (backend.kind === "esplora") {
        setKind("custom_esplora");
        setEsploraUrl(backend.url);
        return;
      }
      setKind("custom_electrum");
      // An IPv6 literal goes back into its brackets: host and port are
      // joined again on save, and without them the two cannot be told
      // apart.
      setHost(backend.host.includes(":") ? `[${backend.host}]` : backend.host);
      setPort(backend.port === null ? "" : String(backend.port));
      setTls(backend.tls);
      setTlsFollows(false);
      setTlsNote(null);
    } catch (error) {
      // Pointing the wrong QR at it is the likely slip, so the refusal
      // names what was read instead; a private key in this screen's words.
      setScanError(materialRefusal(error, PRIVATE_KEY_NOT_A_SERVER));
    }
  };

  /** Stores the setting, and says in the core's words why not when it
      refuses: the address and nothing else is at fault then, so the
      line sits under the button that sent it. */
  const store = async (config: BackendConfig) => {
    try {
      await onSave(config);
    } catch (error) {
      refuse(config, materialRefusal(error, PRIVATE_KEY_NOT_A_SERVER));
      return;
    }
    // Stored: whether it answers is the test's to say, wherever the
    // user is by then.
    void testBackend(network, testedBackend(config, servers.data));
  };

  // Every step past the first await may land after the user left the
  // page: what it has to say goes through the store, never through the
  // state of this form, which would be gone with it.
  const save = async () => {
    // Read from the store, not this render: a test started a moment ago
    // holds the button before React draws it busy.
    const now = useBackendSave.getState();
    if (now.saving || now.tests[network]?.state === "testing") return;
    clearRefusal();
    const config = draft();
    // A name with one colon is no IPv6 address: its port went into the
    // host field, and the core would only call it a bad IPv6 literal.
    // Words with spaces are no name, and are never quoted back.
    const typed = /^([^:[\]\s]+):(\d*)$/.exec(host.trim());
    const portInHost =
      config.type === "custom_electrum" && typed
        ? `The host holds a port. Put ${typed[1]} in the host field and the port in its own.`
        : null;
    const under = (checking: boolean) =>
      useBackendSave.setState({ saving: { network, config, checking } });
    under(false);
    try {
      // A typed address is read first, the way the core will store it:
      // one it refuses — a host with a port still in it, say — is said
      // so here, and not taken for a server that did not answer. A key
      // or a seed typed as the host is refused as one before the host
      // is quoted back in a sentence of this screen.
      if (config.type === "custom_electrum" || config.type === "custom_esplora") {
        try {
          await ipc.parseBackend(config.url);
        } catch (error) {
          const secret = isCommandError(error) && error.kind === "private_material";
          refuse(
            config,
            portInHost && !secret
              ? portInHost
              : materialRefusal(error, PRIVATE_KEY_NOT_A_SERVER),
          );
          return;
        }
      }
      if (portInHost) {
        refuse(config, portInHost);
        return;
      }
      const url = electrumUrlOf(config);
      if (!url) return await store(config);
      under(true);
      // A bridge that cannot answer must not block a setting: the sync
      // meets the same certificate and says so.
      const report = await inspect.mutateAsync(url).catch(() => null);
      if (report?.status === "unknown" || report?.status === "changed") {
        // Asked over whatever page is open now (`CertificateAsk`).
        useBackendSave.setState({ ask: { network, url, config, report } });
        return;
      }
      under(false);
      await store(config);
    } finally {
      useBackendSave.setState({ saving: null });
    }
  };

  const networkLabel = NETWORKS.find((option) => option.value === network)?.label;

  /** The field the selected source needs, rendered under its own option
      so no reader has to guess which one it belongs to. */
  const fields: Record<BackendConfig["type"], ReactNode> = {
    public_esplora: (
      <>
        <FieldLabel htmlFor="public-server">Server</FieldLabel>
        <Select
          id="public-server"
          label="Public server"
          className="max-w-md"
          value={retiredChosen ? publicServer : chosen}
          onChange={(server) => {
            setPublicServer(server);
            clearRefusal();
          }}
          options={[
            {
              value: "",
              label: "Automatic",
              hint: "Every public Esplora instance, tried in turn",
            },
            ...(retiredChosen
              ? [
                  {
                    value: publicServer,
                    label: retired,
                    hint: "No longer offered",
                    disabled: true,
                  },
                ]
              : []),
            ...(servers.data ?? []).map((server) => ({
              value: server.id,
              label: server.label,
              hint:
                server.protocol === "esplora"
                  ? "Esplora"
                  : server.self_signed
                    ? "Electrum · signs its own certificate"
                    : "Electrum",
            })),
          ]}
        />
        {!chosen && (
          <p className="mt-1.5 font-ui text-xs text-muted">
            Every public server is tried in turn until one answers.
          </p>
        )}
      </>
    ),
    custom_esplora: (
      <>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <FieldLabel htmlFor="backend-url">Server URL</FieldLabel>
            <input
              id="backend-url"
              value={esploraUrl}
              onChange={(event) => {
                setEsploraUrl(event.target.value);
                setScanError(null);
                clearRefusal();
                setOnion(false);
              }}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://node.example.org:3002/api"
              className="field-focus selectable h-11 w-full rounded-sm border border-transparent bg-sunken px-3 font-data text-[13px] text-text"
            />
          </div>
          <ScanButton onClick={() => setScanOpen(true)} />
        </div>
        <ScanRefusal reason={scanError} />
        {onion && <OnionNote />}
      </>
    ),
    custom_electrum: (
      <>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1">
            <FieldLabel htmlFor="electrum-host">Host</FieldLabel>
            <input
              id="electrum-host"
              value={host}
              onChange={(event) => {
                setHost(event.target.value);
                setScanError(null);
                clearRefusal();
                setOnion(false);
              }}
              spellCheck={false}
              autoComplete="off"
              placeholder="node.example.org or xxxxxxxx.onion"
              className="field-focus selectable h-11 w-full rounded-sm border border-transparent bg-sunken px-3 font-data text-[13px] text-text"
            />
          </div>
          <div className="w-24">
            <FieldLabel htmlFor="electrum-port">Port</FieldLabel>
            <input
              id="electrum-port"
              value={port}
              onChange={(event) => {
                setPort(event.target.value.replace(/\D/g, ""));
                setScanError(null);
                clearRefusal();
                setOnion(false);
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="50002"
              className="field-focus selectable h-11 w-full rounded-sm border border-transparent bg-sunken px-3 font-data text-[13px] text-text"
            />
          </div>
          <div className="flex h-11 items-center gap-2 pb-0.5">
            <Toggle
              checked={tls}
              onChange={(on) => {
                setTls(on);
                setTlsFollows(false);
                setTlsNote(null);
                clearRefusal();
              }}
              label="Use TLS"
            />
            <span className="font-ui text-sm text-text">TLS</span>
          </div>
          <ScanButton onClick={() => setScanOpen(true)} />
        </div>
        {/* Always there, so a change of words is announced. */}
        <p aria-live="polite" className="mt-2 font-ui text-xs text-muted empty:hidden">
          {tlsNote}
        </p>
        <ScanRefusal reason={scanError} />
        {onion && <OnionNote />}
      </>
    ),
  };

  const inTheClear =
    (kind === "custom_electrum" && !tls) || (kind === "custom_esplora" && isPlainHttp(esploraUrl));

  return (
    <div>
      <SectionCard
        icon={<Server size={18} strokeWidth={1.5} />}
        title={`Backend · ${networkLabel}`}
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Chain data source</legend>
          {(
            [
              {
                value: "public_esplora",
                label: "Public API",
                hint: "Free, keyless servers, no setup. The operator that answers can see this wallet's addresses.",
              },
              {
                value: "custom_esplora",
                label: "My own Esplora",
                hint: "An Esplora-compatible HTTP endpoint you run yourself.",
              },
              {
                value: "custom_electrum",
                label: "My own Electrum server",
                hint: "electrs or Fulcrum, reachable over TLS or plain TCP.",
              },
            ] as const
          ).map((option) => (
            <div key={option.value}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="backend"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => {
                    setKind(option.value);
                    setScanError(null);
                    clearRefusal();
                    setOnion(false);
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="block font-ui text-sm font-medium text-text">
                    {option.label}
                  </span>
                  <span className="block max-w-md text-pretty font-ui text-xs text-muted">
                    {option.hint}
                  </span>
                </span>
              </label>
              {kind === option.value && (
                <div className="mt-3 pl-7">{fields[option.value]}</div>
              )}
            </div>
          ))}
        </fieldset>

        {kind !== "public_esplora" && (
          <>
            <OwnNodeSwitch
              checked={ownNode}
              onChange={(on) => {
                setOwnNode(on);
                clearRefusal();
              }}
            />
          </>
        )}
        {inTheClear && (
          <p className="mt-3 max-w-[65ch] text-pretty font-ui text-xs text-muted">
            Without TLS everything travels in the clear: anything on the path between this
            machine and the server reads the addresses being watched.
          </p>
        )}
        <div className="mt-4">
          <Button
            ref={saveButton}
            variant="primary"
            onClick={() => void save()}
            disabled={!valid}
            busy={saving !== null || testing}
            busyLabel={saving?.checking ? "Checking the certificate…" : undefined}
          >
            Save backend
          </Button>
          {saveError && (
            <p role="alert" className="mt-2 font-ui text-sm text-muted">
              {saveError}
            </p>
          )}
          <BackendTestStatus
            network={network}
            test={test}
            onCancel={() => cancelBackendTest(network)}
            onTestAgain={() => {
              saveButton.current?.focus();
              const stored = settings.backends[network] ?? { type: "public_esplora" };
              void testBackend(network, testedBackend(stored, servers.data));
            }}
          />
        </div>
        <ScanQrModal
          caption="Point the camera at the QR code your node prints beside its Electrum or Esplora app."
          privateKey={PRIVATE_KEY_NOT_A_SERVER}
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onScan={(text) => void applyScan(text)}
        />
      </SectionCard>
      {retiredChosen && (
        // Under the card it is about, not inside it.
        <Notice tone="info" className="mt-3">
          The server you chose, {retired}, is no longer offered. Gerfaut tries the public servers
          in turn until you choose another.
        </Notice>
      )}
    </div>
  );
}

/** The certificate a Save backend has to settle before it stores the
    server, asked over whatever page is open: the check can outlast the
    visit to Settings › Network, and its question must still reach the
    user. Mounted once, in the shell. Accepted, the backend is stored for
    the network it was chosen on, whichever is active now, with its
    certificate in the same write; cancelled, nothing is stored, neither
    the certificate nor the backend. */
export function CertificateAsk() {
  const ask = useBackendSave((state) => state.ask);
  const save = useSetBackendTrusting();
  const { showToast } = useUi();
  /** Why the certificate or the backend was not stored, said in the
      dialog: it stays open until both are, whatever page is under it. */
  const [failure, setFailure] = useState<unknown>(null);
  /** From Accept until the core answered: what keeps Cancel off while
      the answer is on its way. */
  const [sending, setSending] = useState(false);
  if (!ask) return null;

  const { network, url, config, report } = ask;

  const accept = (fingerprint: string) => {
    setFailure(null);
    setSending(true);
    useBackendSave.setState({ saving: { network, config, checking: false } });
    // The certificate and the backend in one write, both or neither:
    // Cancel after a refusal leaves the vault as it was.
    void save
      .mutateAsync({ network, config, url, fingerprint })
      .then(() => {
        // Closes this question only, never one asked since.
        if (useBackendSave.getState().ask === ask) useBackendSave.setState({ ask: null });
        showToast("Setting saved");
        // Only an Electrum server has a certificate to accept.
        void testBackend(network, testedBackend({ type: "custom_electrum", url }));
      }, setFailure)
      .finally(() => {
        setSending(false);
        useBackendSave.setState({ saving: null });
      });
  };

  return (
    <CertificateDialog
      report={report}
      busy={sending}
      failure={failure}
      onAccept={accept}
      onCancel={() => {
        setFailure(null);
        useBackendSave.setState({ ask: null });
      }}
    />
  );
}

/** A Save backend the core refused while its form was not on screen,
    said over the page in view: the user left Settings › Network before
    the answer came, and would otherwise take the old server for the new
    one. The reason also stays under Save backend. Mounted once, in the
    shell. */
export function BackendRefusalNotice({ activeNetwork }: { activeNetwork: Network }) {
  const unseen = useBackendSave((state) => state.unseen);
  const refusal = useBackendSave((state) => (state.unseen ? state.refusals[state.unseen] : undefined));
  const servers = usePublicServers(unseen ?? activeNetwork);
  if (!unseen || !refusal) return null;

  const close = () => useBackendSave.setState({ unseen: null });
  const label = NETWORKS.find((option) => option.value === unseen)?.label ?? unseen;
  const { config } = refusal;
  // The address typed, or the public server picked by its name.
  const target =
    "url" in config
      ? config.url
      : config.server
        ? (servers.data?.find((server) => server.id === config.server)?.label ?? config.server)
        : null;
  return (
    <Modal open onClose={close} centered width={480} z={SHELL_Z} title="Backend not saved">
      <div className="flex flex-col gap-4">
        <p className="font-ui text-sm text-text">
          Gerfaut could not store{" "}
          {target ? (
            <span className="selectable break-all font-data text-[13px]">{target}</span>
          ) : (
            "the public API"
          )}{" "}
          as the {label} backend. The one before it stays in use.
        </p>
        <Notice tone="info" role="alert">
          {refusal.message}
        </Notice>
        <div className="mt-1 flex flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" onClick={close}>
            Dismiss
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              close();
              useUi.getState().openSettings("network");
            }}
          >
            Open Network settings
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- the connection test -------------------------------------------------

/** What a test of `config` is about, for its words: the protocol of the
    server it reaches, and whether that is a Tor hidden service. The
    rotation over public servers is Esplora's. */
export function testedBackend(config: BackendConfig, servers?: PublicServer[]): TestedBackend {
  const url =
    config.type === "public_esplora"
      ? (servers?.find((server) => server.id === config.server)?.url ?? "")
      : config.url;
  const protocol =
    config.type === "custom_electrum" ||
    (config.type === "public_esplora" &&
      servers?.find((server) => server.id === config.server)?.protocol === "electrum")
      ? "electrum"
      : "esplora";
  const host =
    protocol === "electrum"
      ? parseElectrumUrl(url).host
      : (() => {
          try {
            return new URL(url).hostname;
          } catch {
            return "";
          }
        })();
  return { protocol, onion: /\.onion\.?$/i.test(host) };
}

/** A sentence of the core ends without its full stop; one is put after
    it before another sentence follows. */
function sentence(detail: string): string {
  const text = detail.trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** What a failed test says the person can do, in the words of the
    protocol tested: the same for the desktop and the phone. */
export function failureWords(
  check: Extract<BackendCheck, { outcome: "failed" }>,
  protocol: TestedBackend["protocol"],
  network: Network,
): string {
  const electrum = protocol === "electrum";
  const ours = NETWORK_LABEL[network];
  switch (check.problem) {
    case "host_not_found":
      return "This name does not resolve. Check the spelling of the host.";
    case "refused":
      return "The server refused the connection. Check the port, and that the server is running.";
    case "no_answer":
      return check.tor
        ? "The onion service does not answer. Check the address and that your node is online, then test again."
        : "The server does not answer. Check the address, and that this device can reach it: same network, VPN or firewall.";
    case "tor":
      return `Tor is not available: ${sentence(check.detail)} Check Settings › Network › Tor, then test again.`;
    case "not_tls":
      return electrum
        ? "This port does not use TLS. Turn TLS off, or use the server's TLS port (often 50002)."
        : "This address does not use HTTPS. Use http:// instead.";
    case "needs_tls":
      return electrum
        ? "This port expects TLS. Turn TLS on."
        : "This address expects HTTPS. Use https:// instead.";
    case "certificate":
      return electrum
        ? "The server's certificate is not accepted. Press Save backend to review it."
        : "No public authority vouches for this server's certificate. Use one that a public authority signed, or reach the server through Tor.";
    case "not_electrum":
      return "Something answers on this port, but not an Electrum server. Check the port: Electrum often uses 50001, or 50002 with TLS.";
    case "not_esplora":
      return "Something answers at this address, but not an Esplora API. Check the URL, path included: it often ends in /api.";
    case "another_network":
      return check.server_network
        ? `This server follows ${NETWORK_LABEL[check.server_network]}, not ${ours}. Use a ${ours} server.`
        : `This server follows another network than ${ours}.`;
    case "bad_chain":
      return "The server's chain does not hold up. Use another server.";
    case "server_refused":
      return `The server refused the request: ${check.detail}`;
    case "failed":
      return `The test failed: ${check.detail}`;
  }
}

/** The line under "Connected to …": what the server answered, the parts
    it did not give left out. */
export function reachedLine(check: Extract<BackendCheck, { outcome: "reached" }>): string {
  return [
    `Block ${groupThousands(String(check.height))}`,
    check.software,
    check.tor ? "through Tor" : null,
    check.millis < 1000 ? `${check.millis} ms` : `${(check.millis / 1000).toFixed(1)} s`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** The host as an identifier, the way the screens print one. */
function Host({ name }: { name: string }) {
  return <span className="selectable break-all font-data text-[13px]">{name}</span>;
}

/** Under Save backend, what the test of the stored backend found: the
    wait, the block the server is at, or what stands in the way and what
    to do. A setting that does not work loses no funds and tells no one
    anything, so a failure reads in the amber of things worth reading,
    never in red. Always in the tree, so a screen reader hears it
    change. */
function BackendTestStatus({
  network,
  test,
  onCancel,
  onTestAgain,
}: {
  network: Network;
  test: BackendTest | undefined;
  onCancel: () => void;
  onTestAgain: () => void;
}) {
  /** Cancel had the keyboard when it left: pressed, or the test ended
      on its own. Test again, which takes its place, takes the focus. */
  const handOver = useRef(false);
  const testAgain = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!handOver.current) return;
    handOver.current = false;
    testAgain.current?.focus();
  }, [test]);
  return (
    <div role="status" aria-live="polite" className={clsx(!test && "sr-only")}>
      {test && (
        <TestOutcome
          network={network}
          test={test}
          onCancel={onCancel}
          handOver={handOver}
          onTestAgain={onTestAgain}
          testAgain={testAgain}
        />
      )}
    </div>
  );
}

function TestOutcome({
  network,
  test,
  onCancel,
  handOver,
  onTestAgain,
  testAgain,
}: {
  network: Network;
  test: BackendTest;
  onCancel: () => void;
  handOver: RefObject<boolean>;
  onTestAgain: () => void;
  testAgain: Ref<HTMLButtonElement>;
}) {
  if (test.state === "testing") {
    return (
      <div className="mt-3 flex max-w-xl items-center gap-3">
        <p className="flex min-w-0 flex-1 items-center gap-2 font-ui text-sm text-muted">
          <SpinIcon icon={LoaderCircle} active size={16} className="shrink-0" />
          {test.onion
            ? "Testing the connection through Tor. This can take a minute or two."
            : "Testing the connection…"}
        </p>
        <div className="shrink-0">
          <CancelTest onCancel={onCancel} handOver={handOver} />
        </div>
      </div>
    );
  }
  const { check } = test;
  const again = (onTint: boolean) => (
    <Button ref={testAgain} variant="secondary" size="sm" onTint={onTint} onClick={onTestAgain}>
      Test again
    </Button>
  );
  if (check.outcome === "cancelled") {
    // No colour and no icon: nothing went wrong, nothing was found.
    return (
      <div className="mt-3 flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-ui text-sm font-medium leading-5 text-text">Test cancelled</p>
          <p className="mt-0.5 font-ui text-xs text-muted">
            The backend is saved, but not tested.
          </p>
        </div>
        <div className="shrink-0">{again(false)}</div>
      </div>
    );
  }
  if (check.outcome === "reached") {
    return (
      <div className="mt-3 flex max-w-xl items-center gap-3">
        <span className="flex h-5 shrink-0 items-center self-start">
          <CircleCheck size={16} strokeWidth={1.75} aria-hidden className="text-confirmed" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-ui text-sm font-medium leading-5 text-text">
            Connected to <Host name={check.host} />
          </p>
          <p className="mt-0.5 font-ui text-xs text-muted tabular">{reachedLine(check)}</p>
        </div>
        <div className="shrink-0">{again(false)}</div>
      </div>
    );
  }
  return (
    <Notice tone="info" className="mt-3 max-w-xl" action={again(true)}>
      <p className="font-medium">
        {check.host ? (
          <>
            Could not connect to <Host name={check.host} />
          </>
        ) : (
          "Could not connect"
        )}
      </p>
      <p className="mt-0.5 text-pretty">{failureWords(check, test.protocol, network)}</p>
    </Notice>
  );
}

/** Stops the test under way: the way out beside Save backend, busy
    while it runs. Says in `handOver` whether it had the keyboard as it
    left, read while its button is still on the page. */
function CancelTest({
  onCancel,
  handOver,
}: {
  onCancel: () => void;
  handOver: RefObject<boolean>;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const node = button.current;
    return () => {
      handOver.current = node !== null && node === document.activeElement;
    };
  }, [handOver]);
  return (
    <Button
      ref={button}
      variant="secondary"
      size="sm"
      aria-label="Cancel the connection test"
      onClick={onCancel}
    >
      Cancel
    </Button>
  );
}

/** "This is my node": the one thing about a server the app cannot
    find out for itself. A public server limits how many addresses one
    connection may follow and refuses the rest, and it learns every one
    of them; a node of one's own serves all it is asked. So Live asks
    ten times more of a server the user says is theirs, and nothing
    checks the claim: the line under the switch says when to leave it
    off. */
function OwnNodeSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const limits = useLiveLimits().data;
  return (
    <div className="mt-4 flex items-start justify-between gap-6 border-t border-border pt-4">
      <div className="min-w-0 max-w-md">
        <p className="font-ui text-sm font-medium text-text">This is my node</p>
        <p id="own-node-hint" className="mt-0.5 text-pretty font-ui text-xs text-muted">
          {limits &&
            `The live watch then follows up to ${groupThousands(String(limits.own_node.total))} addresses instead of ${groupThousands(String(limits.any.total))}. `}
          Leave it off for a server you do not run: it would refuse most of them, and learn every
          one.
        </p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle
          checked={checked}
          onChange={onChange}
          label="This is my node"
          describedBy="own-node-hint"
        />
      </div>
    </div>
  );
}

/** Opens the camera on the QR code a node prints beside its Electrum or
    Esplora app. Nobody retypes a 56-character onion address. */
function ScanButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      aria-label="Scan a server address QR code"
      icon={ScanLine}
    >
      Scan
    </Button>
  );
}

/** The one fact a scan tells that the fields cannot show: the address
    is a Tor hidden service, so it is reached through Tor alone. Which
    Tor is the Tor card's to say, under the same onion, once. */
function OnionNote() {
  return (
    <p className="mt-2 flex items-center gap-1.5 font-ui text-xs text-muted">
      <OnionIcon size={13} />
      A Tor hidden service: reached through Tor only.
    </p>
  );
}

/** Why a scanned code was not a server address, in the core's words:
    pointing the wrong QR at it is the likely slip, so it is named. */
function ScanRefusal({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <p role="alert" className="mt-2 font-ui text-xs text-muted">
      {reason}
    </p>
  );
}
