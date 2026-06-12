import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    COMMS_V2_DELIVERY_EVENTS_TABLE,
    DELIVERY_EVENT_TYPES,
    MESSAGE_RECEIPT_COLUMNS,
} from "@/lib/communications/v2/deliveryEvents";

/**
 * PKG-03 — delivery events + receipts schema contract.
 * Asserts the additive migration adds receipt columns + the provider-neutral events table,
 * stays in sync with TS constants, and contains NO destructive DDL.
 */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function migrationSql(): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_delivery_events_receipts"));
    expect(file, "PKG-03 migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

describe("PKG-03 delivery events + receipts migration", () => {
    const sql = migrationSql();

    it("adds receipt columns to communication_messages (additive)", () => {
        for (const col of MESSAGE_RECEIPT_COLUMNS) {
            expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
        }
    });

    it("creates the provider-neutral delivery events table", () => {
        expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${COMMS_V2_DELIVERY_EVENTS_TABLE}`));
        expect(sql).toMatch(/message_id uuid NOT NULL REFERENCES public\.communication_messages/);
        // provider is an opaque nullable string — no provider-specific columns
        expect(sql).toMatch(/provider text NULL/);
    });

    it("adds delivery event indexes", () => {
        expect(sql).toMatch(/idx_comm_delivery_events_message/);
        expect(sql).toMatch(/idx_comm_delivery_events_org_type/);
    });

    it("enables RLS with org-member SELECT + service_role ALL", () => {
        expect(sql).toMatch(/ALTER TABLE public\.communication_delivery_events ENABLE ROW LEVEL SECURITY/);
        expect(sql).toMatch(/communication_delivery_events_select_org/);
        expect(sql).toMatch(/communication_delivery_events_service_all/);
    });

    it("contains NO destructive DDL (additive-only guardrail)", () => {
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });

    it("keeps a provider-neutral event vocabulary in sync", () => {
        expect(DELIVERY_EVENT_TYPES).toContain("opened");
        expect(DELIVERY_EVENT_TYPES).toContain("clicked");
        expect(DELIVERY_EVENT_TYPES).toContain("replied");
        expect(MESSAGE_RECEIPT_COLUMNS.length).toBe(3);
    });
});
