/**
 * BP V2 D1 — what publication provisioning will and will not write (no database).
 *
 * The live suite (`tests/businessProcesses/enrollmentDrawerProvisioning.live.test.ts`) proves the chain
 * on real tables; this file pins the decisions that a real database cannot produce on demand: an
 * unreadable read, an insert failure that is not a uniqueness loss, a throw inside provisioning, and the
 * exact default shape.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    classifyOpportunityDrawerOverrideRow,
    ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT,
    ensureEnrollmentOpportunityDrawerOverride,
    publishedEnrollmentStagedProcessKeys,
} from "@/lib/admin/enrollmentDrawerOverrideProvisioning";
import { applyEnrollmentTemplateInConfig } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { createLifecycleProcess, emptyLifecycleBuilderV1, type LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { LEGACY_OPPORTUNITY_DRAWER_LAYOUT_WRITE_PATHS } from "@/lib/layout/legacyOpportunityDrawerLayoutConvergence";

const ORG = "11111111-1111-4111-8111-111111111111";

function enrollmentPayload(): LifecycleBuilderV1 {
    const created = createLifecycleProcess("Enrollment", emptyLifecycleBuilderV1(), { primary_entity: "opportunity" });
    return applyEnrollmentTemplateInConfig(created, created.processes[0]!.id);
}
const projectionPayload = (domain: "assignments" | "billing"): LifecycleBuilderV1 =>
    createLifecycleProcess(domain, emptyLifecycleBuilderV1(), { process_model: { kind: "domain_projection", domain } });

type Row = { id: string; is_active: unknown; config_json: unknown };
/** A `from()` fake with one override slot. Records every write so "never writes" is checkable. */
function fakeClient(opts: {
    row?: Row | null;
    readError?: string;
    insertError?: { message: string; code?: string };
    rowAfterInsertError?: Row | null;
    throwOnRead?: boolean;
}) {
    const writes: Array<{ op: string; table: string; value?: unknown }> = [];
    let row = opts.row ?? null;
    let insertFailed = false;
    const client = {
        from(table: string) {
            const q: Record<string, unknown> = {};
            const filters: Record<string, unknown> = {};
            Object.assign(q, {
                select: () => q,
                eq: (k: string, v: unknown) => ((filters[k] = v), q),
                order: () => q,
                maybeSingle: async () => {
                    if (opts.throwOnRead) throw new Error("socket hang up");
                    if (table === "record_drawer_layouts") {
                        if (opts.readError) return { data: null, error: { message: opts.readError } };
                        if (insertFailed && opts.rowAfterInsertError !== undefined) row = opts.rowAfterInsertError;
                        const visible = filters.is_active === true ? (row && row.is_active === true ? row : null) : row;
                        return { data: visible, error: null };
                    }
                    return { data: null, error: null };
                },
                then: (resolveFn: (v: unknown) => unknown) =>
                    // record_layouts global fallback: classic default, like every real environment today.
                    resolveFn({ data: [{ id: "global", entity_type: "opportunity", key: "default", config_json: { version: 2 }, is_active: true, created_at: "2026-01-01" }], error: null }),
                insert: async (value: unknown) => {
                    writes.push({ op: "insert", table, value });
                    if (opts.insertError) {
                        insertFailed = true;
                        return { error: opts.insertError };
                    }
                    row = { id: "new", is_active: true, config_json: (value as { config_json: unknown }).config_json };
                    return { error: null };
                },
                update: (value: unknown) => {
                    writes.push({ op: "update", table, value });
                    return q;
                },
                delete: () => {
                    writes.push({ op: "delete", table });
                    return q;
                },
            });
            return q;
        },
    };
    return { client: client as unknown as SupabaseClient, writes };
}

describe("D1 — which publications provision", () => {
    it("an applied Enrollment template (staged lifecycle + family/child tracks) qualifies", () => {
        expect(publishedEnrollmentStagedProcessKeys(enrollmentPayload())).toEqual(["enrollment"]);
    });

    it("Assignments and Billing (domain projections) never qualify, nor does a staged process without the Enrollment tracks", () => {
        expect(publishedEnrollmentStagedProcessKeys(projectionPayload("assignments"))).toEqual([]);
        expect(publishedEnrollmentStagedProcessKeys(projectionPayload("billing"))).toEqual([]);
        const bare = createLifecycleProcess("Intake", emptyLifecycleBuilderV1(), { primary_entity: "opportunity" });
        expect(publishedEnrollmentStagedProcessKeys(bare)).toEqual([]);
        expect(publishedEnrollmentStagedProcessKeys(null)).toEqual([]);
    });

    it("an inactive Enrollment process does not qualify", () => {
        const p = enrollmentPayload();
        const inactive = { ...p, processes: p.processes.map((x) => ({ ...x, is_active: false })) };
        expect(publishedEnrollmentStagedProcessKeys(inactive)).toEqual([]);
    });

    it("a non-Enrollment publication reads and writes nothing", async () => {
        const { client, writes } = fakeClient({ throwOnRead: true });
        await expect(ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: projectionPayload("billing") })).resolves.toEqual({ status: "not_applicable" });
        expect(writes).toEqual([]);
    });
});

