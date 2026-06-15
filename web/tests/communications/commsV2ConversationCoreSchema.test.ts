import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    COMMS_V2_CONVERSATION_TABLES,
    COMMS_V2_THREAD_CORE_COLUMNS,
    CONVERSATION_ASSIGNMENT_STATES,
} from "@/lib/communications/v2/conversationCore";

/**
 * PKG-02 — conversation core schema contract.
 * Asserts the additive migration adds the expected columns/tables/indexes/RLS,
 * stays in sync with the TS constants, and contains NO destructive DDL.
 */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function migrationSql(): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_conversation_core"));
    expect(file, "PKG-02 migration file present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

describe("PKG-02 conversation core migration", () => {
    const sql = migrationSql();

    it("adds every PKG-02 thread column (additive)", () => {
        for (const col of COMMS_V2_THREAD_CORE_COLUMNS) {
            expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
        }
    });

    it("creates the two append-only audit tables", () => {
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.conversation_assignment_events/);
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.sla_events/);
    });

    it("bounds assignment_state to the documented vocabulary", () => {
        for (const s of CONVERSATION_ASSIGNMENT_STATES) {
            expect(sql).toContain(`'${s}'`);
        }
        expect(sql).toMatch(/communication_threads_assignment_state_chk/);
    });

    it("adds operational indexes", () => {
        expect(sql).toMatch(/idx_comm_threads_org_attention/);
        expect(sql).toMatch(/idx_comm_threads_org_assignment/);
        expect(sql).toMatch(/idx_comm_threads_org_assigned_user/);
    });

    it("enables RLS with org-member SELECT + service_role ALL on both audit tables", () => {
        expect(sql).toMatch(/ALTER TABLE public\.conversation_assignment_events ENABLE ROW LEVEL SECURITY/);
        expect(sql).toMatch(/ALTER TABLE public\.sla_events ENABLE ROW LEVEL SECURITY/);
        expect(sql).toMatch(/conversation_assignment_events_select_org/);
        expect(sql).toMatch(/conversation_assignment_events_service_all/);
        expect(sql).toMatch(/sla_events_select_org/);
        expect(sql).toMatch(/sla_events_service_all/);
    });

    it("contains NO destructive DDL (additive-only guardrail)", () => {
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
        expect(sql).not.toMatch(/\bALTER\s+COLUMN\b[\s\S]*\bDROP\b/i);
    });

    it("keeps TS constants in sync with canonical table names", () => {
        expect(COMMS_V2_CONVERSATION_TABLES.assignmentEvents).toBe("conversation_assignment_events");
        expect(COMMS_V2_CONVERSATION_TABLES.slaEvents).toBe("sla_events");
        expect(COMMS_V2_CONVERSATION_TABLES.threads).toBe("communication_threads");
        expect(COMMS_V2_THREAD_CORE_COLUMNS.length).toBe(8);
    });
});
