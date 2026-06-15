import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    getOptionSetMode,
    mergeOptionSetConfigForWrite,
    normalizeOptionSetConfig,
    validateOptionSetConfig,
} from "@/lib/fields/optionSetConfig";
import {
    PLATFORM_REFERENCE_OPTION_SET_KEYS,
    PLATFORM_REFERENCE_OPTION_SET_SEEDS,
} from "@/lib/fields/platformReferenceOptionSetSeeds";

describe("optionSetConfig validation", () => {
    it("normalizes empty config to static default", () => {
        expect(normalizeOptionSetConfig(null)).toEqual({ version: 1, mode: "static" });
        expect(normalizeOptionSetConfig({})).toEqual({ version: 1, mode: "static" });
    });

    it("accepts static mode without reference or cascade", () => {
        const res = validateOptionSetConfig({ version: 1, mode: "static" });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.config).toEqual({ version: 1, mode: "static" });
    });

    it("rejects static mode with reference block", () => {
        const res = validateOptionSetConfig({
            version: 1,
            mode: "static",
            reference: { entity: "locations", value_field: "id", label_field: "label" },
        });
        expect(res.ok).toBe(false);
    });

    it("accepts reference mode with filters and cascade", () => {
        const res = validateOptionSetConfig({
            version: 1,
            mode: "reference",
            reference: {
                entity: "locations",
                value_field: "id",
                label_field: "label",
                filters: [{ field: "location_type", operator: "eq", value: "site" }],
            },
            cascade: {
                depends_on: [{ bind_to_filter: "parent_location_id" }],
            },
        });
        expect(res.ok).toBe(true);
    });

    it("rejects unknown reference entity", () => {
        const res = validateOptionSetConfig({
            version: 1,
            mode: "reference",
            reference: {
                entity: "agencies",
                value_field: "id",
                label_field: "name",
            },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("reference.entity");
    });

    it("rejects reference mode without reference block", () => {
        const res = validateOptionSetConfig({ version: 1, mode: "reference" });
        expect(res.ok).toBe(false);
    });

    it("merges config patches for write", () => {
        const existing = {
            version: 1,
            mode: "reference",
            reference: {
                entity: "locations",
                value_field: "id",
                label_field: "label",
                filters: [{ field: "location_type", operator: "eq", value: "site" }],
            },
        };
        const merged = mergeOptionSetConfigForWrite(existing, { mode: "reference" });
        expect(getOptionSetMode(merged)).toBe("reference");
        expect(merged.reference?.entity).toBe("locations");
    });
});

describe("platform reference option set seeds", () => {
    it("defines schools, programs, and rooms seeds", () => {
        expect(PLATFORM_REFERENCE_OPTION_SET_KEYS).toEqual(["schools", "programs", "rooms"]);
        for (const seed of PLATFORM_REFERENCE_OPTION_SET_SEEDS) {
            const res = validateOptionSetConfig(seed.config);
            expect(res.ok, `${seed.set_key} config invalid: ${!res.ok ? res.error : ""}`).toBe(true);
            if (res.ok) expect(res.config.mode).toBe("reference");
        }
    });

    it("migration seeds schools, programs, rooms with reference config", () => {
        const sql = readFileSync(
            join(process.cwd(), "../supabase/migrations/20260618120000_option_sets_config_reference_seeds.sql"),
            "utf8"
        );
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS config jsonb");
        for (const key of PLATFORM_REFERENCE_OPTION_SET_KEYS) {
            expect(sql).toContain(`'${key}'`);
            expect(sql).toContain('"mode": "reference"');
        }
    });
});

describe("option sets API route wiring", () => {
    it("list route selects config column", () => {
        const src = readFileSync(join(process.cwd(), "app/api/admin/option-sets/route.ts"), "utf8");
        expect(src).toContain("validateOptionSetConfig");
        expect(src).toContain("config");
    });

    it("detail route PATCH accepts config", () => {
        const src = readFileSync(join(process.cwd(), "app/api/admin/option-sets/[setKey]/route.ts"), "utf8");
        expect(src).toContain("mergeOptionSetConfigForWrite");
        expect(src).toContain("body.config");
    });
});

describe("option sets settings nav copy", () => {
    it("uses Option sets label in configuration workspace", () => {
        const src = readFileSync(join(process.cwd(), "lib/adminV2/configurationWorkspaceDomains.ts"), "utf8");
        expect(src).toContain('label: "Option sets"');
        expect(src).not.toContain('label: "Option lists"');
    });
});
