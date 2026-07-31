import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COMMS_V2_PREFERENCE_TABLES, PREFERENCE_CATEGORIES } from "@/lib/communications/v2/preferences";
import { preferenceCategoryFor } from "@/lib/communications/eligibility/loadEligibilityContext";

/**
 * PKG-04 — recipients + per-person preferences + audit schema contract.
 * Additive-only; person-first; one preference row per person+category; full audit table.
 */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function migrationSql(): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_preferences_recipients"));
    expect(file, "PKG-04 migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

describe("PKG-04 preferences + recipients migration", () => {
    const sql = migrationSql();

    it("creates all three additive tables", () => {
        for (const t of Object.values(COMMS_V2_PREFERENCE_TABLES)) {
            expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
        }
    });

    it("models preferences PER PERSON with one row per person+category", () => {
        expect(sql).toMatch(/communication_preferences[\s\S]*person_id uuid NOT NULL/);
        expect(sql).toMatch(/UNIQUE \(org_id, person_id, category\)/);
    });

    it("records an immutable opt-in/out audit (from/to state + source/method/actor)", () => {
        expect(sql).toMatch(/communication_preference_events/);
        expect(sql).toMatch(/from_state text/);
        expect(sql).toMatch(/to_state text NOT NULL/);
        expect(sql).toMatch(/source text/);
        expect(sql).toMatch(/method text/);
        expect(sql).toMatch(/actor_user_id uuid/);
    });

    it("bounds recipient_role to to/cc/bcc", () => {
        expect(sql).toMatch(/recipient_role text NOT NULL DEFAULT 'to' CHECK \(recipient_role IN \('to', 'cc', 'bcc'\)\)/);
    });

    it("enables RLS with org-member SELECT + service_role ALL on all three tables", () => {
        for (const t of Object.values(COMMS_V2_PREFERENCE_TABLES)) {
            expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
            expect(sql).toMatch(new RegExp(`${t}_select_org`));
            expect(sql).toMatch(new RegExp(`${t}_service_all`));
        }
    });

    it("performs NO data backfill and NO send enforcement (scope guard)", () => {
        expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
        expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
    });

    it("contains NO destructive DDL", () => {
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });

    it("pins the exact per-person category vocabulary", () => {
        // Asserts the SET rather than a count. The previous form hardcoded
        // `length === 6`, so any legitimate addition failed without saying what
        // changed. Phase 0 added the *_operational pair: the classification
        // model distinguishes operational from transactional, and an
        // operational opt-out would otherwise map onto the transactional
        // preference — which is opt-out exempt — silently defeating it.
        //
        // The DB column is free text by design (20260619140000:30-31 defers the
        // vocabulary to TypeScript), so adding values needs no migration. This
        // test IS the guard against drift.
        expect([...PREFERENCE_CATEGORIES].sort()).toEqual(
            [
                "announcements",
                "email_marketing",
                "email_operational",
                "email_transactional",
                "emergency",
                "sms_marketing",
                "sms_operational",
                "sms_transactional",
            ].sort()
        );
    });

    it("provides a preference category for every (message category, provider channel) pair", () => {
        // Behavioral counterpart to the vocabulary pin: the eligibility gate
        // must be able to resolve a stored preference for every classification
        // it can be asked to evaluate. A missing mapping would silently skip
        // the consent check for that pair.
        for (const category of ["transactional", "operational", "marketing", "emergency"] as const) {
            for (const channel of ["email", "sms"] as const) {
                const resolved = preferenceCategoryFor(category, channel);
                expect(resolved, `${category}/${channel} must map to a preference`).toBeTruthy();
                expect(PREFERENCE_CATEGORIES).toContain(resolved!);
            }
        }
    });
});
