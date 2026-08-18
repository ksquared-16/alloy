/**
 * The D-97 rebase write inside `publishDraft` must advance the draft-edit token.
 *
 * ## The defect this pins
 *
 * `guard_business_process_draft_revision` makes the optimistic token STRUCTURAL: a payload change
 * that does not advance `draft_revision` by exactly one is refused by the database. `publishDraft`
 * writes the normalized payload back to the draft before the RPC reads it — a payload change — and
 * pinned the token instead of advancing it. Every publish that normalization touched was therefore
 * refused.
 *
 * That is not a rare path. It is every tenant's FIRST publish after D-97: theirs is the only case
 * where stages still lack `requirements_v1`, so normalization has something to do. Firefly hit it
 * exactly there, and the trigger's refusal arrived as a dropped socket with no PostgREST detail —
 * which is why it read as a network fault across two attempts before the guard was the suspect.
 *
 * The test asserts the UPDATE's shape rather than its effect, because the effect is a trigger and a
 * unit test has no Postgres. The trigger's own definition is pinned below so the contract this
 * write must satisfy cannot be quietly relaxed on the other side.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { publishDraft } from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";

const ORG = "11111111-1111-4111-8111-111111111111";
const DEPT = "22222222-2222-4222-8222-222222222222";

const GUARD_MIGRATION = readFileSync(
    resolve(__dirname, "../../../supabase/migrations/20260731120000_business_process_draft_revision_cas.sql"),
    "utf8",
);

describe("the database contract this write has to satisfy", () => {
    it("refuses a payload change that does not advance the token by exactly one", () => {
        expect(GUARD_MIGRATION).toContain("IF NEW.draft_revision <> OLD.draft_revision + 1 THEN");
        expect(GUARD_MIGRATION).toContain("business_process_draft_revision_not_advanced");
    });
});

/**
 * A draft whose stages carry no `requirements_v1`, so normalization has work to do — the condition
 * that makes the rebase write happen at all.
 */
const DRAFT_PAYLOAD = {
    version: 1,
    active_process_id: "proc-1",
    processes: [
        {
            id: "proc-1",
            key: "enrollment",
            name: "Enrollment",
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            stages: [{ id: "s-lead", key: "lead", label: "Lead", sort_order: 0, is_active: true }],
        },
    ],
};

type Captured = { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> };

function harness(draftRevision: number) {
    const captured: Captured[] = [];

    const client = {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            let patch: Record<string, unknown> = {};
            let mode: "select" | "update" = "select";
            const q: Record<string, unknown> = {
                select: () => q,
                update: (p: Record<string, unknown>) => {
                    mode = "update";
                    patch = p;
                    return q;
                },
                eq: (col: string, val: unknown) => {
                    filters[col] = val;
                    return q;
                },
                async maybeSingle() {
                    if (mode === "update") {
                        captured.push({ table, patch, filters });
                        return { data: { id: "draft-1" }, error: null };
                    }
                    if (table === "business_process_drafts") {
                        return {
                            data: {
                                id: "draft-1",
                                department_id: DEPT,
                                payload: DRAFT_PAYLOAD,
                                base_revision_id: "rev-12",
                                draft_revision: draftRevision,
                                draft_status: "validated",
                                validation_errors: [],
                            },
                            error: null,
                        };
                    }
                    if (table === "departments") return { data: { metadata: {} }, error: null };
                    return { data: null, error: null };
                },
            };
            return q;
        },
        rpc: vi.fn(async () => ({
            data: {
                department_id: DEPT,
                revision_id: "rev-13",
                revision_number: 13,
                publication_id: "pub-13",
                published_at: "2026-08-17T00:00:00.000Z",
                already_published: false,
            },
            error: null,
        })),
    };

    return { client: client as never, captured };
}

describe("publishDraft rebases the normalized payload as a real draft edit", () => {
    it("advances draft_revision by exactly one while compare-and-setting on the loaded value", async () => {
        const { client, captured } = harness(36);

        const result = await publishDraft(client, { orgId: ORG, departmentId: DEPT });
        expect(result.revisionNumber).toBe(13);

        const rebase = captured.find((c) => c.table === "business_process_drafts");
        expect(rebase, "normalization must write the payload back before the RPC reads it").toBeTruthy();

        // The payload moved, so the token must move with it — this is the whole defect.
        expect(rebase!.patch.draft_revision).toBe(37);
        expect(rebase!.patch.payload).toBeTruthy();

        // And the compare-and-set still pins the value that was LOADED, not the new one, or a
        // concurrent save between read and write would be silently overwritten.
        expect(rebase!.filters.draft_revision).toBe(36);
        expect(rebase!.filters.org_id).toBe(ORG);
    });

    it("leaves validation alone — materializing requirements cannot invalidate a validated draft", async () => {
        const { client, captured } = harness(1);
        await publishDraft(client, { orgId: ORG, departmentId: DEPT });

        const rebase = captured.find((c) => c.table === "business_process_drafts")!;
        expect(Object.keys(rebase.patch).sort()).toEqual(["draft_revision", "payload"]);
    });
});
