import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    COMMS_V2_TEMPLATE_TABLES,
    TEMPLATE_CHANNELS,
    TEMPLATE_STATUSES,
} from "@/lib/communications/v2/templateSchema";

/**
 * Comms V2 Phase 1 / B1 — templates + immutable versions schema contract.
 * Additive-only; CHECK-constrained vocabularies kept in sync with templateSchema.ts;
 * RLS: org-member SELECT + service_role ALL. No APIs/UI/announcements/provider/seed.
 */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function readMigration(matcher: (name: string) => boolean): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find(matcher);
    expect(file, "expected migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

const b1Sql = readMigration((f) => f.includes("comms_v2_templates.sql") && !f.includes("announcements") && !f.includes("align"));
const alignSql = readMigration((f) => f.includes("comms_v2_templates_schema_align"));

describe("B1 templates + versions migration", () => {
    it("creates both additive tables", () => {
        for (const t of Object.values(COMMS_V2_TEMPLATE_TABLES)) {
            expect(b1Sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
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
            expect(b1Sql).toContain(col);
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
            expect(b1Sql).toContain(col);
        }
        expect(b1Sql).toMatch(/UNIQUE \(template_id, version_number\)/);
    });

    it("CHECK-constrains channel to exactly the TS vocabulary", () => {
        const list = TEMPLATE_CHANNELS.map((c) => `'${c}'`).join(", ");
        expect(b1Sql).toContain(`CHECK (channel IN (${list}))`);
    });

    it("CHECK-constrains status to exactly the TS vocabulary", () => {
        const list = TEMPLATE_STATUSES.map((c) => `'${c}'`).join(", ");
        expect(b1Sql).toContain(`CHECK (status IN (${list}))`);
    });

    it("enables RLS with org-member SELECT + service_role ALL on both tables", () => {
        for (const t of Object.values(COMMS_V2_TEMPLATE_TABLES)) {
            expect(b1Sql).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
            expect(b1Sql).toMatch(new RegExp(`${t}_select_org`));
            expect(b1Sql).toMatch(new RegExp(`${t}_service_all`));
        }
    });

    it("grants to anon/authenticated/service_role on both tables", () => {
        for (const t of Object.values(COMMS_V2_TEMPLATE_TABLES)) {
            for (const role of ["anon", "authenticated", "service_role"]) {
                expect(b1Sql).toContain(`GRANT ALL ON TABLE public.${t} TO ${role};`);
            }
        }
    });

    it("performs NO data backfill / seed (scope guard)", () => {
        expect(b1Sql).not.toMatch(/\bINSERT\s+INTO\b/i);
        expect(b1Sql).not.toMatch(/\bUPDATE\s+public\./i);
    });

    it("contains NO destructive DDL", () => {
        expect(b1Sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(b1Sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(b1Sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });

    it("keeps the bounded channel/status vocabularies the expected size", () => {
        expect(TEMPLATE_CHANNELS.length).toBe(3);
        expect(TEMPLATE_STATUSES.length).toBe(3);
    });
});

describe("templates schema align migration (PKG-05 → B2 API)", () => {
    it("adds description and B2 API columns when PKG-05 table already exists", () => {
        expect(alignSql).toContain("ADD COLUMN IF NOT EXISTS description text NULL");
        expect(alignSql).toContain("ADD COLUMN IF NOT EXISTS status text NULL");
        expect(alignSql).toContain("ADD COLUMN IF NOT EXISTS version_number integer NULL");
        expect(alignSql).toContain("ADD COLUMN IF NOT EXISTS token_paths text[]");
    });

    it("drops enum category CHECK so category stays org-defined free text", () => {
        expect(alignSql).toContain("DROP CONSTRAINT IF EXISTS communication_templates_category_check");
    });
});
