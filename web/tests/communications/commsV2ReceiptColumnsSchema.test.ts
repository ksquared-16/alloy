import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    DELIVERY_EVENT_EXTRA_COLUMNS,
    MESSAGE_RECIPIENT_DELIVERY_COLUMNS,
    DELIVERY_EVENT_IDEMPOTENCY_INDEX,
} from "@/lib/communications/v2/receiptColumns";

/**
 * Messaging Infrastructure P1 — additive receipt-column migration contract.
 * Asserts the ALTERs add the receipt columns + idempotency index to the EXISTING tables,
 * create NO new communication_delivery_events / communication_message_recipients tables,
 * and contain NO destructive DDL.
 */
const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function migrationSql(): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_receipt_columns"));
    expect(file, "P1 receipt-columns migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

describe("P1 receipt-column migration (additive)", () => {
    const sql = migrationSql();

    it("adds the provider/recipient identity columns to communication_delivery_events", () => {
        for (const col of DELIVERY_EVENT_EXTRA_COLUMNS) {
            expect(sql, `delivery_events.${col}`).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
        }
    });

    it("adds per-recipient delivery state columns to communication_message_recipients", () => {
        for (const col of MESSAGE_RECIPIENT_DELIVERY_COLUMNS) {
            expect(sql, `recipients.${col}`).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
        }
    });

    it("creates the idempotency unique index on (provider, provider_event_id)", () => {
        expect(sql).toMatch(new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${DELIVERY_EVENT_IDEMPOTENCY_INDEX}`));
        expect(sql).toMatch(/\(provider,\s*provider_event_id\)\s*\n?\s*WHERE provider_event_id IS NOT NULL/);
    });

    it("does NOT create new receipt tables (must ALTER the existing ones)", () => {
        expect(sql).not.toMatch(/CREATE TABLE[^;]*communication_delivery_events/i);
        expect(sql).not.toMatch(/CREATE TABLE[^;]*communication_message_recipients/i);
    });

    it("contains NO destructive DDL (additive-only guardrail)", () => {
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });

    it("backfills recipients only for outbound messages, idempotently", () => {
        expect(sql).toMatch(/INSERT INTO public\.communication_message_recipients/);
        expect(sql).toMatch(/direction = 'outbound'/);
        expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.communication_message_recipients/);
    });
});
