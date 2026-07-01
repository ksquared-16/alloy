/**
 * Shared prepare path for PUT + agent v1 (mirrors queue v0 prepare tests).
 */
import { describe, expect, it } from "vitest";
import { prepareRecordOverviewLayoutPut } from "@/lib/agent/v1/applyRecordOverviewLayoutUpdate";

const validConfig = {
    version: 1,
    header_keys: ["title"],
    bands: [
        {
            band_key: "summary",
            enabled: true,
            items: [{ kind: "system_field" as const, key: "title" }],
        },
    ],
};

describe("prepareRecordOverviewLayoutPut", () => {
    it("success when expected_config_version matches stored (missing version → 0)", () => {
        const r = prepareRecordOverviewLayoutPut({}, validConfig, 0);
        expect(r.ok).toBe(true);
    });

    it("409 stale when expected_config_version does not match stored", () => {
        const r = prepareRecordOverviewLayoutPut({ version: 2 }, validConfig, 0);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(409);
    });
});
