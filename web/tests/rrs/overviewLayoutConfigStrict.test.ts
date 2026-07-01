import { describe, expect, it } from "vitest";
import {
    getOverviewLayoutConfigStoredVersion,
    parseOverviewLayoutConfigStrict,
} from "@/lib/rrs/overview/overviewLayoutConfigStrict";

const minimalBand = {
    band_key: "summary",
    enabled: true,
    items: [{ kind: "system_field" as const, key: "title" }],
};

const validConfig = {
    version: 1,
    header_keys: ["title"],
    bands: [minimalBand],
};

describe("getOverviewLayoutConfigStoredVersion", () => {
    it("treats missing version as 0", () => {
        expect(getOverviewLayoutConfigStoredVersion({})).toBe(0);
        expect(getOverviewLayoutConfigStoredVersion({ header_keys: [] })).toBe(0);
    });

    it("reads integer version", () => {
        expect(getOverviewLayoutConfigStoredVersion({ version: 2 })).toBe(2);
    });
});

describe("parseOverviewLayoutConfigStrict", () => {
    it("rejects unknown top-level keys", () => {
        const r = parseOverviewLayoutConfigStrict({
            ...validConfig,
            extra: 1,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("unknown key");
    });

    it("requires version >= 1", () => {
        expect(parseOverviewLayoutConfigStrict({ ...validConfig, version: 0 }).ok).toBe(false);
        expect(parseOverviewLayoutConfigStrict({ bands: [], header_keys: [] }).ok).toBe(false);
    });

    it("maps field kind to system_field", () => {
        const r = parseOverviewLayoutConfigStrict({
            version: 1,
            header_keys: ["title"],
            bands: [
                {
                    band_key: "summary",
                    enabled: true,
                    items: [{ kind: "field", key: "title" }],
                },
            ],
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            const bands = r.value.bands as { items: { kind: string }[] }[];
            expect(bands[0].items[0].kind).toBe("system_field");
        }
    });

    it("rejects invalid relationship_group_keys", () => {
        const r = parseOverviewLayoutConfigStrict({
            ...validConfig,
            relationship_group_keys: ["unknown"],
        });
        expect(r.ok).toBe(false);
    });

    it("accepts valid relationship_group_keys", () => {
        const r = parseOverviewLayoutConfigStrict({
            ...validConfig,
            relationship_group_keys: ["primary_customer_person"],
        });
        expect(r.ok).toBe(true);
    });

    it("requires enabled boolean on bands", () => {
        const r = parseOverviewLayoutConfigStrict({
            version: 1,
            header_keys: ["title"],
            bands: [{ band_key: "summary", enabled: "yes", items: [] }],
        });
        expect(r.ok).toBe(false);
    });
});
