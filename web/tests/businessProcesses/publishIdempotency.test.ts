/**
 * Publishing the same effective draft twice must not mint a second immutable revision.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. The real protection against two CONCURRENT publishes is a
 * database unique index — application checks cannot provide it, because both requests pass their
 * "already published?" test before either has written. A unit test cannot execute that either. So
 * this file proves the two halves it can reach:
 *
 *   1. the invariant EXISTS and has the right shape (the migration is read and asserted)
 *   2. the service THREADS the no-op faithfully (a fake RPC, no database)
 *
 * Live concurrent execution against Postgres is NOT run here — the shared local stack was not
 * running and this repository forbids starting a private one. That gap is stated rather than
 * papered over: the index is the guarantee, and its definition is pinned below so it cannot be
 * quietly weakened.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
    resolve(__dirname, "../../../supabase/migrations/20260807090000_business_process_publish_idempotency.sql"),
    "utf8",
);

describe("the invariant is enforced by the database, not by application checks", () => {
    it("declares a UNIQUE index over the publication identity", () => {
        expect(MIGRATION).toContain("CREATE UNIQUE INDEX IF NOT EXISTS business_process_revisions_publication_identity_unique");
    });

    it("keys that identity on payload + predecessor, per subject", () => {
        const index = MIGRATION.slice(
            MIGRATION.indexOf("business_process_revisions_publication_identity_unique"),
            MIGRATION.indexOf("COMMENT ON INDEX"),
        );
        for (const column of ["org_id", "department_id", "payload_checksum", "published_from_revision_id"]) {
            expect(index, `identity must include ${column}`).toContain(column);
        }
    });

    it("collapses NULL predecessors with a sentinel, or two FIRST publishes could both win", () => {
        // In PostgreSQL two NULLs are distinct, so a bare UNIQUE would not constrain the very first
        // publish — the case with no earlier revision to compare against.
        expect(MIGRATION).toContain("coalesce(published_from_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)");
    });

    it("records the predecessor on every insert path, including rollback", () => {
        const inserts = MIGRATION.split("INSERT INTO public.business_process_revisions").slice(1);
        expect(inserts.length).toBeGreaterThanOrEqual(2); // publish + rollback
        for (const insert of inserts) {
            expect(insert.slice(0, 400)).toContain("published_from_revision_id");
        }
    });

    it("backfills existing history rather than leaving it unconstrained", () => {
        expect(MIGRATION).toContain("UPDATE public.business_process_revisions r");
        expect(MIGRATION).toContain("lag(id) OVER (PARTITION BY org_id, department_id ORDER BY revision_number)");
    });

    it("does not delete the historical duplicate — evidence stays evidence", () => {
        expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.business_process_revisions/i);
    });
});

describe("publish short-circuits before writing anything", () => {
    const publishFn = MIGRATION.slice(
        MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.publish_business_process_revision_v1"),
        MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.rollback_business_process_to_revision_v1"),
    );
    const shortCircuit = publishFn.slice(
        publishFn.indexOf("IF v_current_revision_id IS NOT NULL"),
        publishFn.indexOf("SELECT coalesce(max(revision_number), 0) + 1"),
    );

    it("compares the draft's checksum against what is currently published", () => {
        expect(shortCircuit).toContain("v_current_checksum IS NOT DISTINCT FROM btrim(p_payload_checksum)");
    });

    it("returns the EXISTING identity, flagged as already published", () => {
        expect(shortCircuit).toContain("'already_published', true");
        expect(shortCircuit).toContain("v_existing.id");
        expect(shortCircuit).toContain("v_existing.revision_number");
    });

    it("writes nothing on that path — no revision, publication, event or projection", () => {
        expect(shortCircuit).not.toMatch(/INSERT\s+INTO/i);
        expect(shortCircuit).not.toMatch(/UPDATE\s+public\.departments/i);
        expect(shortCircuit).not.toMatch(/UPDATE\s+public\.business_process_drafts/i);
    });

    it("still refuses a STALE draft first — a no-op must not mask a conflict", () => {
        expect(publishFn.indexOf("business_process_draft_stale")).toBeLessThan(
            publishFn.indexOf("IF v_current_revision_id IS NOT NULL"),
        );
    });

    it("still refuses an INVALID draft before considering idempotency", () => {
        expect(publishFn.indexOf("business_process_draft_not_validated")).toBeLessThan(
            publishFn.indexOf("IF v_current_revision_id IS NOT NULL"),
        );
    });

    it("converges rather than failing when a concurrent writer wins the index", () => {
        expect(publishFn).toContain("EXCEPTION WHEN unique_violation THEN");
        const handler = publishFn.slice(publishFn.indexOf("EXCEPTION WHEN unique_violation THEN"));
        expect(handler).toContain("'already_published', true");
    });

    it("a genuinely new payload still takes the writing path", () => {
        // The insert, the publication row and the projection update all still exist below the
        // short-circuit — idempotency must not have removed the ability to publish.
        const writing = publishFn.slice(publishFn.indexOf("SELECT coalesce(max(revision_number), 0) + 1"));
        expect(writing).toContain("INSERT INTO public.business_process_revisions");
        expect(writing).toContain("INSERT INTO public.configuration_publications");
        expect(writing).toContain("UPDATE public.departments");
        expect(writing).toContain("'already_published', false");
    });

    it("preserves the projection guard by writing the projection inside the same function", () => {
        expect(publishFn).toContain("SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}'");
    });
});

// ── service threading ────────────────────────────────────────────────────────────────────────

const invalidate = vi.fn();
vi.mock("@/lib/runtime/provisioning/configReadCache", () => ({
    invalidateTenantConfigReadCache: (...args: unknown[]) => invalidate(...args),
}));

/** A validated draft plus a scripted RPC reply. No database. */
function makeSupabase(rpcReply: Record<string, unknown>) {
    const rpc = vi.fn(async () => ({ data: rpcReply, error: null }));
    const supabase = {
        rpc,
        from() {
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.maybeSingle = async () => ({
                data: {
                    id: "draft-1",
                    department_id: "dept-1",
                    payload: { version: 1, processes: [] },
                    base_revision_id: "rev-1",
                    draft_revision: 4,
                    draft_status: "validated",
                    validation_errors: [],
                },
                error: null,
            });
            return chain;
        },
    } as never;
    return { supabase, rpc };
}

