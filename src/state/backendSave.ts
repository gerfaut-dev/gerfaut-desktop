import { create } from "zustand";
import { errorMessage, ipc } from "../lib/ipc";
import type { BackendCheck, BackendConfig, CertificateReport, Network } from "../lib/ipc";

/* A Save backend outlives the page it was pressed on. Checking an
   Electrum server's certificate takes as long as the server takes to
   answer, or to be given up on, and leaving Settings › Network
   meanwhile used to drop the answer: the certificate to accept was
   never asked about, the choice was lost and nothing said so. Held
   here, out of the form, the save goes on
   wherever the user is: its question opens over the page in view
   (`CertificateAsk`), and the form found again shows the save still
   under way, or why the core would not store it.

   The test that follows every save lives here too: through Tor it can
   take two minutes, and its answer must still be there when the form
   is found again. */

/** The save under way, from Save backend until it is stored, refused,
    or waits on the user. */
export interface BackendSaving {
  network: Network;
  config: BackendConfig;
  /** The server's certificate is being read: what the button says. */
  checking: boolean;
}

/** A certificate to settle before `config` is stored for `network`. */
export interface BackendAsk {
  network: Network;
  url: string;
  config: BackendConfig;
  report: CertificateReport;
}

/** Why the core would not store `config`, in its own words: said under
    Save backend, beside the address it refused. */
export interface BackendRefusal {
  config: BackendConfig;
  message: string;
}

/** What a test is about: the backend stored for the network, as the
    sentences need it. */
export interface TestedBackend {
  /** Electrum or Esplora: the same problem is said for each in its own
      words. */
  protocol: "electrum" | "esplora";
  /** A Tor hidden service: the wait is longer, and says so. */
  onion: boolean;
}

/** The test of a network's stored backend: under way, or what it found.
    A test under way whose form changed since is `stale`: it still keeps
    Save backend busy, and its answer is dropped. */
export type BackendTest = TestedBackend &
  ({ state: "testing"; run: number; stale: boolean } | { state: "done"; check: BackendCheck });

/** Tells one test from the next, for the answer that lands late. */
let runs = 0;

interface BackendSave {
  saving: BackendSaving | null;
  ask: BackendAsk | null;
  /** One refusal per network: a refusal on one never hides another's. */
  refusals: Partial<Record<Network, BackendRefusal>>;
  /** The network whose form is on screen, if one is. */
  viewing: Network | null;
  /** A network whose refusal landed while its form was not on screen:
      said over the page in view (`BackendRefusalNotice`), since a
      refusal waiting under a button nobody looks at says nothing. */
  unseen: Network | null;
  /** One test per network, said under Save backend. */
  tests: Partial<Record<Network, BackendTest>>;
}

export const useBackendSave = create<BackendSave>(() => ({
  saving: null,
  ask: null,
  refusals: {},
  viewing: null,
  unseen: null,
  tests: {},
}));

/** Says why `config` was not stored for `network`: under Save backend,
    and over the page in view when that form is not on screen. */
export function refuseBackend(network: Network, config: BackendConfig, message: string) {
  useBackendSave.setState((state) => ({
    refusals: { ...state.refusals, [network]: { config, message } },
    unseen: state.viewing === network ? state.unseen : network,
  }));
}

/** The form of `network` is on screen: what it shows needs no other
    word. Returns what to call when it leaves. */
export function viewBackendForm(network: Network) {
  useBackendSave.setState((state) => ({
    viewing: network,
    unseen: state.unseen === network ? null : state.unseen,
  }));
  return () =>
    useBackendSave.setState((state) => (state.viewing === network ? { viewing: null } : state));
}

/** Takes the refusal of `network` back, and that one only. */
export function clearBackendRefusal(network: Network) {
  useBackendSave.setState((state) => {
    if (!(network in state.refusals)) return state;
    const refusals = { ...state.refusals };
    delete refusals[network];
    return { refusals };
  });
}

/** Tests the backend stored for `network`, unless a test of it is
    already under way: one at a time per network. Its answer lands in
    the store whatever page is open, unless a newer test or an edit of
    the form took its place meanwhile. A command that fails says so as
    a failed test, in its own words. */
export async function testBackend(network: Network, backend: TestedBackend) {
  if (useBackendSave.getState().tests[network]?.state === "testing") return;
  const run = ++runs;
  const put = (test: BackendTest | undefined) =>
    useBackendSave.setState((state) => {
      const tests = { ...state.tests };
      if (test) tests[network] = test;
      else delete tests[network];
      return { tests };
    });
  put({ ...backend, state: "testing", run, stale: false });
  const check: BackendCheck = await ipc.checkBackend(network).catch((error: unknown) => ({
    outcome: "failed" as const,
    host: "",
    problem: "failed" as const,
    detail: errorMessage(error),
    server_network: null,
    tor: false,
  }));
  const current = useBackendSave.getState().tests[network];
  if (current?.state !== "testing" || current.run !== run) return;
  put(current.stale ? undefined : { ...backend, state: "done", check });
}

/** Takes back what the last test of `network` found: the form no
    longer holds what it was about. A test under way runs to its end,
    one at a time, and its answer is dropped. */
export function clearBackendTest(network: Network) {
  useBackendSave.setState((state) => {
    const test = state.tests[network];
    if (!test || (test.state === "testing" && test.stale)) return state;
    const tests = { ...state.tests };
    if (test.state === "testing") tests[network] = { ...test, stale: true };
    else delete tests[network];
    return { tests };
  });
}
