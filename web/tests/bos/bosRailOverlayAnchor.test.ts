import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BOS_RAIL_OVERLAY_BOTTOM_INSET } from "@/lib/bos/bosRailOverlayAnchor";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("bosRailOverlayAnchor", () => {
    it("uses safe-area bottom inset", () => {
        expect(BOS_RAIL_OVERLAY_BOTTOM_INSET).toContain("safe-area-inset-bottom");
        expect(BOS_RAIL_OVERLAY_BOTTOM_INSET).toContain("32px");
    });

    it("detects workspace command column hosts via closest selector", () => {
        const src = read("lib/bos/bosRailOverlayAnchor.ts");
        expect(src).toContain("data-adminv2-workspace-command-column");
        expect(src).toContain("closest");
    });
});
