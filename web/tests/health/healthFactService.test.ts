import { describe, expect, it } from "vitest";

import { editHealthFact, endHealthFact, addHealthFact, HealthFactError } from "@/lib/health/healthFactService";
import { HealthAccessDeniedError } from "@/lib/health/healthAccess";

/** A caller holding the manage grant. */
const MANAGER = { permissionKeys: ["health.view", "health.manage"] };
/** A caller who may READ health but not change it — the separation D-H6 exists for. */
const VIEWER = { permissionKeys: ["health.view"] };
/** A grant read that FAILED. Not the same answer as "no grants", and it must deny. */
const GRANT_READ_FAILED = { permissionKeys: null };

/**
 * A stub that records the ORDER of writes, because ordering is the safety property under test.
 */
function stubClient(seed: Record<string, unknown>) {
    const calls: string[] = [];
    const client = {
        from() {
            return {
                _op: "",
                _payload: null as unknown,
                insert(payload: unknown) {
                    calls.push("insert");
                    this._op = "insert";
                    this._payload = payload;
                    return this;
                },
                update(payload: unknown) {
                    calls.push("update");
                    this._op = "update";
                    this._payload = payload;
                    return this;
                },
                select() {
                    return this;
                },
                eq() {
                    return this;
                },
                maybeSingle() {
                    if (this._op === "update") {
                        return Promise.resolve({
                            data: { ...seed, ...(this._payload as object) },
                            error: null,
                        });
                    }
                    return Promise.resolve({ data: seed, error: null });
                },
                single() {
                    return Promise.resolve({
                        data: { ...seed, id: "new-fact", ...(this._payload as object) },
                        error: null,
                    });
                },
            };
        },
    } as never;
    return { client, calls };
}

const ACTIVE_ALLERGY = {
    id: "fact-1",
    org_id: "org-1",
    subject_entity_type: "customer_member",
    subject_entity_id: "child-1",
    fact_kind: "allergy",
    payload: { allergen: "Peanut", severity: "severe" },
    status: "active",
    effective_from: "2026-01-01",
    effective_to: null,
    source_kind: "operator",
    source_ref: null,
    supersedes_id: null,
    related_fact_id: null,
    metadata: {},
};

describe("health fact mutation — the one canonical seam", () => {
    it("writes the SUCCESSOR before closing the original", async () => {
        // If the process dies between the two writes, the subject has two ACTIVE facts — visibly
        // duplicated, and obvious. Closing first would leave a window with NO recorded allergy,
        // which is the failure that hurts someone. Health takes the duplicate over the absence.
        const { client, calls } = stubClient(ACTIVE_ALLERGY);
        await editHealthFact(client, {
            access: MANAGER,
            orgId: "org-1",
            factId: "fact-1",
            payload: { allergen: "Peanut", severity: "life_threatening" },
            sourceKind: "operator",
        });
        expect(calls).toEqual(["select-or-load", "insert", "update"].filter((c) => c !== "select-or-load"));
        expect(calls.indexOf("insert")).toBeLessThan(calls.indexOf("update"));
    });

    it("refuses to correct a fact that is no longer active", async () => {
        const { client } = stubClient({ ...ACTIVE_ALLERGY, status: "superseded" });
        await expect(
            editHealthFact(client, {
                access: MANAGER,
                orgId: "org-1",
                factId: "fact-1",
                payload: { allergen: "Peanut" },
                sourceKind: "operator",
            }),
        ).rejects.toBeInstanceOf(HealthFactError);
    });

    it("refuses a correction with no payload — a partial patch is an incomplete fact", async () => {
        const { client } = stubClient(ACTIVE_ALLERGY);
        await expect(
            editHealthFact(client, { access: MANAGER, orgId: "org-1", factId: "fact-1", payload: {}, sourceKind: "operator" }),
        ).rejects.toThrow(/full corrected payload/);
    });

    it("ends a fact by setting status and a closing date, never by deleting", async () => {
        const { client, calls } = stubClient(ACTIVE_ALLERGY);
        const out = await endHealthFact(client, { access: MANAGER, orgId: "org-1", factId: "fact-1", reason: "outgrown" });
        expect(out.status).toBe("ended");
        expect(out.effective_to).toBeTruthy();
        expect(calls).not.toContain("delete");
    });

    it("requires provenance — a fact with no answer to 'who said so' cannot be acted on", async () => {
        const { client } = stubClient(ACTIVE_ALLERGY);
        await expect(
            addHealthFact(client, {
                access: MANAGER,
                orgId: "org-1",
                subjectEntityType: "customer_member",
                subjectEntityId: "child-1",
                factKind: "allergy",
                payload: { allergen: "Peanut" },
                sourceKind: "" as never,
            }),
        ).rejects.toThrow(/source_kind is required/);
    });

    it("refuses an empty payload rather than storing a fact that says nothing", async () => {
        const { client } = stubClient(ACTIVE_ALLERGY);
        await expect(
            addHealthFact(client, {
                access: MANAGER,
                orgId: "org-1",
                subjectEntityType: "customer_member",
                subjectEntityId: "child-1",
                factKind: "allergy",
                payload: {},
                sourceKind: "operator",
            }),
        ).rejects.toThrow(/needs a payload/);
    });
});

describe("D-H6 — the mutation seam refuses without the manage grant", () => {
    it("refuses add, edit and end to a caller who may only VIEW health", async () => {
        // `health.manage` does not follow from `health.view`: recording a medication and browsing a
        // child's conditions are different authorities and are asked separately.
        const { client } = stubClient(ACTIVE_ALLERGY);
        await expect(
            addHealthFact(client, {
                access: VIEWER,
                orgId: "org-1",
                subjectEntityType: "customer_member",
                subjectEntityId: "child-1",
                factKind: "allergy",
                payload: { allergen: "Peanut" },
                sourceKind: "operator",
            }),
        ).rejects.toBeInstanceOf(HealthAccessDeniedError);
        await expect(
            editHealthFact(client, {
                access: VIEWER,
                orgId: "org-1",
                factId: "fact-1",
                payload: { allergen: "Peanut" },
                sourceKind: "operator",
            }),
        ).rejects.toBeInstanceOf(HealthAccessDeniedError);
        await expect(
            endHealthFact(client, { access: VIEWER, orgId: "org-1", factId: "fact-1" }),
        ).rejects.toBeInstanceOf(HealthAccessDeniedError);
    });

    it("DENIES when the grant read failed — null is not an empty grant set", async () => {
        // W-43: collapsing a failed read onto `[]` makes the failure OPEN for every surface that
        // gates on admission alone. For health it closes.
        const { client } = stubClient(ACTIVE_ALLERGY);
        await expect(
            endHealthFact(client, { access: GRANT_READ_FAILED, orgId: "org-1", factId: "fact-1" }),
        ).rejects.toBeInstanceOf(HealthAccessDeniedError);
    });

    it("refuses BEFORE touching the database", async () => {
        const { client, calls } = stubClient(ACTIVE_ALLERGY);
        await expect(
            endHealthFact(client, { access: VIEWER, orgId: "org-1", factId: "fact-1" }),
        ).rejects.toBeInstanceOf(HealthAccessDeniedError);
        expect(calls).toEqual([]);
    });
});
