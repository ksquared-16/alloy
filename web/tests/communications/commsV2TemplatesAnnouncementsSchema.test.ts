import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    COMMS_V2_TEMPLATE_TABLES,
    COMMS_V2_ANNOUNCEMENT_TABLES,
} from "@/lib/communications/v2/templatesAnnouncements";

/** PKG-05 — templates + announcements schema contract (additive only). */

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");
const ALL_TABLES = [
    ...Object.values(COMMS_V2_TEMPLATE_TABLES),
    ...Object.values(COMMS_V2_ANNOUNCEMENT_TABLES),
];

function migrationSql(): string {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes("comms_v2_templates_announcements"));
    expect(file, "PKG-05 migration present").toBeTruthy();
    return readFileSync(join(MIGRATIONS_DIR, file!), "utf8");
}

describe("PKG-05 templates + announcements migration", () => {
    const sql = migrationSql();

    it("creates all six additive tables", () => {
        for (const t of ALL_TABLES) {
            expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
        }
    });

    it("bounds template channel + approval status", () => {
        expect(sql).toMatch(/channel text NOT NULL CHECK \(channel IN \('email', 'sms'\)\)/);
        expect(sql).toMatch(/approval_status text NOT NULL DEFAULT 'draft' CHECK \(approval_status IN \('draft', 'pending', 'approved'\)\)/);
    });

    it("versions are unique per template and snippets/templates unique per org name", () => {
        expect(sql).toMatch(/UNIQUE \(template_id, version\)/);
        expect(sql).toMatch(/communication_templates_org_name_uq UNIQUE \(org_id, name\)/);
        expect(sql).toMatch(/communication_snippets_org_name_uq UNIQUE \(org_id, name\)/);
    });

    it("enables RLS with org-member SELECT + service_role ALL on every table", () => {
        for (const t of ALL_TABLES) {
            expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
            expect(sql).toMatch(new RegExp(`CREATE POLICY ${t}_select_org`));
            expect(sql).toMatch(new RegExp(`CREATE POLICY ${t}_service_all`));
        }
    });

    it("performs NO data mutation and NO destructive DDL (scope guard)", () => {
        expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
        expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });
});
