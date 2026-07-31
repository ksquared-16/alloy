/**
 * Law 4 — Revision Integrity, as a Configuration Publication model.
 *
 * These lock the guarantees of the business-process publication migration in CI. The behavioural
 * proof runs against real Postgres (certification/bp-config-integrity/); this file guards the
 * contract so a later edit cannot quietly remove the parts that make Law 4 hold.
 *
 * Design: docs/platform/governance/configuration-publication-model.md
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";

const migration = readFileSync(
    resolve(
        process.cwd(),
        "../supabase/migrations/20260730120000_business_process_configuration_publication_v1.sql",
    ),
    "utf8",
);

const programsMigration = readFileSync(
    resolve(
        process.cwd(),
        "../supabase/migrations/20260722020000_configuration_publication_runtime_v1.sql",
    ),
    "utf8",
);

describe("Business Process Configuration Publication migration", () => {
    it("reuses the generic publication runtime instead of inventing a second model", () => {
        // Registers as a domain on the shared table...
        expect(migration).toContain("'business_process'");
        expect(migration).toContain("INSERT INTO public.configuration_publications");
        // ...and reuses the generic immutability guard rather than defining its own.
        expect(migration).toContain(
            "EXECUTE FUNCTION public.configuration_publication_immutable_guard()",
        );
        expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.configuration_publication_immutable_guard");
        // No parallel publication/control table.
        expect(migration).not.toMatch(
            /CREATE TABLE IF NOT EXISTS public\.business_process_publications/,
        );
    });

    it("keeps the domain payload in a domain-owned table, never in the generic one", () => {
        expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.business_process_drafts");
        expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.business_process_revisions");
        expect(migration).toContain("payload jsonb NOT NULL");
    });

    it("blocks a stale draft from overwriting a newer publication — the Law 4 boundary", () => {
        // The comparison the Programs implementation is missing.
        expect(migration).toContain("v_draft.base_revision_id IS DISTINCT FROM v_current_revision_id");
        expect(migration).toContain("business_process_draft_stale");
        // Surfaced as a serialization failure so callers can map it to a 409.
        expect(migration).toContain("ERRCODE = '40001'");
        // The conflict names both sides so the operator can reconcile.
        expect(migration).toContain("current_revision=%");
        expect(migration).toContain("attempted_base=%");
    });

    it("locks the subject row before allocating a revision number", () => {
        // max+1 is only race-safe under the subject lock.
        expect(migration).toContain("FROM public.departments");
        expect(migration).toContain("FOR UPDATE");
        expect(migration).toContain("coalesce(max(revision_number), 0) + 1");
        expect(migration).toContain("business_process_revisions_number_unique");
    });

    it("refuses to publish an invalid draft, while allowing an invalid draft to exist", () => {
        expect(migration).toContain("business_process_draft_not_validated");
        // Drafts may be invalid: the CHECK only constrains the *validated* state.
        expect(migration).toContain("business_process_drafts_validation_shape");
        expect(migration).toContain("(draft_status = 'draft')");
    });

    it("makes revisions immutable", () => {
        expect(migration).toContain("CREATE TRIGGER trg_business_process_revisions_immutable");
        expect(migration).toContain("BEFORE UPDATE OR DELETE ON public.business_process_revisions");
    });

    it("rolls back forward-only, never by rewriting history", () => {
        expect(migration).toContain(
            "CREATE OR REPLACE FUNCTION public.rollback_business_process_to_revision_v1",
        );
        expect(migration).toContain("rolled_back_from_revision_id");
        // Rollback inserts a new revision; it must not UPDATE or DELETE existing revisions.
        expect(migration).not.toMatch(/UPDATE public\.business_process_revisions/);
        expect(migration).not.toMatch(/DELETE FROM public\.business_process_revisions/);
    });

    it("writes the runtime projection in the same transaction as the revision", () => {
        // Publication and runtime can never disagree if they commit together.
        expect(migration).toContain("jsonb_set(v_metadata, '{lifecycle_builder_v1}'");
        expect(migration).toContain("UPDATE public.departments");
    });

    it("restricts execution to the service role", () => {
        for (const fn of [
            "publish_business_process_revision_v1(uuid, uuid, uuid, text)",
            "rollback_business_process_to_revision_v1(uuid, uuid, uuid, uuid)",
        ]) {
            expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC`);
            expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role`);
        }
    });
});

describe("Programs publication — the gap this domain deliberately does not inherit", () => {
    it("documents that the Programs publish RPC writes base_revision_id but never compares it", () => {
        // Provenance is written...
        expect(programsMigration).toContain("SET base_revision_id = v_revision.id");
        // ...but no staleness comparison exists anywhere in that migration.
        expect(programsMigration).not.toContain("IS DISTINCT FROM v_current_revision_id");
        expect(programsMigration).not.toContain("draft_stale");
    });
});

describe("businessProcessPayloadChecksum", () => {
    it("is stable across key order", () => {
        const a = { version: 1, active_process_id: "p1", processes: [{ id: "x", key: "k" }] };
        const b = { processes: [{ key: "k", id: "x" }], active_process_id: "p1", version: 1 };
        expect(businessProcessPayloadChecksum(a)).toBe(businessProcessPayloadChecksum(b));
    });

    it("changes when configuration changes", () => {
        const a = { version: 1, processes: [{ id: "x" }] };
        const b = { version: 1, processes: [{ id: "y" }] };
        expect(businessProcessPayloadChecksum(a)).not.toBe(businessProcessPayloadChecksum(b));
    });

    it("does not treat array order as insignificant", () => {
        // Stage/process order is meaningful configuration, so it must affect the checksum.
        const a = { processes: [{ id: "a" }, { id: "b" }] };
        const b = { processes: [{ id: "b" }, { id: "a" }] };
        expect(businessProcessPayloadChecksum(a)).not.toBe(businessProcessPayloadChecksum(b));
    });

    it("covers fields preserved by the Law 7 unknown-field carrier", () => {
        // A field this branch does not own still changes the checksum, so a newer writer's
        // configuration cannot be silently republished as identical.
        const withUnknown = { version: 1, processes: [{ id: "x", row_grain_v1: { grain: "child" } }] };
        const without = { version: 1, processes: [{ id: "x" }] };
        expect(businessProcessPayloadChecksum(withUnknown)).not.toBe(
            businessProcessPayloadChecksum(without),
        );
    });

    it("matches a plain sha256 over canonically ordered JSON", () => {
        const payload = { b: 2, a: 1 };
        const expected = createHash("sha256")
            .update(JSON.stringify({ a: 1, b: 2 }))
            .digest("hex");
        expect(businessProcessPayloadChecksum(payload)).toBe(expected);
    });
});
