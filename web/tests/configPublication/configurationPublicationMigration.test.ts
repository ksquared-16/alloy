import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    resolve(
        process.cwd(),
        "../supabase/migrations/20260722020000_configuration_publication_runtime_v1.sql",
    ),
    "utf8",
);

describe("Configuration Publication Runtime migration", () => {
    it("keeps domain payloads separate from generic publication control records", () => {
        expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.program_drafts");
        expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.program_revisions");
        expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.configuration_publications");
        expect(migration).not.toMatch(
            /CREATE TABLE IF NOT EXISTS public\.configuration_(?:payloads|revision_payloads)/,
        );
    });

    it("enforces immutable revisions, publications, and delivery attempts", () => {
        for (const trigger of [
            "trg_program_revisions_immutable",
            "trg_configuration_publications_immutable",
            "trg_configuration_delivery_attempts_immutable",
        ]) {
            expect(migration).toContain(`CREATE TRIGGER ${trigger}`);
        }
        expect(migration).toContain("BEFORE UPDATE OR DELETE");
    });

    it("rejects unpublished delivery and preserves local operational truth", () => {
        expect(migration).toContain("published_program_revision_required");
        expect(migration).toContain("program_revision_id = EXCLUDED.program_revision_id");
        expect(migration).not.toContain("is_active = EXCLUDED.is_active");
        expect(migration).not.toContain("metadata = EXCLUDED.metadata");
    });

    it("uses one deterministic run and append-only attempts for retry", () => {
        expect(migration).toContain(
            "CONSTRAINT configuration_distribution_runs_idempotency_unique UNIQUE (org_id, idempotency_key)",
        );
        expect(migration).toContain(
            "CONSTRAINT configuration_delivery_attempts_target_number_unique UNIQUE (target_id, attempt_number)",
        );
        expect(migration).toContain("IF v_target.status IN ('delivered', 'unchanged')");
        expect(migration).toContain("assign_program_publication_target_v1");
        expect(migration).not.toContain("apply_program_publication_target_v1");
        expect(migration).toContain("record_configuration_delivery_failure_v1");
        expect(migration).toContain("partial_failure");
    });

    it("enables org-scoped RLS and keeps mutations service-only", () => {
        expect(migration).toContain("ALTER TABLE public.configuration_publications ENABLE ROW LEVEL SECURITY");
        expect(migration).toContain("public.has_org_role(org_id");
        expect(migration).toContain("FOR ALL TO service_role");
        expect(migration).toContain("GRANT SELECT ON TABLE public.%I TO authenticated");
    });
});
