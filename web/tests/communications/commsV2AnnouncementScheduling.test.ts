import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    ANNOUNCEMENT_RECIPIENT_STATUSES,
    ANNOUNCEMENT_SCHEDULED_SEND_SOURCE,
} from "@/lib/communications/v2/announcementSchema";

/**
 * Comms V2 Phase 1 / B7 — generalize the single scheduler; schedule/cancel/fan-out.
 * Doctrine guards: one scheduler (communication_scheduled_sends), no second execution table,
 * announcement execution gated off (Phase 3), no provider send code, org-scoped.
 */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");
const WEB = process.cwd();

function migrationSql(): string {
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_announcement_scheduling"));
    expect(file, "B7 migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}
function read(rel: string): string {
    const p = join(WEB, rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("B7 migration — generalize communication_scheduled_sends", () => {
    const sql = migrationSql();

    it("adds source='announcement' and a nullable announcement_id FK", () => {
        expect(sql).toMatch(/source = ANY \(ARRAY\['task_assist'::text, 'tour_scheduling'::text, 'announcement'::text\]\)/);
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS announcement_id uuid NULL");
        expect(sql).toContain("REFERENCES public.announcements (id) ON DELETE CASCADE");
    });

    it("relaxes the opportunity coupling but keeps it for existing sources", () => {
        expect(sql).toMatch(/entity_type = ANY \(ARRAY\['opportunities'::text, 'announcements'::text\]\)/);
        expect(sql).toMatch(/ALTER COLUMN entity_id DROP NOT NULL/);
        expect(sql).toMatch(/source = 'announcement' AND announcement_id IS NOT NULL AND entity_type = 'announcements'/);
        expect(sql).toMatch(/entity_id IS NOT NULL AND entity_type = 'opportunities'/);
    });

    it("GATES announcement execution off in the due-claim (Phase 3)", () => {
        expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_due_communication_scheduled_sends");
        expect(sql).toMatch(/css\.source = ANY \(ARRAY\['task_assist'::text, 'tour_scheduling'::text\]\)/);
        // announcement is NOT in the claim list
        expect(sql).not.toMatch(/css\.source = ANY \(ARRAY\[[^)]*'announcement'/);
    });

    it("redefines announcement_recipients.status as a rollup (queued → scheduled) + back-link", () => {
        expect(sql).toContain("CHECK (status IN ('pending', 'scheduled', 'skipped', 'sent', 'failed'))");
        expect(sql).toContain("communication_scheduled_send_id uuid NULL");
        expect(ANNOUNCEMENT_RECIPIENT_STATUSES).toEqual(["pending", "scheduled", "skipped", "sent", "failed"]);
    });

    it("creates NO second scheduler/execution table", () => {
        expect(sql).not.toMatch(/CREATE TABLE[^;]*scheduled/i);
    });
});

describe("B7 schedule service — reuses the spine, no provider send", () => {
    const svc = read("lib/communications/v2/scheduleAnnouncementSendout.ts");

    it("tags execution rows with source='announcement' in the shared table", () => {
        expect(svc).toContain('.from("communication_scheduled_sends")');
        expect(svc).toContain("ANNOUNCEMENT_SCHEDULED_SEND_SOURCE");
        expect(ANNOUNCEMENT_SCHEDULED_SEND_SOURCE).toBe("announcement");
    });

    it("scopes every table access by org_id (eq for reads/updates, payload for inserts)", () => {
        const fromCount = (svc.match(/\.from\("/g) ?? []).length;
        const eqOrg = (svc.match(/\.eq\("org_id", orgId\)/g) ?? []).length;
        const insertOrg = (svc.match(/org_id: orgId/g) ?? []).length;
        expect(fromCount).toBeGreaterThan(0);
        expect(eqOrg + insertOrg).toBeGreaterThanOrEqual(fromCount);
    });

    it("does NOT send / touch a provider (scheduling only)", () => {
        expect(svc).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
        expect(svc).not.toMatch(/twilio|sendgrid|resend|webhook/i);
        expect(svc).not.toMatch(/communication_messages/);
    });

    it("writes only campaign + the shared scheduler tables (no new execution table)", () => {
        const tables = [...svc.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
        const allowed = new Set([
            "announcements",
            "announcement_targets",
            "announcement_recipients",
            "communication_scheduled_sends",
            "communication_provider_bindings",
        ]);
        for (const t of tables) expect(allowed.has(t), `unexpected table: ${t}`).toBe(true);
    });

    it("provider-unavailable becomes skipped, never queued", () => {
        // the pure planner decides this; the service must not invent a 'queued' state
        expect(svc).not.toMatch(/status:\s*["'`]queued["'`]/);
    });
});

describe("B7 routes — admin pattern + org scoping via service", () => {
    for (const rel of [
        "app/api/admin/communications/announcements/[id]/schedule/route.ts",
        "app/api/admin/communications/announcements/[id]/cancel/route.ts",
    ]) {
        const src = read(rel);
        it(`${rel} uses the admin pattern and delegates org-scoped work`, () => {
            expect(src).toMatch(/await requireAdminOrOps\(\)/);
            expect(src).toMatch(/if \(!ctx\.ok\) return adminContextFailureResponse\(ctx\)/);
            expect(src).toMatch(/ctx\.orgId/);
            expect(src).not.toMatch(/executeCommunicationsSend|twilio|resend/i);
        });
    }
});
