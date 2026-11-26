import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../..");

describe("useBosRailOverlayDrawerDocumentFlag", () => {
    it("does not observe body childList mutations while BOS is open", () => {
        const src = readFileSync(
            resolve(webRoot, "lib/bos/useBosRailOverlayDrawerDocumentFlag.ts"),
            "utf8"
        );
        expect(src).toContain("childList: false");
        expect(src).toContain("requestAnimationFrame");
        expect(src).not.toMatch(/childList:\s*true/);
    });
});
