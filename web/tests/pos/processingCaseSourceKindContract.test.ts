import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract guard: the deployed source_kind vocabulary (chk_pcs_source_kind) must
 * stay aligned with the application path. Create Lead broke in staging because the
 * deployed CHECK constraint predated `create_lead`; this test pins the canonical
 * set so a migration that drops it (or code that adds a source_kind the constraint
 * omits) fails here instead of at an operator's 400.
 */

// Canonical processing_case_sources.source_kind vocabulary — mirrors the
// ProcessingCaseSourceKind union in web/lib/pos/processingCase/types.ts.
const CANONICAL_SOURCE_KINDS = [
    "form_submission",
    "form_packet_session",
    "document",
    "upload",
    "email_attachment",
    "import",
    "recreated_document",
    "create_lead",
] as const;

const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "supabase", "migrations");

/** The most recent migration that (re)asserts chk_pcs_source_kind. */
const REASSERT_MIGRATION = "20260724120000_processing_case_sources_reassert_source_kind_create_lead.sql";

function allowedSourceKindsFromMigration(file: string): string[] {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const add = sql.slice(sql.indexOf("ADD CONSTRAINT chk_pcs_source_kind"));
    const arrayBody = add.slice(add.indexOf("ARRAY["), add.indexOf("]"));
    return [...arrayBody.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
}

describe("processing_case_sources source_kind contract", () => {
    it("create_lead is part of the canonical vocabulary", () => {
        expect(CANONICAL_SOURCE_KINDS).toContain("create_lead");
    });

    it("the re-assertion migration permits exactly the canonical vocabulary", () => {
        const allowed = allowedSourceKindsFromMigration(REASSERT_MIGRATION);
        expect([...allowed].sort()).toEqual([...CANONICAL_SOURCE_KINDS].sort());
    });

    it("the Create Lead adapter submits an allowed source_kind", () => {
        const adapter = readFileSync(
            join(__dirname, "..", "..", "lib", "pos", "processingIdentity", "sources", "createLeadIntakeAdapter.ts"),
            "utf8",
        );
        // openProcessingCaseFromSource(..., { sourceKind: "create_lead", ... })
        const match = adapter.match(/sourceKind:\s*"([a-z_]+)"/);
        expect(match, "adapter must set a sourceKind").not.toBeNull();
        expect(CANONICAL_SOURCE_KINDS).toContain(match![1] as (typeof CANONICAL_SOURCE_KINDS)[number]);
    });
});
