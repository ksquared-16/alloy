/**
 * The legacy definition-driven executor asks the shared family-close rule (E2E-09).
 *
 * `POST /api/admin/actions/execute` falls back to `executeAdminAction` for any key that is not a
 * registered capability, and its `update_status` and `open_form` branches write
 * `opportunities.status_key` directly from a tenant `action_definitions` row. Those branches are
 * driven here against a fake database holding a family with a WAITLISTED child anchored to its
 * Enrollment Participation, and must refuse the close with no case write.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/assertRowOrg", () => ({ assertRowOrg: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/admin/actions/adminActionPreflight", () => ({
    preflightOpportunityActionOrNull: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/admin/actions/entryLifecycleActions", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/admin/actions/entryLifecycleActions")>()),
    validateOpportunityStatusTransitionForAction: vi.fn().mockResolvedValue({
        ok: true,
        existing: { status_key: "open", metadata: {} },
        oldStatusKey: "open",
    }),
}));
vi.mock("@/lib/opportunityIdentity", () => ({ normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({ emitStatusChangedEvent: vi.fn() }));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: vi.fn().mockResolvedValue("event-1") }));

import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

const ORG = "org-1";
const OPP = "opp-1";
const PARTICIPATION = "ocm-1";

type Rows = Record<string, Record<string, unknown>[]>;

function fakeDb(tables: Rows) {
    const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];
    const from = (table: string) => {
        const filters: Array<(row: Record<string, unknown>) => boolean> = [];
        const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: (col: string, val: unknown) => {
                filters.push((r) => r[col] === val);
                return builder;
            },
            in: (col: string, vals: unknown[]) => {
                filters.push((r) => vals.includes(r[col]));
                return builder;
            },
            or: () => builder,
            update: (patch: Record<string, unknown>) => {
                writes.push({ table, patch });
                return builder;
            },
            single: async () => ({ data: rows()[0] ?? null, error: null }),
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
        };
        return builder;
    };
    return { client: { from } as never, writes };
}

function family(childState: string, definitions: Record<string, unknown>[]): Rows {
    return {
        action_definitions: definitions.map((d) => ({ is_active: true, org_id: ORG, workflow_id: null, ...d })),
        opportunities: [{ id: OPP, org_id: ORG, status_key: "open", metadata: {} }],
        opportunity_customer_members: [{ id: PARTICIPATION, org_id: ORG, opportunity_id: OPP }],
        process_instances: [
            {
                id: "pi-1",
                org_id: ORG,
                process_key: ENROLLMENT_PROCESS_KEY,
                context_type: "enrollment_participation",
                context_id: PARTICIPATION,
                subject_id: "cust-child",
                state: childState,
            },
        ],
    };
}

const UPDATE_STATUS_DEF = {
    id: "def-1",
    key: "close_family_legacy",
    action_type: "update_status",
    entity_type: "opportunity",
    payload_schema: { status_key: "closed" },
};
const OPEN_FORM_DEF = {
    id: "def-2",
    key: "close_family_form",
    action_type: "open_form",
    entity_type: "opportunity",
    payload_schema: { form_key: "close_family", submit_action_type: "update_status", status_key: "closed" },
};
const OPEN_FORM_AFTER_DEF = {
    id: "def-3",
    key: "close_family_after",
    action_type: "open_form",
    entity_type: "opportunity",
    payload_schema: { form_key: "close_family", after: { update_status_key: "closed" } },
};

function run(client: never, actionKey: string) {
    return executeAdminAction(client, { orgId: ORG, userId: "user-1" } as never, {
        actionKey,
        entityType: "opportunity",
        entityId: OPP,
        payload: {},
    } as never);
}

const caseStatusWrites = (writes: Array<{ table: string; patch: Record<string, unknown> }>) =>
    writes.filter((w) => w.table === "opportunities" && "status_key" in w.patch);

beforeEach(() => vi.clearAllMocks());

describe("executeAdminAction legacy case-status writes ask the family-close rule", () => {
    it.each([
        ["update_status", UPDATE_STATUS_DEF],
        ["open_form submit update_status", OPEN_FORM_DEF],
        ["open_form after.update_status_key", OPEN_FORM_AFTER_DEF],
    ])("%s refuses a close while a child is waitlisted, writing nothing", async (_label, def) => {
        const { client, writes } = fakeDb(family("waitlisted", [def]));
        const result = await run(client, def.key);
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ status: 409 });
        expect((result as { error: string }).error).toMatch(/child enrollment tracks are still active/);
        expect(caseStatusWrites(writes)).toEqual([]);
    });

    it("update_status still closes a family whose children have all left", async () => {
        const { client, writes } = fakeDb(family("not_enrolling", [UPDATE_STATUS_DEF]));
        await run(client, UPDATE_STATUS_DEF.key);
        expect(caseStatusWrites(writes)).toEqual([{ table: "opportunities", patch: expect.objectContaining({ status_key: "closed" }) }]);
    });
});
