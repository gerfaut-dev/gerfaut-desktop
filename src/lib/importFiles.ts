import type { RecognizedKind, TxSource } from "./ipc";

/** A kind of file an "Import a file" button opens: what it holds, the
    extensions it comes under, and what the core reads it as. */
export type ImportFile<Kind extends string> = {
  /** What the file holds, as the help line says it. */
  holds: string;
  extensions: readonly string[];
  /** The media types the system may give it under, beside its
      extensions. */
  mimeTypes: readonly string[];
  /** What the core reads such a file as. */
  kinds: readonly Kind[];
};

/** The `accept` of a file input that opens these files. */
export function acceptOf(files: readonly ImportFile<string>[]): string {
  return [
    ...new Set([
      ...files.flatMap((file) => file.extensions),
      ...files.flatMap((file) => file.mimeTypes),
    ]),
  ].join(",");
}

/** The line under an "Import a file" button: each content, then its
    extensions. */
export function hintOf(files: readonly ImportFile<string>[]): string {
  return `Reads ${new Intl.ListFormat("en", { type: "disjunction" }).format(
    files.map((file) => `${file.holds} (${file.extensions.join(", ")})`),
  )}.`;
}

/** The files a wallet is imported from. The file picker and the line
    under "Import a file" both come from here, so neither can promise
    what the other leaves out. */
export const WALLET_FILES: readonly ImportFile<RecognizedKind>[] = [
  {
    holds: "a descriptor, extended public key or address",
    extensions: [".txt", ".desc"],
    mimeTypes: ["text/plain"],
    kinds: ["descriptor", "descriptor_pair", "multipath_descriptor", "extended_key", "address"],
  },
  {
    holds: "a wallet export",
    extensions: [".json"],
    mimeTypes: ["application/json"],
    kinds: ["wallet_export"],
  },
  {
    holds: "a BSMS record",
    extensions: [".bsms"],
    mimeTypes: [],
    kinds: ["bsms"],
  },
];

export const WALLET_FILE_ACCEPT = acceptOf(WALLET_FILES);
export const WALLET_FILE_HINT = hintOf(WALLET_FILES);

/** The files a transaction to broadcast is imported from: binary as
    signers save them, or written out as text. The core tells a PSBT
    from a transaction by what the file holds, never by its name. */
export const TRANSACTION_FILES: readonly ImportFile<TxSource>[] = [
  {
    holds: "a PSBT",
    extensions: [".psbt"],
    mimeTypes: ["application/octet-stream"],
    kinds: ["psbt"],
  },
  {
    holds: "a signed transaction",
    extensions: [".txn", ".tx"],
    mimeTypes: ["application/octet-stream"],
    kinds: ["raw_transaction"],
  },
  {
    holds: "either one as text",
    extensions: [".txt", ".hex"],
    mimeTypes: ["text/plain"],
    kinds: ["psbt", "raw_transaction"],
  },
];

export const TRANSACTION_FILE_ACCEPT = acceptOf(TRANSACTION_FILES);
export const TRANSACTION_FILE_HINT = hintOf(TRANSACTION_FILES);
