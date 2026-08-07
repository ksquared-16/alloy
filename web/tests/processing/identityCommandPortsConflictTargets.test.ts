/**
 * BOS create-lead confirm fails when IdentityCommandPorts upsert ON CONFLICT targets
 * do not match live unique indexes (Postgres 42P10).
 *
 * Live schema (docs/supabase/reference/supabase_constraints.csv):
 * - customer_persons: UNIQUE (org_id, customer_id, person_id, role_type)
 * - opportunity_persons: UNIQUE (opportunity_id, person_id)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ports = readFileSync(
    resolve(__dirname, "../../lib/pos/processingIdentity/commands/ports.ts"),
    "utf8",
);

describe("IdentityCommandPorts upsert conflict targets match live uniques", () => {
    const conflictTargets = [...ports.matchAll(/onConflict:\s*"([^"]+)"/g)].map((m) => m[1]);

    it("customer_persons ON CONFLICT includes role_type", () => {
        expect(conflictTargets).toContain("org_id,customer_id,person_id,role_type");
        expect(conflictTargets).not.toContain("org_id,customer_id,person_id");
    });

    it("opportunity_persons ON CONFLICT is opportunity_id,person_id", () => {
        expect(conflictTargets).toContain("opportunity_id,person_id");
        expect(conflictTargets).not.toContain("org_id,opportunity_id,person_id");
    });
});
