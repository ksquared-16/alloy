import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
} from "@/lib/fields/customerMemberFieldRegistry";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * HEALTH PROFILE READ-SHAPE CONTRACT (P0-7.6 Part 5).
 *
 * The A′ repair replaces a three-hop profile read with one hop that filters `field_values`
 * through an embedded `field_definitions`. Deployed parity matched 5/5 non-empty subjects, but
 * every one carried a single key, so sampling alone cannot say the repair is safe for every
 * shape the contract can produce.
 *
 * This closes that by CONSTRAINT rather than by sampling: the manifest fixes `field_type` to
 * `text | select` for every key the Health first-order contract consumes, and both resolve
 * through `value_text`. The number/date/json/boolean branches of `displayFromFieldValueRow` are
 * therefore unreachable for these keys — so they are not coverage the repair owes, and inventing
 * a requirement for them would be inventing a gate.
 *
 * If a future key is added with another type, the first assertion fails and the repair must be
 * re-proved against the new shape before it ships. That is the point of stating it as a lock.
 */
describe("Health profile read shape", () => {
    it("every consumed key is text or select — so value_text is the only shape in play", () => {
        const types = new Set(CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((r) => r.field_type));
        expect([...types].sort()).toEqual(["select", "text"]);
        expect(CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.length).toBe(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.length);
    });

    it("THE LOCK: a key typed number/date/json would break this, on purpose", () => {
        // Stated as an explicit inventory rather than a loose predicate, so ADDING a typed key is
        // a deliberate act that fails here first.
        for (const row of CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST) {
            expect(["text", "select"], `field_key ${row.field_key} introduces a new storage shape`).toContain(row.field_type);
        }
    });

    it("the repaired 1-hop query still selects every value column, so a type change degrades rather than silently drops", () => {
        const ROUTE = read("app/api/admin/p076-first-order-prototype/route.ts");
        for (const col of ["value_text", "value_number", "value_date", "value_json"]) {
            expect(ROUTE, `1-hop query must carry ${col}`).toContain(col);
        }
    });

    it("the repaired query preserves org scope, entity grain and definition semantics", () => {
        const ROUTE = read("app/api/admin/p076-first-order-prototype/route.ts");
        const at = ROUTE.indexOf("health_profile_repaired_1hop");
        const block = ROUTE.slice(at, at + 900);
        // Dropping any of these would widen the read across tenants, grains or inactive defs.
        expect(block).toContain('.eq("org_id", orgId)');
        expect(block).toContain('.eq("entity_type", "customer_member")');
        expect(block).toContain('field_definitions.is_active');
        expect(block).toContain("field_definitions.field_key");
    });
});