describe("the service reports a sequential retry as a no-op", () => {
    it("returns the EXISTING identity and does not evict warm config", async () => {
        invalidate.mockClear();
        const { publishDraft } = await import(
            "@/lib/businessProcesses/configuration/businessProcessConfigurationService"
        );
        const { supabase } = makeSupabase({
            department_id: "dept-1",
            revision_id: "rev-1",
            revision_number: 1,
            publication_id: "pub-1",
            published_at: "2026-08-07T00:00:00Z",
            already_published: true,
        });

        const result = await publishDraft(supabase, { orgId: "org-1", departmentId: "dept-1" });

        expect(result.alreadyPublished).toBe(true);
        // Stable identity across the retry: the caller gets revision 1 back, not a new number.
        expect(result.revisionId).toBe("rev-1");
        expect(result.revisionNumber).toBe(1);
        expect(invalidate).not.toHaveBeenCalled();
    });

    it("a genuine first publish reports a change and DOES evict", async () => {
        invalidate.mockClear();
        const { publishDraft } = await import(
            "@/lib/businessProcesses/configuration/businessProcessConfigurationService"
        );
        const { supabase } = makeSupabase({
            department_id: "dept-1",
            revision_id: "rev-2",
            revision_number: 2,
            publication_id: "pub-2",
            published_at: "2026-08-07T00:01:00Z",
            already_published: false,
        });

        const result = await publishDraft(supabase, { orgId: "org-1", departmentId: "dept-1" });

        expect(result.alreadyPublished).toBe(false);
        expect(result.revisionNumber).toBe(2);
        expect(invalidate).toHaveBeenCalledWith("org-1");
    });

    it("the wire contract carries already_published", () => {
        const route = readFileSync(
            resolve(__dirname, "../../app/api/admin/business-process/configuration/publish/route.ts"),
            "utf8",
        );
        expect(route).toContain("already_published: result.alreadyPublished");
    });

    it("a no-op does not evict warm tenant config", () => {
        const service = readFileSync(
            resolve(__dirname, "../../lib/businessProcesses/configuration/businessProcessConfigurationService.ts"),
            "utf8",
        );
        // Both publish and rollback gate the invalidation on something having actually changed.
        const guarded = service.match(/if \(!result\.alreadyPublished\) invalidateTenantConfigReadCache/g) ?? [];
        expect(guarded.length).toBe(2);
    });
});
