import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    COMMS_V2_TEMPLATE_TABLES,
    TEMPLATE_CATEGORIES,
    TEMPLATE_CHANNELS,
    TEMPLATE_STATUSES,
} from "@/lib/communications/v2/templateSchema";

/**
 * Comms V2 Phase 1 / B1 — templates + immutable versions schema contract.
 * Additive-only; CHECK-constrained vocabularies kept in sync with templateSchema.ts;
 * RLS: org-member SELECT + service_role ALL. No APIs/UI/announcements/provider/seed.
 */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function migrationSql(): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_templates"));
    expect(file, "B1 templates migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

describe("B1 templates + versions migration", () => {
    const sql = migrationSql();

    it("creates both additive tables", () => {
        for (const t of Object.values(COMMS_V2_TEMPLATE_TABLES)) {
            expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
        }
    });

    it("declares the required template columns", () => {
        for (const col of [
            "org_id uuid NOT NULL",
            "name text NOT NULL",
            "description text",
            "category text NOT NULL",
            "channel text NOT NULL",
            "status text NOT NULL DEFAULT 'draft'",
            "current_version_id uuid",
            "created_by uuid",
            "updated_by uuid",
            "created_at timestamptz NOT NULL DEFAULT now()",
            "updated_at timestamptz NOT NULL DEFAULT now()",
        ]) {
            expect(sql).toContain(col);
        }
    });

    it("declares the required version columns + immutability key", () => {
        for (const col of [
            "template_id uuid NOT NULL REFERENCES public.communication_templates (id) ON DELETE CASCADE",
            "version_number integer NOT NULL",
            "subject text",
            "body text NOT NULL DEFAULT ''",
            "token_paths text[] NOT NULL DEFAULT '{}'::text[]",
            "metadata jsonb NOT NULL DEFAULT '{}'::jsonb",
            "created_by uuid",
            "created_at timestamptz NOT NULL DEFAULT now()",
        ]) {
            expect(sql).toContain(col);
        }
        expect(sql).toMatch(/UNIQUE \(template_id, version_number\)/);
    });

    it("CHECK-constrains category to exactly the TS vocabulary", () => {
        const list = TEMPLATE_CATEGORIES.map((c) => `'${c}'`).join(", ");
        expect(sql).toContain(`CHECK (category IN (${list}))`);
    });

    it("CHECK-constrains channel to exactly the TS vocabulary", () => {
        const list = TEMPLATE_CHANNELS.map((c) => `'${c}'`).join(", ");
        expect(sql).toContain(`CHECK (channel IN (${list}))`);
    });

    it("CHECK-constrains status to exactly the TS vocabulary", () => {
        const list = TEMPLATE_STATUSES.map((c) => `'${c}'`).join(", ");
        expect(sql).toContain(`CHECK (status IN (${list}))`);
    });

    it("enables RLS with org-member SELECT + service_role ALL on both tables", () => {
        for (const t of Object.values(COMMS_V2_TEMPLATE_TABLES)) {
            expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
            expect(sql).toMatch(new RegExp(`${t}_select_org`));
            expect(sql).toMatch(new RegExp(`${t}_service_all`));
        }
    });

    it("grants to anon/authenticated/service_role on both tables", () => {
        for (const t of Object.values(COMMS_V2_TEMPLATE_TABLES)) {
            for (const role of ["anon", "authenticated", "service_role"]) {
                expect(sql).toContain(`GRANT ALL ON TABLE public.${t} TO ${role};`);
            }
        }
    });

    it("performs NO data backfill / seed (scope guard)", () => {
        expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
        expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
    });

    it("contains NO destructive DDL", () => {
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });

    it("keeps the bounded vocabularies the expected size", () => {
        expect(TEMPLATE_CATEGORIES.length).toBe(6);
        expect(TEMPLATE_CHANNELS.length).toBe(3);
        expect(TEMPLATE_STATUSES.length).toBe(3);
    });
});
