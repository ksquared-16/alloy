import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    ANNOUNCEMENT_CHANNELS,
    ANNOUNCEMENT_RECIPIENT_STATUSES,
    ANNOUNCEMENT_STATUSES,
    ANNOUNCEMENT_TARGET_TYPES,
    COMMS_V2_ANNOUNCEMENT_TABLES,
} from "@/lib/communications/v2/announcementSchema";

/**
 * Comms V2 Phase 1 / B4 — announcements schema skeleton contract.
 * Additive-only; CHECK-constrained vocabularies kept in sync with announcementSchema.ts;
 * RLS: org-member SELECT + service_role ALL. No send/provider/seed.
 */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function migrationSql(): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_announcements"));
    expect(file, "B4 announcements migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

describe("B4 announcements migration", () => {
    const sql = migrationSql();

    it("creates all three additive tables", () => {
        for (const t of Object.values(COMMS_V2_ANNOUNCEMENT_TABLES)) {
            expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
        }
    });

    it("CHECK-constrains announcement status to the TS vocabulary", () => {
        const list = ANNOUNCEMENT_STATUSES.map((c) => `'${c}'`).join(", ");
        expect(sql).toContain(`CHECK (status IN (${list}))`);
    });

    it("CHECK-constrains target_type to the TS vocabulary", () => {
        const list = ANNOUNCEMENT_TARGET_TYPES.map((c) => `'${c}'`).join(", ");
        expect(sql).toContain(`CHECK (target_type IN (${list}))`);
    });

    it("CHECK-constrains recipient status to the B4-era vocabulary (redefined as a rollup in B7)", () => {
        // The B4 migration created the original recipient-status CHECK; B7 redefines it
        // (queued → scheduled) in 20260622130000_comms_v2_announcement_scheduling.sql.
        expect(sql).toContain("CHECK (status IN ('pending', 'queued', 'sent', 'skipped', 'failed'))");
    });

    it("constrains channels to a subset of the channel vocabulary and guards scheduled.send_at", () => {
        const list = ANNOUNCEMENT_CHANNELS.map((c) => `'${c}'`).join(", ");
        expect(sql).toContain(`CHECK (channels <@ ARRAY[${list}]::text[])`);
        expect(sql).toMatch(/CHECK \(status <> 'scheduled' OR send_at IS NOT NULL\)/);
    });

    it("links template_id and communication_message_id with ON DELETE SET NULL", () => {
        expect(sql).toContain("REFERENCES public.communication_templates (id) ON DELETE SET NULL");
        expect(sql).toContain("REFERENCES public.communication_messages (id) ON DELETE SET NULL");
    });

    it("snapshots recipients uniquely per announcement+person+channel", () => {
        expect(sql).toMatch(/UNIQUE \(announcement_id, person_id, channel\)/);
    });

    it("enables RLS with org-member SELECT + service_role ALL on all three tables", () => {
        for (const t of Object.values(COMMS_V2_ANNOUNCEMENT_TABLES)) {
            expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
            expect(sql).toMatch(new RegExp(`${t}_select_org`));
            expect(sql).toMatch(new RegExp(`${t}_service_all`));
        }
    });

    it("performs NO data backfill / seed (scope guard)", () => {
        expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
        expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
    });

    it("contains NO destructive DDL and NO send/provider code", () => {
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/twilio|sendgrid|resend|webhook/i);
    });

    it("keeps the bounded vocabularies the expected size", () => {
        expect(ANNOUNCEMENT_STATUSES.length).toBe(4);
        expect(ANNOUNCEMENT_CHANNELS.length).toBe(3);
        expect(ANNOUNCEMENT_TARGET_TYPES.length).toBe(7);
        expect(ANNOUNCEMENT_RECIPIENT_STATUSES.length).toBe(5);
    });
});
