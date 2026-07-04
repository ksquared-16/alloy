import { describe, expect, it } from "vitest";
import {
    resolveConfiguredDefaultCreateStatusKey,
    type StatusDefinitionRow,
} from "@/lib/admin/statusDefinitionsResolve";

/**
 * §9 — the opportunity status configuration OWNS the Create Lead status. A status_definitions row
 * flagged metadata.default_on_create designates it; Create Lead reads this instead of hardcoding.
 */
function row(over: Partial<StatusDefinitionRow>): StatusDefinitionRow {
    return {
        id: over.status_key ?? "id",
        org_id: "org",
        industry_key: null,
        entity_type: "opportunities",
        status_key: over.status_key ?? "open",
        status_label: over.status_label ?? null,
        sort_order: over.sort_order ?? 100,
        is_active: true,
        is_system: false,
        metadata: over.metadata ?? null,
    };
}

describe("resolveConfiguredDefaultCreateStatusKey", () => {
    it("returns the status flagged metadata.default_on_create", () => {
        const defs = [
            row({ status_key: "closed", sort_order: 20 }),
            row({ status_key: "open", sort_order: 10, metadata: { default_on_create: true } }),
        ];
        expect(resolveConfiguredDefaultCreateStatusKey(defs)).toBe("open");
    });

    it("returns null when none is flagged (caller falls back to the canonical default)", () => {
        const defs = [row({ status_key: "open" }), row({ status_key: "closed" })];
        expect(resolveConfiguredDefaultCreateStatusKey(defs)).toBeNull();
    });

    it("lowest sort_order wins when more than one is flagged (misconfiguration)", () => {
        const defs = [
            row({ status_key: "b", sort_order: 20, metadata: { default_on_create: true } }),
            row({ status_key: "a", sort_order: 10, metadata: { default_on_create: true } }),
        ];
        expect(resolveConfiguredDefaultCreateStatusKey(defs)).toBe("a");
    });

    it("ignores a non-true default_on_create value", () => {
        const defs = [row({ status_key: "open", metadata: { default_on_create: "yes" } })];
        expect(resolveConfiguredDefaultCreateStatusKey(defs)).toBeNull();
    });
});
