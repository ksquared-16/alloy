/**
 * D10-S1 — the communication_message_attachments migration, locked at the file (no database needed).
 *
 * The database behaviour is proven by certification/invariants/communication-message-attachments-preapply.sql on an
 * isolated certenv, inside a discarded transaction. That proof is only worth anything if what ran is exactly what will
 * be applied — so the invariant must BE the migration, byte for byte, followed by its banner and assertions.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const MIGRATION_FILE = "20261218090000_communication_message_attachments.sql";
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const migration = read(`supabase/migrations/${MIGRATION_FILE}`);
const invariant = read("certification/invariants/communication-message-attachments-preapply.sql");
const BANNER = "\n-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════\n-- PRE-APPLY INVARIANT";
const code = (sql: string) => sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

describe("the migration", () => {
    // "Newest version" held only until WS11 merged (PR #1632, applied to staging); later migrations follow it.
    it("is the only migration at its version in supabase/migrations", () => {
        const versions = readdirSync(resolve(ROOT, "supabase/migrations")).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
        expect(versions.filter((f) => f.startsWith("20261218090000"))).toEqual([MIGRATION_FILE]);
    });

    it("keeps provider_attachment_id: unique per message, required for a delivered part, optional only for a link", () => {
        const sql = code(migration);
        expect(sql).toMatch(/provider_attachment_id text NULL/);
        expect(sql).toMatch(/UNIQUE \(message_id, provider_attachment_id\)/);
        expect(sql).toMatch(/UNIQUE \(message_id, document_id\)/);
        expect(sql).toMatch(/CHECK \(disposition = 'link' OR provider_attachment_id IS NOT NULL\)/);
        expect(sql).toMatch(/document_id uuid NOT NULL REFERENCES public\.documents \(id\) ON DELETE RESTRICT/);
    });

    it("is service-role only: RLS on, no policy, every client privilege revoked, tenant-consistency trigger", () => {
        const sql = code(migration);
        expect(sql).toMatch(/ALTER TABLE public\.communication_message_attachments ENABLE ROW LEVEL SECURITY;/);
        expect(sql).toMatch(/REVOKE ALL ON public\.communication_message_attachments FROM PUBLIC, anon, authenticated;/);
        expect(sql).not.toMatch(/CREATE POLICY/i);
        expect(sql).not.toMatch(/GRANT [^;]* TO [^;]*\b(anon|authenticated)\b/i);
        expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.communication_message_attachments/);
        expect(sql).toMatch(/USING ERRCODE = 'check_violation'/);
    });

    it("writes no data and never controls its own transaction or ledger", () => {
        const sql = code(migration);
        expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/i);
        expect(sql).not.toMatch(/schema_migrations|\bBEGIN;|\bCOMMIT\b|\bROLLBACK\b/i);
    });
});

describe("the pre-apply invariant", () => {
    it("is the pending migration byte for byte, then the banner, then rollback-only assertions", () => {
        expect(invariant.startsWith(migration)).toBe(true);
        const tail = invariant.slice(migration.length);
        expect(tail.startsWith(BANNER)).toBe(true);
        expect(code(tail)).not.toMatch(/schema_migrations|\bCOMMIT\b|\bROLLBACK\b/i);
        expect(tail).toContain("tests passed=% failed=0");
    });

    it("runs the system writer's half as the service role, and returns to the owner before the client checks", () => {
        const tail = invariant.slice(migration.length);
        const asService = tail.indexOf("SET LOCAL ROLE service_role;");
        const back = tail.indexOf("SET LOCAL ROLE NONE;");
        expect(asService).toBeGreaterThan(-1);
        expect(back).toBeGreaterThan(asService);
        expect(tail.indexOf("$system_writer$")).toBeGreaterThan(asService);
        expect(tail.lastIndexOf("$system_writer$")).toBeLessThan(back);
    });
});
