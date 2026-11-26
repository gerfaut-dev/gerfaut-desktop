import { describe, expect, it } from "vitest";
import { coreFixtures } from "../test/core";
import { TRANSACTION_FILES, WALLET_FILES } from "./importFiles";

/** The core's reference JSON names everything it reads from a file. A
    kind it adds, or one it drops, has to change what the help line
    under "Import a file" promises. */
describe("import files", () => {
  it("names each kind of wallet material the core reads, once", () => {
    const core = Object.keys(coreFixtures.get("RecognizedKind") ?? {});
    const named = WALLET_FILES.flatMap((file) => file.kinds);
    expect(core.length).toBeGreaterThan(0);
    expect([...named].sort()).toEqual([...core].sort());
  });

  it("names each form of transaction the core reads", () => {
    const core = Object.keys(coreFixtures.get("TxSource") ?? {});
    const named = new Set(TRANSACTION_FILES.flatMap((file) => file.kinds));
    expect(core.length).toBeGreaterThan(0);
    expect(named).toEqual(new Set(core));
  });
});