describe("D1 — the default is the migration-era shape, verbatim", () => {
    it("equals the config 20260430203000 wrote for every childcare org", () => {
        const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260430203000_childcare_opportunity_drawer_workflow_v3_layout.sql"), "utf8");
        const json = sql.split("$cfg$")[1]!;
        expect(ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT).toEqual(JSON.parse(json));
    });

    it("carries no tenant edits and is frozen", () => {
        expect(ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT).not.toHaveProperty("field_placements_v1");
        expect(Object.isFrozen(ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT)).toBe(true);
    });

    it("the publish route is registered as an audited record_drawer_layouts writer", () => {
        expect(LEGACY_OPPORTUNITY_DRAWER_LAYOUT_WRITE_PATHS.map((p) => p.id)).toContain("enrollment_publication_provisioning");
    });
});

describe("D1 — missing, unreadable and invalid are different answers", () => {
    it.each([
        [{ id: "a", is_active: true, config_json: { inquiry_drawer_mode: "workflow_v1", version: 9 } }, { kind: "workflow_v1", id: "a" }],
        [{ id: "b", is_active: true, config_json: { version: 2 } }, { kind: "conflicting", id: "b", inquiry_drawer_mode: null }],
        [{ id: "c", is_active: true, config_json: { inquiry_drawer_mode: "classic" } }, { kind: "conflicting", id: "c", inquiry_drawer_mode: "classic" }],
        [{ id: "d", is_active: false, config_json: { inquiry_drawer_mode: "workflow_v1" } }, { kind: "inactive", id: "d" }],
        [{ id: "e", is_active: true, config_json: [] }, { kind: "invalid", id: "e", reason: "config_json is not an object" }],
        [{ id: "f", is_active: true, config_json: null }, { kind: "invalid", id: "f", reason: "config_json is not an object" }],
        [{ id: "g", is_active: true, config_json: { inquiry_drawer_mode: 1 } }, { kind: "invalid", id: "g", reason: "inquiry_drawer_mode is not a string" }],
    ])("classifies %j", (row, expected) => {
        expect(classifyOpportunityDrawerOverrideRow(row)).toEqual(expected);
    });

    it("missing → provisions the default with one INSERT and no update", async () => {
        const { client, writes } = fakeClient({ row: null });
        const out = await ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: enrollmentPayload() });
        expect(out).toEqual({ status: "provisioned", processKeys: ["enrollment"] });
        expect(writes.map((w) => w.op)).toEqual(["insert"]);
        expect(writes[0]!.value).toMatchObject({ org_id: ORG, entity_type: "opportunity", surface: "drawer", key: "default", is_active: true, config_json: ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT });
    });

    it("unreadable → blocked, and nothing is written", async () => {
        const { client, writes } = fakeClient({ readError: "permission denied for table record_drawer_layouts" });
        const out = await ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: enrollmentPayload() });
        expect(out).toEqual({ status: "blocked", processKeys: ["enrollment"], state: { kind: "unreadable", error: "permission denied for table record_drawer_layouts" } });
        expect(writes).toEqual([]);
    });

    it.each([
        ["customized workflow_v1", { id: "w", is_active: true, config_json: { inquiry_drawer_mode: "workflow_v1", overview_section_order: ["x"] } }, "already_present"],
        ["classic override", { id: "c", is_active: true, config_json: { version: 2 } }, "blocked"],
        ["inactive override", { id: "i", is_active: false, config_json: { inquiry_drawer_mode: "workflow_v1" } }, "blocked"],
        ["malformed override", { id: "m", is_active: true, config_json: "nope" }, "blocked"],
    ])("%s → %s, and nothing is written", async (_label, row, status) => {
        const { client, writes } = fakeClient({ row });
        const out = await ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: enrollmentPayload() });
        expect(out.status).toBe(status);
        expect(writes).toEqual([]);
    });
});

describe("D1 — concurrency and failure are reported, never thrown", () => {
    it("losing the UNIQUE race to a workflow_v1 row → provisioned_concurrently (re-read, no retry, no update)", async () => {
        const { client, writes } = fakeClient({
            row: null,
            insertError: { message: "duplicate key value violates unique constraint", code: "23505" },
            rowAfterInsertError: { id: "winner", is_active: true, config_json: { inquiry_drawer_mode: "workflow_v1" } },
        });
        const out = await ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: enrollmentPayload() });
        expect(out).toEqual({ status: "provisioned_concurrently", processKeys: ["enrollment"], id: "winner" });
        expect(writes.map((w) => w.op)).toEqual(["insert"]);
    });

    it("losing the race to a non-workflow_v1 row → blocked with that row's classification", async () => {
        const { client } = fakeClient({
            row: null,
            insertError: { message: "duplicate key", code: "23505" },
            rowAfterInsertError: { id: "other", is_active: false, config_json: {} },
        });
        const out = await ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: enrollmentPayload() });
        expect(out).toEqual({ status: "blocked", processKeys: ["enrollment"], state: { kind: "inactive", id: "other" } });
    });

    it("an insert failure that is not a uniqueness loss → failed", async () => {
        const { client } = fakeClient({ row: null, insertError: { message: "new row violates row-level security policy", code: "42501" } });
        const out = await ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: enrollmentPayload() });
        expect(out).toEqual({ status: "failed", processKeys: ["enrollment"], error: "new row violates row-level security policy" });
    });

    it("a throw inside provisioning becomes a failed outcome (the publish it follows has already committed)", async () => {
        const { client } = fakeClient({ throwOnRead: true });
        const out = await ensureEnrollmentOpportunityDrawerOverride(client, { orgId: ORG, publishedPayload: enrollmentPayload() });
        expect(out).toEqual({ status: "failed", processKeys: ["enrollment"], error: "socket hang up" });
    });
});
