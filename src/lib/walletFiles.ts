import type { RecognizedKind } from "./ipc";

/** A kind of file "Import a file" opens for a wallet: what it holds,
    the extensions it comes under, and what the core reads it as. */
export type WalletFile = {
  /** What the file holds, as the help line says it. */
  holds: string;
  extensions: readonly string[];
  /** The media types the system may give it under, beside its
      extensions. */
  mimeTypes: readonly string[];
  /** What the core recognizes such a file as. */
  kinds: readonly RecognizedKind[];
};

/** The files a wallet is imported from. The file picker and the line
    under "Import a file" both come from here, so neither can promise
    what the other leaves out. */
export const WALLET_FILES: readonly WalletFile[] = [
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

/** The `accept` of the file input. */
export const WALLET_FILE_ACCEPT = [
  ...WALLET_FILES.flatMap((file) => file.extensions),
  ...WALLET_FILES.flatMap((file) => file.mimeTypes),
].join(",");

/** The line under "Import a file": each content, then its extensions. */
export const WALLET_FILE_HINT = `Reads ${new Intl.ListFormat("en", { type: "disjunction" }).format(
  WALLET_FILES.map((file) => `${file.holds} (${file.extensions.join(", ")})`),
)}.`;
