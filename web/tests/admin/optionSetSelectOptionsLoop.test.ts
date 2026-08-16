/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RENDER-LOOP GUARD — `useOptionSetSelectOptions`.
 *
 * Callers pass an inline array: `IdentityFieldValue` builds
 * `editControl.kind === "select" && isEditing ? [optionSetKey] : []` during render, so `setKeys`
 * is a new reference every render and the internal `useMemo` cannot hold. The effect listed
 * `normalizedKeys` in its dependencies and setStates, so it re-ran on every render — an
 * unconditional loop.
 *
 * Measured on Firefly's Household drill-in: opening ONE identity field editor produced 549
 * "Maximum update depth exceeded" errors and typing produced another 372. After depending on
 * the value-stable `keysSignature` alone: 0 across drill-in, edit-open, typing and save.
 */
const src = readFileSync(
    join(__dirname, "..", "..", "lib/admin/hooks/useOptionSetSelectOptions.ts"),
    "utf8",
);
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("useOptionSetSelectOptions — effect deps", () => {
    it("depends on the value-stable signature, never the array identity", () => {
        expect(code).toContain("}, [keysSignature]);");
    });

    it("does not list normalizedKeys in the effect deps", () => {
        expect(code).not.toContain("[keysSignature, normalizedKeys]");
    });

    it("still derives the signature from the normalized keys", () => {
        expect(code).toContain('const keysSignature = normalizedKeys.join("\\0")');
    });
});
