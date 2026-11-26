import { describe, expect, it } from "vitest";
import { coreFixtures } from "../test/core";
import { WALLET_FILES } from "./walletFiles";

describe("wallet files", () => {
  /** The core's reference JSON names every kind of material it reads.
      A kind it adds, or one it drops, has to change what the help line
      under "Import a file" promises. */
  it("names each kind the core reads, once", () => {
    const core = Object.keys(coreFixtures.get("RecognizedKind") ?? {});
    const named = WALLET_FILES.flatMap((file) => file.kinds);
    expect(core.length).toBeGreaterThan(0);
    expect([...named].sort()).toEqual([...core].sort());
  });
});
